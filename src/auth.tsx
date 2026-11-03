import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { canUse, type Area } from './lib/access';
import type { FeatureKey, Location, OrgInfo, User } from './types';

interface Session {
  user: User;
  org: OrgInfo | null;
  locations: Location[];
}

interface AuthContextValue {
  user: User | null;
  org: OrgInfo | null;
  locations: Location[];
  location: Location | null;
  setLocationId: (id: string) => void;
  loading: boolean;
  /** Set when the session check failed for a reason other than being signed out. */
  loadError: Error | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

declare global {
  interface Window {
    /** Started by public/session.js before the app loaded: the session, null when signed out, or null itself when it could not tell. */
    __cpSession?: Promise<{ session: Session | null } | null>;
  }
}

/** The answer public/session.js already asked for, once; later checks (and anything unexpected) go to the server as usual. */
async function takeEarlySession(): Promise<{ session: Session | null } | null> {
  const early = typeof window !== 'undefined' ? window.__cpSession : undefined;
  if (!early) return null;
  window.__cpSession = undefined;
  return early.catch(() => null);
}
const LOCATION_KEY = 'coplaces.location';

function readStored() {
  try {
    return localStorage.getItem(LOCATION_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const early = await takeEarlySession();
      if (early) return early.session;
      try {
        return await api.get<Session>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
  const [storedId, setStoredId] = useState<string | null>(readStored);

  // Drops every cached query except the session itself (clearing that would detach its observer),
  // then sets the new session so nothing from the previous user is ever shown.
  const resetSession = useCallback(
    (session: Session | null) => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
      qc.setQueryData(['session'], session);
    },
    [qc],
  );

  useEffect(() => {
    const onUnauthorized = () => resetSession(null);
    window.addEventListener('cp:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cp:unauthorized', onUnauthorized);
  }, [resetSession]);

  const loginMutation = useMutation({
    mutationFn: (v: { email: string; password: string }) => api.post<Session>('/auth/login', v),
    onSuccess: (session) => resetSession(session),
  });

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    resetSession(null);
  }, [resetSession]);

  const setLocationId = useCallback((id: string) => {
    setStoredId(id);
    try {
      localStorage.setItem(LOCATION_KEY, id);
    } catch {
      // storage unavailable: the choice just won't persist
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const session = me.data ?? null;
    const locations = session?.locations ?? [];
    const location = locations.find((l) => l.id === storedId) ?? locations[0] ?? null;
    return {
      user: session?.user ?? null,
      org: session?.org ?? null,
      locations,
      location,
      setLocationId,
      loading: me.isLoading,
      loadError: me.error instanceof Error ? me.error : null,
      login: async (email, password) => {
        await loginMutation.mutateAsync({ email, password });
      },
      logout,
      refresh: () => me.refetch(),
    };
  }, [me.data, me.isLoading, me.error, me.refetch, storedId, setLocationId, loginMutation, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The location the signed-in user is currently working in (always set inside the app shell). */
export function useLocation() {
  const { location } = useAuth();
  if (!location) throw new Error('No active location');
  return location;
}

export const isStaff = (u: User) => u.role === 'owner' || u.role === 'manager' || u.role === 'staff';

/** Whether the signed-in user's package includes a feature. */
export function useFeature(feature: FeatureKey) {
  const { org } = useAuth();
  return !!org?.features.includes(feature);
}

/** Whether the signed-in person may use a money area: their permission and the package's feature together. */
export function useCanUse(area: Area) {
  const { user, org } = useAuth();
  return canUse(user, org?.features, area);
}

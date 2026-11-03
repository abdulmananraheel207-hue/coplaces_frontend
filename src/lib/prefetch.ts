import type { QueryClient } from '@tanstack/react-query';
import type { FeatureKey, Location, User } from '../types';
import { canUse } from './access';
import { DEFAULT_PERIOD } from './financePeriod';
import { can } from './permissions';
import { qd } from './queryDefs';
import { monthGrid } from './calendar';
import { addDays, todayIn } from './time';

/** How long fetched data counts as fresh: within this, opening a page uses it without asking the server again. */
export const FRESH_MS = 60_000;

interface Who {
  loc: Location;
  user: User;
  features: readonly FeatureKey[];
}

type Def = { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> };

/**
 * The queries a staff page makes as it opens, with its default filters. Only pages the person may open are listed;
 * the rest return nothing. Uses the same definitions as the pages, so the data lands exactly where they look.
 */
export function pageQueries(path: string, { loc, user, features }: Who): Def[] {
  const id = loc.id;
  const today = todayIn(loc.timezone);
  const has = (f: FeatureKey) => features.includes(f);
  const section = `/${path.split('/')[1] ?? ''}`;
  switch (section) {
    case '/':
      return [qd.dashboard(id), qd.schedule(id, today), qd.resources(id), qd.present(id), ...(has('visitors') ? [qd.visitors(id, { date: today })] : [])];
    case '/front-desk':
      if (!can(user, 'front_desk')) return [];
      return [qd.present(id), qd.members(id), qd.amenities(id), ...(has('visitors') ? [qd.visitors(id, { date: today }), qd.visitors(id, { status: 'checked_in' })] : [])];
    case '/bookings':
      if (!can(user, 'bookings')) return [];
      // The list opens on today and the next 30 days.
      return [qd.schedule(id, today), qd.resources(id), qd.bookingsRange(id, today, addDays(today, 30)), qd.pendingRequests(id)];
    case '/calendar': {
      if (!can(user, 'bookings')) return [];
      const grid = monthGrid(today);
      return [qd.resources(id), qd.holidays(id, grid.from, grid.to)];
    }
    case '/pricing':
      if (!can(user, 'plans')) return [];
      return [qd.resources(id)];
    case '/members':
      if (!can(user, 'members')) return [];
      return [qd.members(id), qd.plans(id)];
    case '/spaces':
      return [qd.resources(id), qd.schedule(id, today), qd.floors(id), qd.assignments(id), ...(has('floor_3d') ? [qd.floorObjects(id)] : [])];
    case '/finance': {
      if (canUse(user, features, 'reports')) {
        return [qd.financeReport(id, today, DEFAULT_PERIOD), qd.financeCharts(id, today, DEFAULT_PERIOD)];
      }
      if (canUse(user, features, 'invoices')) return [qd.invoices(id, '', '')];
      if (canUse(user, features, 'expenses')) return [qd.expenses(id, today.slice(0, 7), '')];
      return [];
    }
    case '/plans':
      if (!can(user, 'plans')) return [];
      return [qd.plans(id), qd.shifts(id), qd.resources(id)];
    case '/contracts':
      if (!can(user, 'contracts')) return [];
      return [qd.contracts(id), qd.resources(id)];
    case '/maintenance':
      if (!can(user, 'maintenance')) return [];
      return [qd.issues(id, ''), qd.tasks(id, ''), qd.assets(id, '', '')];
    case '/announcements':
      if (!can(user, 'announcements')) return [];
      return [qd.announcements(id)];
    default:
      return [];
  }
}

/** Fetches a page's data ahead (on hover, or in idle time), skipping anything still fresh. Never throws. */
export function prefetchPage(qc: QueryClient, path: string, who: Who) {
  return Promise.all(pageQueries(path, who).map((d) => qc.prefetchQuery({ ...d, staleTime: FRESH_MS }).catch(() => undefined)));
}

/** The pages warmed in the background after sign-in, most used first. */
export const WARM_ORDER = ['/', '/front-desk', '/bookings', '/calendar', '/members', '/finance', '/spaces', '/plans', '/pricing', '/contracts', '/maintenance', '/announcements'];

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation as useRoute } from 'react-router';
import { Building2, CalendarClock, CalendarDays, CreditCard, DoorOpen, FileSignature, Fingerprint, Megaphone, Wrench, LayoutDashboard, LayoutGrid, LogOut, Menu, Package, Receipt, Settings, Tags, UserRound, Users, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth, useFeature } from '../auth';
import { accessLabel, can } from '../lib/permissions';
import { SubscriptionBanner } from './SubscriptionBanner';
import { initials } from './ui';
import type { ReactNode } from 'react';

/** The location plate: a square sign with the site code. */
export function Plate({ code, small }: { code: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={`display grid shrink-0 place-items-center rounded-[10px] bg-signal text-ink shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] ${small ? 'size-8 rounded-lg' : 'size-11'} ${code.length > 3 ? 'text-[10px]' : small ? 'text-[11px]' : 'text-sm'}`}
    >
      {code}
    </span>
  );
}

function SideLink({ to, icon, children, end }: { to: string; icon?: ReactNode; children: ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] font-semibold transition-colors ${
          isActive ? 'text-white' : 'text-white/65 hover:bg-white/[0.05] hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-signal' : 'text-white/50 group-hover:text-white/80'}>{icon}</span>
          {children}
        </>
      )}
    </NavLink>
  );
}

/** The menu, with one marker that glides to whichever link is active. */
function SideNav({ children }: { children: ReactNode }) {
  const nav = useRef<HTMLElement>(null);
  const placed = useRef(false);
  const { pathname } = useRoute();
  const [mark, setMark] = useState<{ y: number; h: number } | null>(null);
  const [glide, setGlide] = useState(false);

  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const measure = () => {
      const on = el.querySelector<HTMLElement>('a[aria-current="page"]');
      setMark(on ? { y: on.offsetTop, h: on.offsetHeight } : null);
      if (on && !placed.current) {
        placed.current = true;
        requestAnimationFrame(() => setGlide(true)); // the first placement is not animated
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pathname]);

  return (
    <nav ref={nav} className="relative flex-1 space-y-1 px-3 py-3" aria-label="Main">
      {mark && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-3 top-0 rounded-lg bg-white/[0.1] motion-reduce:transition-none ${glide ? 'transition-[transform,height] duration-[420ms] ease-[cubic-bezier(0.3,1.25,0.4,1)]' : ''}`}
          style={{ transform: `translateY(${mark.y}px)`, height: mark.h }}
        >
          <span className="absolute inset-y-2 left-0 w-[3px] -translate-x-3 rounded-r-full bg-signal" />
        </span>
      )}
      {children}
    </nav>
  );
}

/** Each section fades and rises in when you move to it; moving between tabs of one section does not replay it. */
function PageTransition() {
  const { pathname } = useRoute();
  return (
    <div key={pathname.split('/')[1] ?? ''} className="page-enter">
      <Outlet />
    </div>
  );
}

function UserFooter({ name, role, onLogout }: { name: string; role: string; onLogout: () => void }) {
  return (
    <div className="m-3 flex items-center gap-3 rounded-xl bg-white/[0.05] p-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-2 text-[13px] font-bold text-white ring-1 ring-white/15" aria-hidden>
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-white/55">{role}</p>
      </div>
      <button type="button" onClick={onLogout} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
        <LogOut size={16} />
      </button>
    </div>
  );
}

export function StaffShell() {
  const { user, locations, location, setLocationId, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const route = useRoute();
  useEffect(() => setOpen(false), [route.pathname]);
  if (!user || !location) return null;
  const invoicing = useFeature('invoicing');
  const expenses = useFeature('expenses');
  const reports = useFeature('reports');
  // How many problems are waiting, shown on the Maintenance link for whoever handles them.
  const waiting = useQuery({
    queryKey: ['issues', location.id, 'waiting'],
    queryFn: () => api.get<Record<string, number>>('/issues/open/by-space', { locationId: location.id }),
    enabled: can(user, 'maintenance'),
    refetchInterval: 60_000,
  });
  const waitingCount = Object.values(waiting.data ?? {}).reduce((a, b) => a + b, 0);
  const showMoney = (invoicing && can(user, 'invoices')) || (expenses && can(user, 'expenses')) || (reports && can(user, 'reports'));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <header className="on-ink no-print sticky top-0 z-30 flex h-14 items-center justify-between bg-ink px-4 text-white lg:hidden">
        <div className="flex items-center gap-3">
          <Plate code={location.code} small />
          <span className="display-sm text-base">{location.name}</span>
        </div>
        <button type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-lg p-2 hover:bg-white/10">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>
      {open && <div className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={`on-ink no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto bg-[linear-gradient(180deg,#14263f_0%,#0f1f35_100%)] text-white transition-transform lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <Plate code={location.code} />
            <div className="min-w-0">
              <p className="display-sm truncate text-[1.05rem]">{location.name}</p>
              <p className="truncate text-xs text-white/55">{location.address || location.timezone}</p>
            </div>
          </div>
          {locations.length > 1 && (
            <div className="mt-3">
              <label htmlFor="loc" className="sr-only">
                Switch location
              </label>
              <select
                id="loc"
                value={location.id}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-2 text-sm text-white transition-colors hover:bg-white/10"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <SideNav>
          <SideLink to="/" end icon={<LayoutGrid size={17} />}>
            Today
          </SideLink>
          {can(user, 'front_desk') && (
            <SideLink to="/front-desk" icon={<DoorOpen size={17} />}>
              Front desk
            </SideLink>
          )}
          {can(user, 'bookings') && (
            <SideLink to="/bookings" icon={<CalendarDays size={17} />}>
              Bookings
            </SideLink>
          )}
          {can(user, 'spaces') && (
            <SideLink to="/shifts" icon={<CalendarClock size={17} />}>
              Shift templates
            </SideLink>
          )}
          {can(user, 'members') && (
            <SideLink to="/members" icon={<Users size={17} />}>
              Members
            </SideLink>
          )}
          <SideLink to="/spaces" icon={<LayoutGrid size={17} />}>
            Spaces
          </SideLink>
          {showMoney && (
            <SideLink to="/finance" icon={<Receipt size={17} />}>
              Finance
            </SideLink>
          )}
          {can(user, 'plans') && (
            <SideLink to="/plans" icon={<Tags size={17} />}>
              Plans
            </SideLink>
          )}
          {can(user, 'contracts') && (
            <SideLink to="/contracts" icon={<FileSignature size={17} />}>
              Contracts
            </SideLink>
          )}
          {can(user, 'maintenance') && (
            <SideLink to="/maintenance" icon={<Wrench size={17} />}>
              Maintenance
              {waitingCount > 0 && (
                <span className="num ml-auto grid min-w-5 place-items-center rounded-full bg-signal px-1.5 text-[11px] font-bold text-ink" aria-label={`${waitingCount} open problems`}>
                  {waitingCount}
                </span>
              )}
            </SideLink>
          )}
          {can(user, 'announcements') && (
            <SideLink to="/announcements" icon={<Megaphone size={17} />}>
              Announcements
            </SideLink>
          )}
          {(user.role === 'owner' || user.role === 'manager') && (
            <SideLink to="/devices" icon={<Fingerprint size={17} />}>
              Attendance devices
            </SideLink>
          )}
          <SideLink to="/settings" icon={<Settings size={17} />}>
            Settings
          </SideLink>
        </SideNav>

        <UserFooter name={user.name} role={accessLabel(user)} onLogout={() => void logout()} />
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-[1180px]">
          <SubscriptionBanner />
          <PageTransition />
        </div>
      </main>
    </div>
  );
}

export function MemberShell() {
  const { user, location, logout } = useAuth();
  const visitors = useFeature('visitors');
  const invoicing = useFeature('invoicing');
  if (!user || !location) return null;
  const link = ({ isActive }: { isActive: boolean }) =>
    `relative whitespace-nowrap rounded-lg px-3 py-2 text-[14.5px] font-semibold transition-colors ${isActive ? 'bg-white/[0.1] text-white' : 'text-white/65 hover:bg-white/[0.05] hover:text-white'}`;
  return (
    <div className="min-h-dvh">
      <header className="on-ink no-print bg-ink text-white">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-x-6 px-4 sm:px-8">
          <div className="flex items-center gap-3 py-3">
            <Plate code={location.code} small />
            <span className="display-sm text-base">{location.name}</span>
          </div>
          <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto pb-2.5 sm:order-none sm:mx-0 sm:w-auto sm:pb-0" aria-label="Main">
            <NavLink to="/" end className={link}>
              Home
            </NavLink>
            <NavLink to="/book" className={link}>
              Book a space
            </NavLink>
            {visitors && (
              <NavLink to="/visitors" className={link}>
                Visitors
              </NavLink>
            )}
            {invoicing && (
              <NavLink to="/invoices" className={link}>
                Invoices
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-2 py-3 text-sm">
            <NavLink to="/account" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-white/85 hover:bg-white/10 hover:text-white" aria-label="Your account">
              <UserRound size={16} aria-hidden />
              <span className="hidden sm:inline">{user.name}</span>
            </NavLink>
            <button type="button" onClick={() => void logout()} aria-label="Sign out" className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1080px] px-4 py-6 sm:px-8 sm:py-8">
        <PageTransition />
      </main>
    </div>
  );
}

/** The super admin's shell: tenants, packages and platform revenue. */
export function PlatformShell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const route = useRoute();
  useEffect(() => setOpen(false), [route.pathname]);
  if (!user) return null;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <header className="on-ink no-print sticky top-0 z-30 flex h-14 items-center justify-between bg-ink px-4 text-white lg:hidden">
        <div className="flex items-center gap-3">
          <Plate code="CP" small />
          <span className="display-sm text-base">Platform admin</span>
        </div>
        <button type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-lg p-2 hover:bg-white/10">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>
      {open && <div className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={`on-ink no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto bg-[linear-gradient(180deg,#14263f_0%,#0f1f35_100%)] text-white transition-transform lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-4 pt-5 pb-3">
          <Plate code="CP" />
          <div className="min-w-0">
            <p className="display-sm text-[1.05rem]">Coplaces</p>
            <p className="text-xs text-white/55">Platform admin</p>
          </div>
        </div>
        <SideNav>
          <SideLink to="/" end icon={<LayoutDashboard size={17} />}>
            Overview
          </SideLink>
          <SideLink to="/spaces" icon={<Building2 size={17} />}>
            Coworking spaces
          </SideLink>
          <SideLink to="/packages" icon={<Package size={17} />}>
            Packages
          </SideLink>
          <SideLink to="/payments" icon={<CreditCard size={17} />}>
            Payments
          </SideLink>
          <SideLink to="/settings" icon={<Settings size={17} />}>
            Settings
          </SideLink>
        </SideNav>
        <UserFooter name={user.name} role={accessLabel(user)} onLogout={() => void logout()} />
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-[1180px]">
          <PageTransition />
        </div>
      </main>
    </div>
  );
}

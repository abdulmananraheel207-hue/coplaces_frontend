import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Every page of the app, loaded on demand so the first download is only the shell, the sign-in page and the shared
 * parts. Once someone is signed in, `preloadPages` fetches the rest while the browser is idle, so moving between
 * pages never waits for a download.
 */

/** Pages take different props; each route passes its own. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPage = ComponentType<any>;

const LOADERS = {
  InvoiceView: () => import('./components/InvoiceView').then((m) => m.InvoiceView),
  PlatformOverview: () => import('./pages/platform/Overview').then((m) => m.default),
  PlatformPackages: () => import('./pages/platform/Packages').then((m) => m.default),
  PlatformPayments: () => import('./pages/platform/Payments').then((m) => m.default),
  PlatformSpaceDetail: () => import('./pages/platform/SpaceDetail').then((m) => m.default),
  PlatformSpaces: () => import('./pages/platform/Spaces').then((m) => m.default),
  MemberBook: () => import('./pages/member/Book').then((m) => m.default),
  MemberHome: () => import('./pages/member/Home').then((m) => m.default),
  MemberInvoices: () => import('./pages/member/Invoices').then((m) => m.default),
  MemberVisitors: () => import('./pages/member/Visitors').then((m) => m.default),
  Announcements: () => import('./pages/staff/Announcements').then((m) => m.default),
  Bookings: () => import('./pages/staff/Bookings').then((m) => m.default),
  Calendar: () => import('./pages/staff/Calendar').then((m) => m.default),
  Contracts: () => import('./pages/staff/Contracts').then((m) => m.default),
  Devices: () => import('./pages/staff/Devices').then((m) => m.default),
  Maintenance: () => import('./pages/staff/Maintenance').then((m) => m.default),
  SpaceScan: () => import('./pages/SpaceScan').then((m) => m.default),
  Dashboard: () => import('./pages/staff/Dashboard').then((m) => m.default),
  Expenses: () => import('./pages/staff/Expenses').then((m) => m.default),
  FrontDesk: () => import('./pages/staff/FrontDesk').then((m) => m.default),
  Live: () => import('./pages/staff/Live').then((m) => m.default),
  Invoices: () => import('./pages/staff/Invoices').then((m) => m.default),
  MemberDetail: () => import('./pages/staff/MemberDetail').then((m) => m.default),
  Members: () => import('./pages/staff/Members').then((m) => m.default),
  FinanceIndex: () => import('./pages/staff/Finance').then((m) => m.FinanceIndex),
  FinanceLayout: () => import('./pages/staff/Finance').then((m) => m.FinanceLayout),
  FinanceOverview: () => import('./pages/staff/FinanceOverview').then((m) => m.default),
  ProfitLoss: () => import('./pages/staff/ProfitLoss').then((m) => m.default),
  Payments: () => import('./pages/staff/Payments').then((m) => m.default),
  Plans: () => import('./pages/staff/Plans').then((m) => m.default),
  Pricing: () => import('./pages/staff/Pricing').then((m) => m.default),
  Settings: () => import('./pages/staff/Settings').then((m) => m.default),
  PasswordForm: () => import('./pages/staff/Settings').then((m) => m.PasswordForm),
  Spaces: () => import('./pages/staff/Spaces').then((m) => m.default),
} satisfies Record<string, () => Promise<AnyPage>>;

type Name = keyof typeof LOADERS;

export const PAGES = Object.fromEntries(
  (Object.keys(LOADERS) as Name[]).map((name) => [name, lazy(() => LOADERS[name]().then((c) => ({ default: c as AnyPage })))]),
) as Record<Name, LazyExoticComponent<AnyPage>>;

/** Which pages each kind of person can reach; only those are fetched ahead. */
export const PRELOAD: Record<'staff' | 'member' | 'platform', Name[]> = {
  staff: ['Dashboard', 'FrontDesk', 'Live', 'Bookings', 'Calendar', 'Members', 'MemberDetail', 'Spaces', 'FinanceLayout', 'FinanceIndex', 'FinanceOverview', 'ProfitLoss', 'Invoices', 'InvoiceView', 'Payments', 'Expenses', 'Plans', 'Pricing', 'Contracts', 'Maintenance', 'Announcements', 'Devices', 'Settings', 'SpaceScan'],
  member: ['MemberHome', 'MemberBook', 'MemberVisitors', 'MemberInvoices', 'InvoiceView', 'PasswordForm', 'SpaceScan'],
  platform: ['PlatformOverview', 'PlatformSpaces', 'PlatformSpaceDetail', 'PlatformPackages', 'PlatformPayments', 'PasswordForm'],
};

let started = false;

/**
 * Fetches the pages a person can reach, one at a time while the browser is idle, so it never competes with the page
 * they are looking at. Runs once per visit; a failed fetch is simply tried again when that page is opened.
 */
export function preloadPages(kind: keyof typeof PRELOAD) {
  if (started || typeof window === 'undefined') return;
  started = true;
  const queue = [...PRELOAD[kind]];
  const idle = (fn: () => void) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 3000 }) : window.setTimeout(fn, 200));
  const next = () => {
    const name = queue.shift();
    if (!name) return;
    void LOADERS[name]()
      .catch(() => undefined)
      .finally(() => idle(next));
  };
  idle(next);
}

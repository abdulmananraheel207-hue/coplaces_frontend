import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeatureKey, Location, PermissionKey, User } from '../types';
import { PERMISSION_KEYS } from './permissions';

const calls: string[] = [];
vi.mock('../api', () => ({
  api: {
    get: vi.fn(async (path: string, params?: Record<string, unknown>) => {
      calls.push(`${path}?${new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()}`);
      return path === '/reports/finance' ? { totals: {} } : [];
    }),
  },
}));

const { pageQueries, prefetchPage, WARM_ORDER } = await import('./prefetch');
const { qd } = await import('./queryDefs');

const LOC: Location = { id: 'L1', name: 'Nest Clifton', code: 'NC', address: '', timezone: 'Asia/Karachi', currency: 'PKR', openTime: '09:00', closeTime: '21:00', taxRateBps: 0, closedWeekdays: '', active: true };
const ALL: FeatureKey[] = ['visitors', 'member_portal', 'floor_3d', 'plan_import', 'invoicing', 'expenses', 'reports', 'team'];
const person = (role: User['role'], permissions: PermissionKey[]): User => ({ id: 'u', email: 'u@x.dev', name: 'U', role, permissions, memberId: null });
const keys = (path: string, user: User, features = ALL) => pageQueries(path, { loc: LOC, user, features }).map((d) => JSON.stringify(d.queryKey));

afterEach(() => {
  calls.length = 0;
});

describe('which data is fetched ahead for a page', () => {
  it('fetches the Today page as the page asks for it', () => {
    const k = keys('/', person('owner', PERMISSION_KEYS));
    expect(k).toContain(JSON.stringify(['dashboard', 'L1']));
    expect(k).toContain(JSON.stringify(['resources', 'L1']));
    expect(k).toContain(JSON.stringify(['attendance', 'L1', 'open']));
  });

  it('never fetches a page the person may not open', () => {
    const frontDesk = person('staff', ['front_desk', 'bookings', 'members', 'invoices']);
    expect(keys('/plans', frontDesk)).toEqual([]);
    expect(keys('/contracts', frontDesk)).toEqual([]);
    expect(keys('/maintenance', frontDesk)).toEqual([]);
    // Finance for the front desk is the invoice list, never the report.
    expect(keys('/finance', frontDesk)).toEqual([JSON.stringify(['invoices', 'L1', '', ''])]);
  });

  it('leaves out what the package does not include', () => {
    const owner = person('owner', PERMISSION_KEYS);
    expect(keys('/', owner, ['invoicing']).some((k) => k.startsWith('["visitors"'))).toBe(false);
    expect(keys('/finance', owner, ['visitors'])).toEqual([]);
    expect(keys('/spaces', owner, []).some((k) => k.startsWith('["floor-objects"'))).toBe(false);
  });

  it('fetches the finance overview for the default period, with the invoice lists for those who may read invoices', () => {
    const k = keys('/finance/overview', person('owner', PERMISSION_KEYS));
    expect(k[0]).toMatch(/^\["reports","L1","\d{4}-\d{2}-01","\d{4}-\d{2}-\d{2}"\]$/);
    expect(k).toContain(JSON.stringify(['invoices', 'L1', 'overview', 'all']));
    expect(keys('/finance', person('staff', ['reports']))).toHaveLength(1);
  });

  it('warms only real pages', () => {
    for (const p of WARM_ORDER) expect(pageQueries(p, { loc: LOC, user: person('owner', PERMISSION_KEYS), features: ALL }).length).toBeGreaterThan(0);
  });
});

describe('fetching ahead', () => {
  it('fills the cache the page reads, so opening it needs no second request', async () => {
    const qc = new QueryClient();
    await prefetchPage(qc, '/members', { loc: LOC, user: person('owner', PERMISSION_KEYS), features: ALL });
    expect(calls).toEqual(['/members?locationId=L1', '/plans?locationId=L1']);
    // what the Members page itself asks for
    expect(qc.getQueryData(qd.members('L1').queryKey)).toEqual([]);
    await qc.fetchQuery({ ...qd.members('L1'), staleTime: 60_000 });
    expect(calls).toHaveLength(2);
  });

  it('does not fetch again while the data is fresh', async () => {
    const qc = new QueryClient();
    const who = { loc: LOC, user: person('owner', PERMISSION_KEYS), features: ALL };
    await prefetchPage(qc, '/contracts', who);
    await prefetchPage(qc, '/contracts', who);
    expect(calls.filter((c) => c.startsWith('/contracts'))).toHaveLength(1);
  });
});

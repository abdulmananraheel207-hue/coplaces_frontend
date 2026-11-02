import { describe, expect, it } from 'vitest';
import type { FeatureKey, PermissionKey, User } from '../types';
import { allowed, anyFinance, AREAS, canUse, dashboardMoney, financeHome, overviewSections, type Area } from './access';
import { PERMISSION_KEYS } from './permissions';

const person = (role: User['role'], permissions: PermissionKey[]): User => ({ id: 'u', email: 'u@x.dev', name: 'U', role, permissions, memberId: null });
const ALL_FEATURES: FeatureKey[] = ['visitors', 'member_portal', 'floor_3d', 'plan_import', 'invoicing', 'expenses', 'reports', 'team'];

describe('a money area needs the permission and the package feature together', () => {
  for (const area of Object.keys(AREAS) as Area[]) {
    const { permission, feature } = AREAS[area];
    describe(area, () => {
      it('is open with both', () => {
        expect(canUse(person('staff', [permission]), [feature], area)).toBe(true);
      });
      it('is shut with the permission but not the feature', () => {
        expect(canUse(person('staff', [permission]), ALL_FEATURES.filter((f) => f !== feature), area)).toBe(false);
      });
      it('is shut with the feature but not the permission', () => {
        expect(canUse(person('staff', PERMISSION_KEYS.filter((p) => p !== permission)), ALL_FEATURES, area)).toBe(false);
      });
      it('is shut for an owner whose package leaves the feature out', () => {
        expect(canUse(person('owner', PERMISSION_KEYS), ALL_FEATURES.filter((f) => f !== feature), area)).toBe(false);
      });
      it('is shut for nobody signed in, or no organization', () => {
        expect(canUse(null, ALL_FEATURES, area)).toBe(false);
        expect(canUse(person('owner', PERMISSION_KEYS), undefined, area)).toBe(false);
      });
    });
  }

  it('keeps members out of every area', () => {
    for (const area of Object.keys(AREAS) as Area[]) expect(canUse(person('member', []), ALL_FEATURES, area)).toBe(false);
  });

  it('checks any permission and feature pair the same way', () => {
    expect(allowed(person('staff', ['invoices']), ['invoicing'], 'invoices', 'invoicing')).toBe(true);
    expect(allowed(person('staff', ['invoices']), [], 'invoices', 'invoicing')).toBe(false);
  });
});

describe('the Finance menu and its first page', () => {
  it('shows Finance only when some area is open', () => {
    expect(anyFinance(person('staff', ['front_desk', 'bookings']), ALL_FEATURES)).toBe(false);
    expect(anyFinance(person('staff', ['invoices']), ['expenses', 'reports'])).toBe(false);
    expect(anyFinance(person('staff', ['expenses']), ['expenses'])).toBe(true);
  });

  it('opens on reports, then invoices, then expenses, else home', () => {
    expect(financeHome(person('owner', PERMISSION_KEYS), ALL_FEATURES)).toBe('/finance/overview');
    expect(financeHome(person('owner', PERMISSION_KEYS), ['invoicing', 'expenses'])).toBe('/finance/invoices');
    expect(financeHome(person('staff', ['expenses', 'reports']), ['expenses'])).toBe('/finance/expenses');
    expect(financeHome(person('staff', ['reports']), ['invoicing'])).toBe('/');
  });
});

describe("the Today page's month figures", () => {
  it('are hidden from a front desk person with no money areas', () => {
    expect(dashboardMoney(person('staff', ['front_desk', 'bookings', 'members']), ALL_FEATURES).show).toBe(false);
  });

  it('are hidden when the permissions are there but the package has no invoicing or reports', () => {
    expect(dashboardMoney(person('owner', PERMISSION_KEYS), ['expenses']).show).toBe(false);
  });

  it('show invoice figures to someone who handles invoices on a package with invoicing', () => {
    const m = dashboardMoney(person('staff', ['invoices']), ['invoicing']);
    expect(m).toEqual({ show: true, invoiceFigures: true, expenses: false, overviewLink: false });
  });

  it('leave out invoice figures on a package without invoicing', () => {
    const m = dashboardMoney(person('staff', ['reports']), ['reports']);
    expect(m).toEqual({ show: true, invoiceFigures: false, expenses: false, overviewLink: true });
  });

  it('show expenses only with the expenses area', () => {
    expect(dashboardMoney(person('owner', PERMISSION_KEYS), ALL_FEATURES).expenses).toBe(true);
    expect(dashboardMoney(person('staff', ['invoices', 'expenses']), ['invoicing']).expenses).toBe(false);
  });

  it('link to the overview only for someone who may open it', () => {
    expect(dashboardMoney(person('staff', ['invoices']), ALL_FEATURES).overviewLink).toBe(false);
    expect(dashboardMoney(person('staff', ['reports']), ['invoicing']).overviewLink).toBe(false);
    expect(dashboardMoney(person('staff', ['reports']), ['reports']).overviewLink).toBe(true);
  });
});

describe('the finance overview sections', () => {
  it('shows what is owed only on a package with invoicing', () => {
    expect(overviewSections(person('staff', ['reports']), ['reports', 'invoicing']).owed).toBe(true);
    expect(overviewSections(person('staff', ['reports']), ['reports']).owed).toBe(false);
  });

  it('links to the invoices only for someone who may open them', () => {
    expect(overviewSections(person('staff', ['reports']), ['reports', 'invoicing']).invoicesLink).toBe(false);
    expect(overviewSections(person('staff', ['reports', 'invoices']), ['reports', 'invoicing']).invoicesLink).toBe(true);
    expect(overviewSections(person('staff', ['reports', 'invoices']), ['reports']).invoicesLink).toBe(false);
  });

  it('lets the front desk or invoice handlers mark amenities collected', () => {
    expect(overviewSections(person('staff', ['reports']), ALL_FEATURES).collectAmenities).toBe(false);
    expect(overviewSections(person('staff', ['reports', 'front_desk']), ALL_FEATURES).collectAmenities).toBe(true);
    expect(overviewSections(person('staff', ['reports', 'invoices']), ALL_FEATURES).collectAmenities).toBe(true);
  });
});

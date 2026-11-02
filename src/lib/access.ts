import type { FeatureKey, PermissionKey, User } from '../types';
import { can } from './permissions';

/**
 * The money areas of the app. Each needs a permission given to the person AND a feature in the organization's package;
 * an owner has every permission but still cannot use what the package leaves out.
 */
export const AREAS = {
  invoices: { permission: 'invoices', feature: 'invoicing' },
  billing: { permission: 'billing_admin', feature: 'invoicing' },
  expenses: { permission: 'expenses', feature: 'expenses' },
  reports: { permission: 'reports', feature: 'reports' },
} as const satisfies Record<string, { permission: PermissionKey; feature: FeatureKey }>;

export type Area = keyof typeof AREAS;

/** Whether the person has the permission and the package has the feature. */
export function allowed(user: User | null | undefined, features: readonly FeatureKey[] | undefined, permission: PermissionKey, feature: FeatureKey) {
  return can(user, permission) && !!features?.includes(feature);
}

/** Whether the person may use one of the money areas. */
export const canUse = (user: User | null | undefined, features: readonly FeatureKey[] | undefined, area: Area) => allowed(user, features, AREAS[area].permission, AREAS[area].feature);

/** Whether any money area is open to the person, for the Finance link in the menu. */
export const anyFinance = (user: User | null | undefined, features: readonly FeatureKey[] | undefined) =>
  canUse(user, features, 'invoices') || canUse(user, features, 'expenses') || canUse(user, features, 'reports');

/** Where /finance should send the person: the first area they may use, or home. */
export function financeHome(user: User | null | undefined, features: readonly FeatureKey[] | undefined) {
  if (canUse(user, features, 'reports')) return '/finance/overview';
  if (canUse(user, features, 'invoices')) return '/finance/invoices';
  if (canUse(user, features, 'expenses')) return '/finance/expenses';
  return '/';
}

/**
 * What the Today page's "This month" figures may show. The block is for people who handle invoices or read the
 * reports. Invoice figures (invoiced, outstanding, overdue) need the invoicing feature, and expenses need the expenses area.
 */
export function dashboardMoney(user: User | null | undefined, features: readonly FeatureKey[] | undefined) {
  const invoices = canUse(user, features, 'invoices');
  const reports = canUse(user, features, 'reports');
  const invoicing = !!features?.includes('invoicing');
  return {
    show: invoices || reports,
    invoiceFigures: (invoices || reports) && invoicing,
    expenses: canUse(user, features, 'expenses'),
    overviewLink: reports,
  };
}

/** What the finance overview may show, beyond what the reports area itself allows. */
export function overviewSections(user: User | null | undefined, features: readonly FeatureKey[] | undefined) {
  const invoicing = !!features?.includes('invoicing');
  return {
    /** "Still owed to you", the overdue notice and "Who still owes you" are about invoices. */
    owed: invoicing,
    invoicesLink: canUse(user, features, 'invoices'),
    /** Marking amenities collected is a front desk job, or for whoever handles invoices. */
    collectAmenities: can(user, 'front_desk') || can(user, 'invoices'),
  };
}

import type { FeatureKey, Role } from '../types';

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  visitors: 'Visitor management',
  member_portal: 'Member portal',
  floor_3d: '3D floor view',
  plan_import: 'Floor plan import',
  invoicing: 'Invoices and payments',
  expenses: 'Expense tracking',
  reports: 'Finance reports',
  team: 'Team accounts',
};

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Platform admin',
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Front desk',
  member: 'Member',
};

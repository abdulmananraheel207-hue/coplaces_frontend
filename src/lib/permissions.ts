import type { PermissionKey, User } from '../types';

/** Every permission, in the order the server lists them. The labels and descriptions come from the server. */
export const PERMISSION_KEYS: PermissionKey[] = [
  'front_desk',
  'bookings',
  'members',
  'spaces',
  'plans',
  'holidays',
  'contracts',
  'announcements',
  'maintenance',
  'invoices',
  'billing_admin',
  'expenses',
  'reports',
];

/** What the old "front desk" role could do. */
export const FRONT_DESK_PRESET: PermissionKey[] = ['front_desk', 'bookings', 'members', 'invoices'];

/** Whether a signed-in user may do something. Owners may do everything. */
export const can = (u: User | null | undefined, permission: PermissionKey) => !!u?.permissions?.includes(permission);

/** The line shown under a person's name: "Owner", "Full access" or "Team member". */
export function accessLabel(u: Pick<User, 'role' | 'permissions'>) {
  if (u.role === 'superadmin') return 'Platform admin';
  if (u.role === 'owner') return 'Owner';
  if (u.role === 'member') return 'Member';
  return u.permissions.length === PERMISSION_KEYS.length ? 'Full access' : 'Team member';
}

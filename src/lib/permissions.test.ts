import { describe, expect, it } from 'vitest';
import { accessLabel, can, FRONT_DESK_PRESET, PERMISSION_KEYS } from './permissions';
import type { User } from '../types';

const user = (role: User['role'], permissions: User['permissions']): User => ({ id: 'u', email: 'u@x.dev', name: 'U', role, permissions, memberId: null });

describe('permissions in the app', () => {
  it('only lets people do what they were given', () => {
    const u = user('staff', ['bookings']);
    expect(can(u, 'bookings')).toBe(true);
    expect(can(u, 'plans')).toBe(false);
    expect(can(null, 'bookings')).toBe(false);
  });

  it('describes access in plain words', () => {
    expect(accessLabel(user('owner', PERMISSION_KEYS))).toBe('Owner');
    expect(accessLabel(user('staff', PERMISSION_KEYS))).toBe('Full access');
    expect(accessLabel(user('staff', FRONT_DESK_PRESET))).toBe('Team member');
    expect(accessLabel(user('superadmin', []))).toBe('Platform admin');
  });
});

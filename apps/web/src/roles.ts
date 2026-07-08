// Frontend role-capability helpers — mirror apps/api/src/lib/roles.ts.
// UI gating only; the API enforces the real rules.
import type { Role } from './types';

// Can upload & delete media.
export function canManageMedia(role?: Role): boolean {
  return role === 'business_admin' || role === 'media_admin';
}

// Can view analytics.
export function canViewAnalytics(role?: Role): boolean {
  return role === 'business_admin' || role === 'media_admin';
}

// Can create users (business_admin, user_full_admin, user_creation_admin).
export function canCreateUsers(role?: Role): boolean {
  return role === 'business_admin' || role === 'user_full_admin' || role === 'user_creation_admin';
}

// Can list/edit/delete users (business_admin, user_full_admin).
export function canManageUsers(role?: Role): boolean {
  return role === 'business_admin' || role === 'user_full_admin';
}

// Which roles this caller may assign to a user (no privilege escalation).
export function assignableRoles(role?: Role): Role[] {
  if (role === 'business_admin') {
    return ['staff', 'media_admin', 'business_admin', 'user_full_admin', 'user_creation_admin'];
  }
  if (role === 'user_full_admin' || role === 'user_creation_admin') {
    return ['staff'];
  }
  return [];
}

export const ROLE_LABELS: Record<Role, string> = {
  business_admin: 'Admin',
  media_admin: 'Media Admin',
  staff: 'Staff',
  user_full_admin: 'User Admin',
  user_creation_admin: 'User Creator',
};

export const ROLE_OPTION_LABELS: Record<Role, string> = {
  staff: 'Staff (can download only)',
  media_admin: 'Media Admin (upload & delete)',
  business_admin: 'Admin (full control)',
  user_full_admin: 'User Admin (manage staff users)',
  user_creation_admin: 'User Creator (create staff users)',
};

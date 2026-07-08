// Central role-capability helpers. Single source of truth for what each
// business role may do, so route guards stay consistent.
//
// Role summary:
//   business_admin       — full control within the business.
//   media_admin          — upload/delete media + analytics. No user management.
//   staff                — download/view published media only.
//   user_full_admin      — list/create/edit/delete STAFF users. Views media like staff.
//   user_creation_admin  — create STAFF users only (no list/edit/delete). Views media like staff.

import type { BusinessRole } from '@pixsignpro/db';

// Roles that may upload & delete media.
export const MEDIA_MANAGER_ROLES: BusinessRole[] = ['business_admin', 'media_admin'];

// Roles that see media as download-only (published items only, no scheduled/unpublished).
export function isDownloadOnlyRole(role: BusinessRole): boolean {
  return role === 'staff' || role === 'user_creation_admin' || role === 'user_full_admin';
}

// Roles allowed to CREATE users.
export const USER_CREATOR_ROLES: BusinessRole[] = [
  'business_admin',
  'user_full_admin',
  'user_creation_admin',
];

// Roles allowed to LIST users. (media_admin retains legacy read access.)
export const USER_LIST_ROLES: BusinessRole[] = ['business_admin', 'media_admin', 'user_full_admin'];

// Roles allowed to EDIT / DELETE / reset-password users.
export const USER_MANAGER_ROLES: BusinessRole[] = ['business_admin', 'user_full_admin'];

// Which roles a caller may ASSIGN when creating or editing a user.
// Non-business_admin admins can only mint/keep staff — prevents privilege escalation.
export function assignableRoles(callerRole: BusinessRole): BusinessRole[] {
  if (callerRole === 'business_admin') {
    return ['staff', 'media_admin', 'business_admin', 'user_full_admin', 'user_creation_admin'];
  }
  if (callerRole === 'user_full_admin' || callerRole === 'user_creation_admin') {
    return ['staff'];
  }
  return [];
}

// Whether callerRole may manage (edit/delete/reset) a user who currently has targetRole.
// business_admin: anyone. user_full_admin: staff only. Everyone else: no one.
export function canManageTarget(callerRole: BusinessRole, targetRole: BusinessRole): boolean {
  if (callerRole === 'business_admin') return true;
  if (callerRole === 'user_full_admin') return targetRole === 'staff';
  return false;
}

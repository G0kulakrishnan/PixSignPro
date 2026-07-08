import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withTenant, withSystem } from '@pixsignpro/db';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  USER_CREATOR_ROLES, USER_LIST_ROLES, USER_MANAGER_ROLES,
  assignableRoles, canManageTarget,
} from '../lib/roles';
import { ok, err } from '../lib/response';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const ROLE_ENUM = z.enum([
  'staff', 'media_admin', 'business_admin', 'user_full_admin', 'user_creation_admin',
]);

const createUserSchema = z.object({
  mobileNo: z.string().min(10).max(15),
  password: z.string().min(6),
  name: z.string().min(1),
  role: ROLE_ENUM,
  city: z.string().optional(),
  agencyName: z.string().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  mobileNo: z.string().min(10).max(15).optional(),
  role: ROLE_ENUM.optional(),
  city: z.string().optional(),
  agencyName: z.string().optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

// Load a target user's current role within the caller's tenant (RLS-scoped).
async function loadTargetRole(businessId: string, userId: string) {
  return withTenant(businessId, (tx) =>
    tx.user.findUnique({ where: { id: userId }, select: { role: true } }),
  );
}

// GET /api/users — list users in the business.
// user_full_admin only sees staff (the users it may manage); others see all.
usersRouter.get('/', requireRole(...USER_LIST_ROLES), async (req, res) => {
  try {
    const scopeToStaff = req.user!.role === 'user_full_admin';
    const users = await withTenant(req.user!.businessId, (tx) =>
      tx.user.findMany({
        where: scopeToStaff ? { role: 'staff' } : undefined,
        select: {
          id: true, name: true, mobileNo: true, role: true,
          city: true, agencyName: true, isActive: true, expiresAt: true, createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
    ok(res, users);
  } catch (e) {
    console.error('[users/list]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// POST /api/users — create a new user (business_admin, user_full_admin, user_creation_admin)
usersRouter.post('/', requireRole(...USER_CREATOR_ROLES), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }

  const { mobileNo, password, name, role, city, agencyName, expiresAt } = parsed.data;
  const businessId = req.user!.businessId;

  // Prevent privilege escalation: caller may only assign roles they're permitted to.
  if (!assignableRoles(req.user!.role).includes(role)) {
    err(res, 403, 'forbidden', 'You are not allowed to assign that role');
    return;
  }

  try {
    // mobile_no is globally unique — check across all tenants
    const existing = await withSystem((tx) => tx.user.findUnique({ where: { mobileNo } }));
    if (existing) {
      err(res, 409, 'mobile_taken', 'Mobile number already registered');
      return;
    }

    // Enforce plan max_users limit
    const [userCount, business] = await Promise.all([
      withTenant(businessId, (tx) => tx.user.count()),
      withSystem((tx) =>
        tx.business.findUnique({ where: { id: businessId }, include: { plan: true } }),
      ),
    ]);
    if (business?.plan && userCount >= business.plan.maxUsers) {
      err(res, 403, 'plan_limit', `User limit reached (max ${business.plan.maxUsers})`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await withTenant(businessId, (tx) =>
      tx.user.create({
        data: {
          businessId, mobileNo, passwordHash, name, role, city, agencyName,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        select: { id: true, name: true, mobileNo: true, role: true, isActive: true, expiresAt: true },
      }),
    );
    ok(res, user, 201);
  } catch (e) {
    console.error('[users/create]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// POST /api/users/bulk — best-effort bulk STAFF creation from an uploaded sheet.
// The client parses the Excel and sends rows as JSON. Role is always 'staff'
// (so no privilege-escalation path). Invalid/duplicate rows are skipped and
// reported; valid rows are created. Never trusts client-side validation.
const bulkRowSchema = z.object({
  name: z.string().trim().min(1),
  mobileNo: z.coerce.string().trim().min(10).max(15),
  password: z.coerce.string().min(6),
  city: z.string().trim().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const MAX_BULK_ROWS = 500;

usersRouter.post('/bulk', requireRole(...USER_CREATOR_ROLES), async (req, res) => {
  const rows: unknown[] = Array.isArray(req.body?.users) ? req.body.users : [];
  if (!rows.length) {
    err(res, 400, 'validation_error', 'No rows to import');
    return;
  }
  if (rows.length > MAX_BULK_ROWS) {
    err(res, 400, 'validation_error', `Too many rows — import up to ${MAX_BULK_ROWS} at a time`);
    return;
  }

  const businessId = req.user!.businessId;

  interface Skipped { row: number; mobileNo: string; reason: string; }
  const skipped: Skipped[] = [];
  const valid: { row: number; name: string; mobileNo: string; password: string; city?: string; expiresAt?: string | null }[] = [];
  const seen = new Set<string>();

  // 1. Per-row shape validation + duplicates within the file.
  rows.forEach((raw: any, i) => {
    const rowNo = i + 1;
    const parsed = bulkRowSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ row: rowNo, mobileNo: String(raw?.mobileNo ?? '').trim(), reason: parsed.error.issues[0]?.message ?? 'Invalid row' });
      return;
    }
    const mob = parsed.data.mobileNo;
    if (seen.has(mob)) {
      skipped.push({ row: rowNo, mobileNo: mob, reason: 'Duplicate mobile number in file' });
      return;
    }
    seen.add(mob);
    valid.push({ row: rowNo, ...parsed.data });
  });

  try {
    // 2. Drop rows whose mobile is already registered (globally unique).
    let creatable = valid;
    if (valid.length) {
      const existing = await withSystem((tx) =>
        tx.user.findMany({ where: { mobileNo: { in: valid.map((v) => v.mobileNo) } }, select: { mobileNo: true } }),
      );
      const existingSet = new Set(existing.map((e) => e.mobileNo));
      creatable = valid.filter((v) => {
        if (existingSet.has(v.mobileNo)) {
          skipped.push({ row: v.row, mobileNo: v.mobileNo, reason: 'Mobile number already registered' });
          return false;
        }
        return true;
      });
    }

    // 3. Enforce plan user limit (maxUsers 0 = unlimited).
    const [userCount, business] = await Promise.all([
      withTenant(businessId, (tx) => tx.user.count()),
      withSystem((tx) => tx.business.findUnique({ where: { id: businessId }, include: { plan: true } })),
    ]);
    const maxUsers = business?.plan?.maxUsers ?? 0;
    if (maxUsers > 0) {
      const available = Math.max(0, maxUsers - userCount);
      if (creatable.length > available) {
        creatable.slice(available).forEach((v) =>
          skipped.push({ row: v.row, mobileNo: v.mobileNo, reason: `Plan user limit reached (max ${maxUsers})` }),
        );
        creatable = creatable.slice(0, available);
      }
    }

    // 4. Create the survivors.
    let created = 0;
    if (creatable.length) {
      const data = await Promise.all(
        creatable.map(async (v) => ({
          businessId,
          mobileNo: v.mobileNo,
          passwordHash: await bcrypt.hash(v.password, 12),
          name: v.name,
          role: 'staff' as const,
          city: v.city,
          expiresAt: v.expiresAt ? new Date(v.expiresAt) : null,
        })),
      );
      const result = await withTenant(businessId, (tx) =>
        tx.user.createMany({ data, skipDuplicates: true }),
      );
      created = result.count;
    }

    ok(res, { created, skippedCount: skipped.length, skipped }, 201);
  } catch (e) {
    console.error('[users/bulk]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// GET /api/users/:id
usersRouter.get('/:id', requireRole(...USER_MANAGER_ROLES), async (req, res) => {
  try {
    const user = await withTenant(req.user!.businessId, (tx) =>
      tx.user.findUnique({
        where: { id: req.params.id },
        select: {
          id: true, name: true, mobileNo: true, role: true,
          city: true, agencyName: true, isActive: true, expiresAt: true, createdAt: true,
        },
      }),
    );
    if (!user) { err(res, 404, 'not_found', 'User not found'); return; }
    // user_full_admin may only view staff users.
    if (!canManageTarget(req.user!.role, user.role)) {
      err(res, 403, 'forbidden', 'You are not allowed to manage that user');
      return;
    }
    ok(res, user);
  } catch (e) {
    console.error('[users/get]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// PUT /api/users/:id
usersRouter.put('/:id', requireRole(...USER_MANAGER_ROLES), async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }
  try {
    // Verify the caller may manage this target's CURRENT role.
    const target = await loadTargetRole(req.user!.businessId, req.params.id!);
    if (!target) { err(res, 404, 'not_found', 'User not found'); return; }
    if (!canManageTarget(req.user!.role, target.role)) {
      err(res, 403, 'forbidden', 'You are not allowed to manage that user');
      return;
    }
    // If a new role is requested, ensure the caller may assign it (no escalation).
    if (parsed.data.role && !assignableRoles(req.user!.role).includes(parsed.data.role)) {
      err(res, 403, 'forbidden', 'You are not allowed to assign that role');
      return;
    }
    // If mobileNo is being changed, ensure it's not already taken by another user
    if (parsed.data.mobileNo) {
      const existing = await withSystem((tx) =>
        tx.user.findUnique({ where: { mobileNo: parsed.data.mobileNo } }),
      );
      if (existing && existing.id !== req.params.id) {
        err(res, 409, 'conflict', 'Mobile number already in use by another user');
        return;
      }
    }
    const { expiresAt, ...rest } = parsed.data;
    const data: any = { ...rest };
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const user = await withTenant(req.user!.businessId, (tx) =>
      tx.user.update({
        where: { id: req.params.id },
        data,
        select: { id: true, name: true, mobileNo: true, role: true, isActive: true, expiresAt: true },
      }),
    );
    ok(res, user);
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'User not found'); return; }
    if (e?.code === 'P2002') { err(res, 409, 'conflict', 'Mobile number already in use'); return; }
    console.error('[users/update]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// DELETE /api/users/:id — a caller cannot delete themselves
usersRouter.delete('/:id', requireRole(...USER_MANAGER_ROLES), async (req, res) => {
  if (req.params.id === req.user!.userId) {
    err(res, 400, 'bad_request', 'Cannot delete your own account');
    return;
  }
  try {
    const target = await loadTargetRole(req.user!.businessId, req.params.id!);
    if (!target) { err(res, 404, 'not_found', 'User not found'); return; }
    if (!canManageTarget(req.user!.role, target.role)) {
      err(res, 403, 'forbidden', 'You are not allowed to manage that user');
      return;
    }
    await withTenant(req.user!.businessId, (tx) =>
      tx.user.delete({ where: { id: req.params.id } }),
    );
    ok(res, { message: 'User deleted' });
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'User not found'); return; }
    console.error('[users/delete]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// POST /api/users/:id/reset-password — business_admin & user_full_admin (staff targets)
usersRouter.post('/:id/reset-password', requireRole(...USER_MANAGER_ROLES), async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password || password.length < 6) {
    err(res, 400, 'validation_error', 'Password must be at least 6 characters');
    return;
  }
  try {
    const target = await loadTargetRole(req.user!.businessId, req.params.id!);
    if (!target) { err(res, 404, 'not_found', 'User not found'); return; }
    if (!canManageTarget(req.user!.role, target.role)) {
      err(res, 403, 'forbidden', 'You are not allowed to manage that user');
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await withTenant(req.user!.businessId, (tx) =>
      tx.user.update({ where: { id: req.params.id }, data: { passwordHash } }),
    );
    ok(res, { message: 'Password reset successfully' });
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'User not found'); return; }
    console.error('[users/reset-password]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

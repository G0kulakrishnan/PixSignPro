import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withSystem } from '@pixsignpro/db';
import { requireSuperAdmin } from '../../middleware/superAdminAuth';
import { ok, err } from '../../lib/response';

export const adminUsersRouter = Router();
adminUsersRouter.use(requireSuperAdmin);

const ROLE_ENUM = z.enum([
  'staff', 'media_admin', 'business_admin', 'user_full_admin', 'user_creation_admin',
]);

const USER_SELECT = {
  id: true, name: true, mobileNo: true, role: true, city: true, agencyName: true,
  isActive: true, expiresAt: true, lastAppOpenedAt: true, createdAt: true,
  business: { select: { id: true, name: true, subscriptionStatus: true, subscriptionEnd: true, isActive: true } },
} as const;

// GET /api/admin/users?search=&businessId= — all users across every tenant,
// with their business and per-user expiry. Super-admin cross-tenant view.
adminUsersRouter.get('/', async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const businessId = String(req.query.businessId ?? '').trim();

  try {
    const where: any = {};
    if (businessId) where.businessId = businessId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { mobileNo: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await withSystem((tx) =>
      tx.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ business: { name: 'asc' } }, { createdAt: 'asc' }],
      }),
    );

    const now = new Date();
    const rows = users.map((u) => {
      const userExpired = !!u.expiresAt && u.expiresAt < now;
      const bizActive =
        u.business.isActive &&
        u.business.subscriptionStatus === 'active' &&
        (!u.business.subscriptionEnd || u.business.subscriptionEnd >= now);
      return {
        ...u,
        status: u.isActive && bizActive && !userExpired ? 'active' : 'inactive',
        expired: userExpired,
      };
    });

    ok(res, rows);
  } catch (e) {
    console.error('[admin/users/list]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// GET /api/admin/users/:id — single user, full detail, cross-tenant.
adminUsersRouter.get('/:id', async (req, res) => {
  try {
    const user = await withSystem((tx) =>
      tx.user.findUnique({ where: { id: req.params.id }, select: USER_SELECT }),
    );
    if (!user) { err(res, 404, 'not_found', 'User not found'); return; }
    ok(res, user);
  } catch (e) {
    console.error('[admin/users/get]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

const createSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(1),
  mobileNo: z.string().min(10).max(15),
  password: z.string().min(6),
  role: ROLE_ENUM,
  city: z.string().optional(),
  agencyName: z.string().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

// POST /api/admin/users — create a user in any business. Super_admin may assign
// any role (no privilege-escalation guard — it's already the top of the hierarchy).
adminUsersRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }
  const { businessId, name, mobileNo, password, role, city, agencyName, expiresAt } = parsed.data;

  try {
    const business = await withSystem((tx) =>
      tx.business.findUnique({ where: { id: businessId }, include: { plan: true } }),
    );
    if (!business) { err(res, 404, 'not_found', 'Business not found'); return; }

    // mobile_no is globally unique across all tenants.
    const existing = await withSystem((tx) => tx.user.findUnique({ where: { mobileNo } }));
    if (existing) { err(res, 409, 'mobile_taken', 'Mobile number already registered'); return; }

    // Plan max_users limit (-1 = unlimited).
    const maxUsers = business.plan?.maxUsers ?? -1;
    if (maxUsers >= 0) {
      const userCount = await withSystem((tx) => tx.user.count({ where: { businessId } }));
      if (userCount >= maxUsers) {
        err(res, 403, 'plan_limit', `User limit reached for this business (max ${maxUsers})`);
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await withSystem((tx) =>
      tx.user.create({
        data: {
          businessId, mobileNo, passwordHash, name, role, city, agencyName,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        select: USER_SELECT,
      }),
    );
    ok(res, user, 201);
  } catch (e) {
    console.error('[admin/users/create]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  mobileNo: z.string().min(10).max(15).optional(),
  password: z.string().min(6).optional(),
  role: ROLE_ENUM.optional(),
  city: z.string().optional(),
  agencyName: z.string().optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

// PUT /api/admin/users/:id — full edit (name, mobile, role, city, agency,
// active flag, expiry, and optionally a new password).
adminUsersRouter.put('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }

  try {
    if (parsed.data.mobileNo) {
      const existing = await withSystem((tx) => tx.user.findUnique({ where: { mobileNo: parsed.data.mobileNo } }));
      if (existing && existing.id !== req.params.id) {
        err(res, 409, 'conflict', 'Mobile number already in use by another user');
        return;
      }
    }

    const { password, expiresAt, ...rest } = parsed.data;
    const data: any = { ...rest };
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (password) data.passwordHash = await bcrypt.hash(password, 12);

    const user = await withSystem((tx) =>
      tx.user.update({ where: { id: req.params.id }, data, select: USER_SELECT }),
    );
    ok(res, user);
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'User not found'); return; }
    if (e?.code === 'P2002') { err(res, 409, 'conflict', 'Mobile number already in use'); return; }
    console.error('[admin/users/update]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

const expirySchema = z.object({
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/admin/users/:id — quick-action: set per-user expiry / active flag.
adminUsersRouter.patch('/:id', async (req, res) => {
  const parsed = expirySchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }

  const data: any = {};
  if (parsed.data.expiresAt !== undefined)
    data.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

  try {
    const user = await withSystem((tx) =>
      tx.user.update({
        where: { id: req.params.id },
        data,
        select: { id: true, name: true, expiresAt: true, isActive: true },
      }),
    );
    ok(res, user);
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'User not found'); return; }
    console.error('[admin/users/update]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// DELETE /api/admin/users/:id — remove a user from any business.
adminUsersRouter.delete('/:id', async (req, res) => {
  try {
    await withSystem((tx) => tx.user.delete({ where: { id: req.params.id } }));
    ok(res, { message: 'User deleted' });
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'User not found'); return; }
    console.error('[admin/users/delete]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

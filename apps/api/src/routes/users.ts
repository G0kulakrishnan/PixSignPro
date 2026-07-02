import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withTenant, withSystem } from '@pixsignpro/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { ok, err } from '../lib/response';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const createUserSchema = z.object({
  mobileNo: z.string().min(10).max(15),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['staff', 'media_admin', 'business_admin']),
  city: z.string().optional(),
  agencyName: z.string().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['staff', 'media_admin', 'business_admin']).optional(),
  city: z.string().optional(),
  agencyName: z.string().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/users — list all users in the business
usersRouter.get('/', requireRole('business_admin', 'media_admin'), async (req, res) => {
  try {
    const users = await withTenant(req.user!.businessId, (tx) =>
      tx.user.findMany({
        select: {
          id: true, name: true, mobileNo: true, role: true,
          city: true, agencyName: true, isActive: true, createdAt: true,
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

// POST /api/users — create a new user (business_admin only)
usersRouter.post('/', requireRole('business_admin'), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }

  const { mobileNo, password, name, role, city, agencyName } = parsed.data;
  const businessId = req.user!.businessId;

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
        data: { businessId, mobileNo, passwordHash, name, role, city, agencyName },
        select: { id: true, name: true, mobileNo: true, role: true, isActive: true },
      }),
    );
    ok(res, user, 201);
  } catch (e) {
    console.error('[users/create]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// GET /api/users/:id
usersRouter.get('/:id', requireRole('business_admin'), async (req, res) => {
  try {
    const user = await withTenant(req.user!.businessId, (tx) =>
      tx.user.findUnique({
        where: { id: req.params.id },
        select: {
          id: true, name: true, mobileNo: true, role: true,
          city: true, agencyName: true, isActive: true, createdAt: true,
        },
      }),
    );
    if (!user) { err(res, 404, 'not_found', 'User not found'); return; }
    ok(res, user);
  } catch (e) {
    console.error('[users/get]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// PUT /api/users/:id
usersRouter.put('/:id', requireRole('business_admin'), async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }
  try {
    const user = await withTenant(req.user!.businessId, (tx) =>
      tx.user.update({ where: { id: req.params.id }, data: parsed.data,
        select: { id: true, name: true, role: true, isActive: true } }),
    );
    ok(res, user);
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'User not found'); return; }
    console.error('[users/update]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// DELETE /api/users/:id — business_admin cannot delete themselves
usersRouter.delete('/:id', requireRole('business_admin'), async (req, res) => {
  if (req.params.id === req.user!.userId) {
    err(res, 400, 'bad_request', 'Cannot delete your own account');
    return;
  }
  try {
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

// POST /api/users/:id/reset-password — business_admin only
usersRouter.post('/:id/reset-password', requireRole('business_admin'), async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password || password.length < 6) {
    err(res, 400, 'validation_error', 'Password must be at least 6 characters');
    return;
  }
  try {
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

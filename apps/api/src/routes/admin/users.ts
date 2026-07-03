import { Router } from 'express';
import { z } from 'zod';
import { withSystem } from '@pixsignpro/db';
import { requireSuperAdmin } from '../../middleware/superAdminAuth';
import { ok, err } from '../../lib/response';

export const adminUsersRouter = Router();
adminUsersRouter.use(requireSuperAdmin);

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
        select: {
          id: true, name: true, mobileNo: true, role: true, city: true,
          isActive: true, expiresAt: true, lastAppOpenedAt: true, createdAt: true,
          business: {
            select: {
              id: true, name: true, subscriptionStatus: true, subscriptionEnd: true, isActive: true,
            },
          },
        },
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

const updateSchema = z.object({
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/admin/users/:id — set per-user expiry / active flag.
adminUsersRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
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

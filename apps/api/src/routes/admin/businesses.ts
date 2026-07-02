import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withSystem } from '@pixsignpro/db';
import { requireSuperAdmin } from '../../middleware/superAdminAuth';
import { ok, err } from '../../lib/response';

export const businessesRouter = Router();
businessesRouter.use(requireSuperAdmin);

const createBusinessSchema = z.object({
  name: z.string().min(1),
  agencyName: z.string().optional(),
  city: z.string().optional(),
  website: z.string().optional(),
  planId: z.string().uuid().optional(),
  subscriptionStatus: z.enum(['active', 'expired', 'suspended']).default('active'),
  subscriptionStart: z.string().datetime().optional(),
  subscriptionEnd: z.string().datetime().optional(),
  // First business_admin account
  adminName: z.string().min(1),
  adminMobileNo: z.string().min(10).max(15),
  adminPassword: z.string().min(6),
});

const updateBusinessSchema = z.object({
  name: z.string().min(1).optional(),
  agencyName: z.string().optional(),
  city: z.string().optional(),
  website: z.string().optional(),
  planId: z.string().uuid().optional(),
  subscriptionStatus: z.enum(['active', 'expired', 'suspended']).optional(),
  subscriptionStart: z.string().datetime().nullable().optional(),
  subscriptionEnd: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/admin/businesses — list all businesses with user/media counts
businessesRouter.get('/', async (_req, res) => {
  try {
    const businesses = await withSystem((tx) =>
      tx.business.findMany({
        include: {
          plan: { select: { name: true, price: true } },
          _count: { select: { users: true, media: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    ok(res, businesses);
  } catch (e) {
    console.error('[admin/businesses/list]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// GET /api/admin/businesses/:id — single business with full details
businessesRouter.get('/:id', async (req, res) => {
  try {
    const business = await withSystem((tx) =>
      tx.business.findUnique({
        where: { id: req.params.id },
        include: {
          plan: true,
          users: {
            select: {
              id: true, name: true, mobileNo: true, role: true,
              isActive: true, createdAt: true,
            },
          },
          _count: { select: { media: true, mediaEvents: true } },
        },
      }),
    );
    if (!business) { err(res, 404, 'not_found', 'Business not found'); return; }
    ok(res, business);
  } catch (e) {
    console.error('[admin/businesses/get]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// POST /api/admin/businesses — create business + first business_admin
businessesRouter.post('/', async (req, res) => {
  const parsed = createBusinessSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }

  const { adminName, adminMobileNo, adminPassword, subscriptionStart, subscriptionEnd, planId, ...bizData } = parsed.data;

  try {
    // Check mobile is globally unique
    const existing = await withSystem((tx) =>
      tx.user.findUnique({ where: { mobileNo: adminMobileNo } }),
    );
    if (existing) {
      err(res, 409, 'mobile_taken', 'Mobile number already registered');
      return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const business = await withSystem(async (tx) => {
      const biz = await tx.business.create({
        data: {
          ...bizData,
          ...(planId ? { plan: { connect: { id: planId } } } : {}),
          subscriptionStart: subscriptionStart ? new Date(subscriptionStart) : undefined,
          subscriptionEnd: subscriptionEnd ? new Date(subscriptionEnd) : undefined,
        },
      });

      await tx.user.create({
        data: {
          businessId: biz.id,
          mobileNo: adminMobileNo,
          passwordHash,
          name: adminName,
          role: 'business_admin',
        },
      });

      return biz;
    });

    ok(res, business, 201);
  } catch (e) {
    console.error('[admin/businesses/create]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// PUT /api/admin/businesses/:id — update plan, subscription, status
businessesRouter.put('/:id', async (req, res) => {
  const parsed = updateBusinessSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }

  const { subscriptionStart, subscriptionEnd, ...rest } = parsed.data;
  const data: any = { ...rest };
  if (subscriptionStart !== undefined)
    data.subscriptionStart = subscriptionStart ? new Date(subscriptionStart) : null;
  if (subscriptionEnd !== undefined)
    data.subscriptionEnd = subscriptionEnd ? new Date(subscriptionEnd) : null;

  try {
    const business = await withSystem((tx) =>
      tx.business.update({ where: { id: req.params.id }, data }),
    );
    ok(res, business);
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'Business not found'); return; }
    console.error('[admin/businesses/update]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// DELETE /api/admin/businesses/:id — soft delete (deactivate)
businessesRouter.delete('/:id', async (req, res) => {
  try {
    await withSystem((tx) =>
      tx.business.update({
        where: { id: req.params.id },
        data: { isActive: false, subscriptionStatus: 'suspended' },
      }),
    );
    ok(res, { message: 'Business deactivated' });
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'Business not found'); return; }
    console.error('[admin/businesses/delete]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

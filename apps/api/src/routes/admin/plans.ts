import { Router } from 'express';
import { z } from 'zod';
import { withSystem, Prisma } from '@pixsignpro/db';
import { requireSuperAdmin } from '../../middleware/superAdminAuth';
import { ok, err } from '../../lib/response';

export const plansRouter = Router();
plansRouter.use(requireSuperAdmin);

const planSchema = z.object({
  name: z.string().min(1),
  price: z.number().min(0),
  currency: z.string().default('INR'),
  billingPeriod: z.enum(['monthly', 'quarterly', 'yearly']),
  maxUsers: z.number().int().min(-1),      // -1 = unlimited
  maxStorageMb: z.number().int().min(-1),  // -1 = unlimited
  maxImages: z.number().int().min(-1),     // -1 = unlimited
  maxVideos: z.number().int().min(-1),     // -1 = unlimited
  features: z.record(z.unknown()).optional().default({}),
  isActive: z.boolean().optional().default(true),
});

// GET /api/admin/plans
plansRouter.get('/', async (_req, res) => {
  try {
    const plans = await withSystem((tx) =>
      tx.subscriptionPlan.findMany({ orderBy: { price: 'asc' } }),
    );
    ok(res, plans);
  } catch (e) {
    console.error('[admin/plans/list]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// POST /api/admin/plans
plansRouter.post('/', async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }
  try {
    const plan = await withSystem((tx) =>
      tx.subscriptionPlan.create({
        data: { ...parsed.data, features: parsed.data.features as Prisma.InputJsonValue },
      }),
    );
    ok(res, plan, 201);
  } catch (e) {
    console.error('[admin/plans/create]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// PUT /api/admin/plans/:id
plansRouter.put('/:id', async (req, res) => {
  const parsed = planSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }
  try {
    const { features, ...rest } = parsed.data;
    const plan = await withSystem((tx) =>
      tx.subscriptionPlan.update({
        where: { id: req.params.id },
        data: { ...rest, ...(features !== undefined ? { features: features as Prisma.InputJsonValue } : {}) },
      }),
    );
    ok(res, plan);
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'Plan not found'); return; }
    console.error('[admin/plans/update]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

// DELETE /api/admin/plans/:id
plansRouter.delete('/:id', async (req, res) => {
  try {
    await withSystem((tx) =>
      tx.subscriptionPlan.update({
        where: { id: req.params.id },
        data: { isActive: false },
      }),
    );
    ok(res, { message: 'Plan deactivated' });
  } catch (e: any) {
    if (e?.code === 'P2025') { err(res, 404, 'not_found', 'Plan not found'); return; }
    console.error('[admin/plans/delete]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

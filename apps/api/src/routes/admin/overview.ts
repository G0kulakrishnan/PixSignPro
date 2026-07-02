import { Router } from 'express';
import { withSystem } from '@pixsignpro/db';
import { requireSuperAdmin } from '../../middleware/superAdminAuth';
import { ok, err } from '../../lib/response';

export const overviewRouter = Router();
overviewRouter.use(requireSuperAdmin);

// GET /api/admin/overview — platform-wide stats
overviewRouter.get('/', async (_req, res) => {
  try {
    const [totalBusinesses, activeBusinesses, totalUsers, totalMedia, recentBusinesses] =
      await Promise.all([
        withSystem((tx) => tx.business.count()),
        withSystem((tx) => tx.business.count({ where: { isActive: true, subscriptionStatus: 'active' } })),
        withSystem((tx) => tx.user.count()),
        withSystem((tx) => tx.media.count()),
        withSystem((tx) =>
          tx.business.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              plan: { select: { name: true } },
              _count: { select: { users: true, media: true } },
            },
          }),
        ),
      ]);

    ok(res, {
      stats: { totalBusinesses, activeBusinesses, totalUsers, totalMedia },
      recentBusinesses,
    });
  } catch (e) {
    console.error('[admin/overview]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

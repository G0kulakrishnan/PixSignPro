import { Router } from 'express';
import { z } from 'zod';
import { withTenant } from '@pixsignpro/db';
import { requireAuth } from '../middleware/auth';
import { ok, err } from '../lib/response';

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

const eventSchema = z.object({
  mediaId: z.string().uuid().optional(),
  eventType: z.enum(['download', 'share', 'view']),
});

// POST /api/events — track a media event or app-open
eventsRouter.post('/', async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }

  const { mediaId, eventType } = parsed.data as { mediaId?: string; eventType: 'download' | 'share' | 'view' };
  const { businessId, userId } = req.user!;

  try {
    // Record the event (media-scoped or app-open)
    if (mediaId) {
      // Verify media belongs to this business (RLS also enforces this)
      const media = await withTenant(businessId, (tx) =>
        tx.media.findUnique({ where: { id: mediaId }, select: { id: true } }),
      );
      if (!media) { err(res, 404, 'not_found', 'Media not found'); return; }

      await withTenant(businessId, (tx) =>
        tx.mediaEvent.create({
          data: { businessId, mediaId, userId, eventType },
        }),
      );
    }

    // Update last_app_opened_at on every event (tracks app activity)
    await withTenant(businessId, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: { lastAppOpenedAt: new Date() },
      }),
    );

    ok(res, { recorded: true });
  } catch (e) {
    console.error('[events]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

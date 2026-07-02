import { Router } from 'express';
import { withTenant } from '@pixsignpro/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { ok, err } from '../lib/response';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);
analyticsRouter.use(requireRole('business_admin', 'media_admin'));

// GET /api/analytics
// Returns the analytics table: per user × media event aggregation
analyticsRouter.get('/', async (req, res) => {
  const businessId = req.user!.businessId;

  try {
    // Fetch users and their events + media in a single tenant-scoped query set
    const [users, events, media] = await Promise.all([
      withTenant(businessId, (tx) =>
        tx.user.findMany({
          where: { businessId },
          select: { id: true, name: true, mobileNo: true, city: true, lastAppOpenedAt: true },
        }),
      ),
      withTenant(businessId, (tx) =>
        tx.mediaEvent.findMany({
          where: { businessId },
          select: { userId: true, mediaId: true, eventType: true, createdAt: true },
        }),
      ),
      withTenant(businessId, (tx) =>
        tx.media.findMany({
          where: { businessId },
          select: { id: true, title: true, type: true, createdAt: true },
        }),
      ),
    ]);

    const mediaMap = new Map(media.map((m) => [m.id, m]));

    // Aggregate per user + media
    type Row = {
      userId: string; username: string; mobileNo: string; city: string | null;
      mediaName: string; uploadedDate: Date | null; mediaId: string;
      imageShared: number; imageDownloaded: number;
      videoShared: number; videoDownloaded: number;
      appOpenedDate: Date | null; date: string | null;
    };
    const rowMap = new Map<string, Row>();

    for (const ev of events) {
      const user = users.find((u) => u.id === ev.userId) ?? null;
      const med = ev.mediaId ? mediaMap.get(ev.mediaId) : undefined;
      if (!user || !med) continue;

      const key = `${ev.userId}::${ev.mediaId}`;
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          userId: user.id, username: user.name, mobileNo: user.mobileNo,
          city: user.city, mediaName: med.title, uploadedDate: med.createdAt,
          mediaId: med.id, imageShared: 0, imageDownloaded: 0,
          videoShared: 0, videoDownloaded: 0,
          appOpenedDate: user.lastAppOpenedAt,
          date: ev.createdAt.toISOString().slice(0, 10),
        });
      }

      const row = rowMap.get(key)!;
      if (med.type === 'image') {
        if (ev.eventType === 'share') row.imageShared++;
        if (ev.eventType === 'download') row.imageDownloaded++;
      } else {
        if (ev.eventType === 'share') row.videoShared++;
        if (ev.eventType === 'download') row.videoDownloaded++;
      }
    }

    const rows = [...rowMap.values()].map((r, i) => ({
      sNo: i + 1,
      username: r.username,
      mobileNo: r.mobileNo,
      city: r.city,
      mediaName: r.mediaName,
      uploadedDate: r.uploadedDate,
      imageShared: r.imageShared,
      imageDownloaded: r.imageDownloaded,
      videoShared: r.videoShared,
      videoDownloaded: r.videoDownloaded,
      appOpenedDate: r.appOpenedDate,
      date: r.date,
    }));

    ok(res, rows);
  } catch (e) {
    console.error('[analytics]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

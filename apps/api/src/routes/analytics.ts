import { Router } from 'express';
import { withTenant } from '@pixsignpro/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { ok, err } from '../lib/response';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);
analyticsRouter.use(requireRole('business_admin', 'media_admin'));

// GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns the analytics table: per user × media event aggregation
analyticsRouter.get('/', async (req, res) => {
  const businessId = req.user!.businessId;

  // Optional date range filter
  const fromDate = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : undefined;
  const toDate   = req.query.to   ? new Date(`${req.query.to}T23:59:59.999Z`)   : undefined;

  const eventWhere: any = { businessId };
  if (fromDate || toDate) {
    eventWhere.createdAt = {};
    if (fromDate) eventWhere.createdAt.gte = fromDate;
    if (toDate)   eventWhere.createdAt.lte = toDate;
  }

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
          where: eventWhere,
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
    const userMap = new Map(users.map((u) => [u.id, u]));

    // App-open aggregation: count + latest open per user (events with no media).
    const appOpenByUser = new Map<string, { count: number; latest: Date }>();
    for (const ev of events) {
      if (ev.eventType !== 'app_open' || !ev.userId) continue;
      const cur = appOpenByUser.get(ev.userId) ?? { count: 0, latest: new Date(0) };
      cur.count += 1;
      if (ev.createdAt > cur.latest) cur.latest = ev.createdAt;
      appOpenByUser.set(ev.userId, cur);
    }

    // Aggregate per user + media (download/share only).
    type Row = {
      userId: string; username: string; mobileNo: string; city: string | null;
      mediaName: string; uploadedDate: Date | null; mediaId: string;
      imageShared: number; imageDownloaded: number;
      videoShared: number; videoDownloaded: number;
      appOpenedDate: Date | null; date: string | null;
    };
    const rowMap = new Map<string, Row>();

    for (const ev of events) {
      if (ev.eventType === 'app_open') continue; // handled above
      const user = ev.userId ? userMap.get(ev.userId) : undefined;
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

    // Add "opened but no media activity" rows: users who opened the app in range
    // but have no download/share row — so admins see engagement without action.
    const usersWithRows = new Set([...rowMap.values()].map((r) => r.userId));
    for (const [userId, info] of appOpenByUser) {
      if (usersWithRows.has(userId)) continue;
      const user = userMap.get(userId);
      if (!user) continue;
      rowMap.set(`${userId}::app_open`, {
        userId, username: user.name, mobileNo: user.mobileNo, city: user.city,
        mediaName: '—', uploadedDate: null, mediaId: '',
        imageShared: 0, imageDownloaded: 0, videoShared: 0, videoDownloaded: 0,
        appOpenedDate: info.latest, date: info.latest.toISOString().slice(0, 10),
      });
    }

    const rows = [...rowMap.values()].map((r, i) => {
      const ao = appOpenByUser.get(r.userId);
      return {
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
        appOpened: ao?.count ?? 0,
        appOpenedDate: ao?.latest ?? r.appOpenedDate,
        date: r.date,
      };
    });

    ok(res, rows);
  } catch (e) {
    console.error('[analytics]', e);
    err(res, 500, 'server_error', 'Unexpected error');
  }
});

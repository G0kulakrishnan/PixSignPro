// Scheduled-publish worker. Runs on startup and then hourly.
//
// Flips `published` false→true for any media whose scheduled_publish_at has
// passed (keeping scheduled_publish_at for history/reporting), then pushes an
// FCM notification to every device in that business announcing the new media.

import { withSystem } from '@pixsignpro/db';
import { notifyBusinessNewMedia } from './notify';

const HOUR_MS = 60 * 60 * 1000;

interface DueMedia {
  id: string;
  businessId: string;
  type: string;
  title: string;
}

/** One pass: publish due media and notify. Safe to call repeatedly. */
export async function runPublishPass(): Promise<void> {
  const now = new Date();

  // 1. Find media whose scheduled time has arrived but isn't published yet.
  const due = (await withSystem((tx) =>
    tx.media.findMany({
      where: { published: false, scheduledPublishAt: { not: null, lte: now } },
      select: { id: true, businessId: true, type: true, title: true },
    }),
  )) as DueMedia[];

  if (!due.length) return;

  // 2. Flip published=true (keep scheduled_publish_at for reporting).
  const ids = due.map((m) => m.id);
  await withSystem((tx) =>
    tx.media.updateMany({ where: { id: { in: ids } }, data: { published: true } }),
  );
  console.log(`[publish-cron] published ${due.length} scheduled media item(s).`);

  // 3. Group by business and notify each tenant's devices.
  const byBusiness = new Map<string, DueMedia[]>();
  for (const m of due) {
    const arr = byBusiness.get(m.businessId) ?? [];
    arr.push(m);
    byBusiness.set(m.businessId, arr);
  }

  for (const [businessId, items] of byBusiness) {
    await notifyBusinessNewMedia(businessId, items);
  }
}

/** Start the hourly scheduler. Runs one pass immediately, then every hour. */
export function startPublishCron(): void {
  runPublishPass().catch((e) => console.error('[publish-cron] initial pass failed:', e));
  setInterval(() => {
    runPublishPass().catch((e) => console.error('[publish-cron] pass failed:', e));
  }, HOUR_MS);
  console.log('[publish-cron] started (hourly).');
}

// Scheduled-publish worker. Runs on startup and then hourly.
//
// Flips `published` false→true for any media whose scheduled_publish_at has
// passed (keeping scheduled_publish_at for history/reporting), then pushes an
// FCM notification to every device in that business announcing the new media.

import { withSystem } from '@pixsignpro/db';
import { sendPushToTokens } from './fcm';

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
    await notifyBusiness(businessId, items);
  }
}

async function notifyBusiness(businessId: string, items: DueMedia[]): Promise<void> {
  try {
    const tokens = await withSystem((tx) =>
      tx.fcmToken.findMany({ where: { businessId }, select: { token: true } }),
    );
    if (!tokens.length) return;

    const images = items.filter((i) => i.type === 'image').length;
    const videos = items.length - images;

    const { title, body } = buildMessage(images, videos, items[0]?.title);
    const result = await sendPushToTokens(
      tokens.map((t) => t.token),
      title,
      body,
      { type: 'media_published', count: String(items.length) },
    );

    // Prune dead tokens so we don't keep retrying them.
    if (result.invalidTokens.length) {
      await withSystem((tx) =>
        tx.fcmToken.deleteMany({ where: { businessId, token: { in: result.invalidTokens } } }),
      );
    }
  } catch (e) {
    console.error(`[publish-cron] notify failed for business ${businessId}:`, e);
  }
}

function buildMessage(images: number, videos: number, firstTitle?: string): { title: string; body: string } {
  const total = images + videos;
  if (total === 1) {
    const kind = images === 1 ? 'image' : 'video';
    return {
      title: `New ${kind} available`,
      body: firstTitle ? `"${firstTitle}" is now available to download.` : `A new ${kind} is ready for you.`,
    };
  }
  const parts: string[] = [];
  if (images) parts.push(`${images} image${images > 1 ? 's' : ''}`);
  if (videos) parts.push(`${videos} video${videos > 1 ? 's' : ''}`);
  return {
    title: 'New media available',
    body: `${parts.join(' and ')} are now available to download.`,
  };
}

/** Start the hourly scheduler. Runs one pass immediately, then every hour. */
export function startPublishCron(): void {
  runPublishPass().catch((e) => console.error('[publish-cron] initial pass failed:', e));
  setInterval(() => {
    runPublishPass().catch((e) => console.error('[publish-cron] pass failed:', e));
  }, HOUR_MS);
  console.log('[publish-cron] started (hourly).');
}

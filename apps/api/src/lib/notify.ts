// Shared "new media available" push-notification helper.
//
// Used by BOTH publish paths so notifications are consistent:
//   - immediate uploads (media route, when scheduledPublishAt is null)
//   - scheduled publishes (publishCron, when the scheduled time passes)
//
// Sends an FCM push to every registered device in the business, then prunes
// any dead tokens. A no-op (logged) until FCM is configured — see lib/fcm.ts.

import { withSystem } from '@pixsignpro/db';
import { sendPushToTokens } from './fcm';

export interface NotifiableMedia {
  type: string; // 'image' | 'video'
  title: string;
}

/** Notify a business's devices that new media is available to download. */
export async function notifyBusinessNewMedia(
  businessId: string,
  items: NotifiableMedia[],
): Promise<void> {
  if (!items.length) return;
  try {
    const tokens = await withSystem((tx) =>
      tx.fcmToken.findMany({ where: { businessId }, select: { token: true } }),
    );
    if (!tokens.length) return;

    const images = items.filter((i) => i.type === 'image').length;
    const videos = items.length - images;
    const { title, body } = buildMediaMessage(images, videos, items[0]?.title);

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
    console.error(`[notify] push failed for business ${businessId}:`, e);
  }
}

export function buildMediaMessage(
  images: number,
  videos: number,
  firstTitle?: string,
): { title: string; body: string } {
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

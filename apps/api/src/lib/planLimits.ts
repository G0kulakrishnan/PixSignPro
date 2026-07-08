// Plan limit enforcement for media counts (images / videos).
// -1 = unlimited (matches the schema convention). Enforced on every upload.

import { withSystem, withTenant } from '@pixsignpro/db';

export interface LimitCheck {
  ok: boolean;
  message?: string;
}

/**
 * Check whether adding `addImages` images and `addVideos` videos would exceed
 * the business's plan limits. Returns { ok:false, message } if a limit is hit.
 */
export async function checkMediaCountLimit(
  businessId: string,
  addImages: number,
  addVideos: number,
): Promise<LimitCheck> {
  const [business, imageCount, videoCount] = await Promise.all([
    withSystem((tx) =>
      tx.business.findUnique({ where: { id: businessId }, include: { plan: true } }),
    ),
    withTenant(businessId, (tx) =>
      tx.media.count({ where: { businessId, type: 'image' } }),
    ),
    withTenant(businessId, (tx) =>
      tx.media.count({ where: { businessId, type: 'video' } }),
    ),
  ]);

  const plan = business?.plan;
  if (!plan) return { ok: true }; // no plan → no count limit

  if (plan.maxImages >= 0 && imageCount + addImages > plan.maxImages) {
    return { ok: false, message: `Image limit reached for your plan (max ${plan.maxImages})` };
  }
  if (plan.maxVideos >= 0 && videoCount + addVideos > plan.maxVideos) {
    return { ok: false, message: `Video limit reached for your plan (max ${plan.maxVideos})` };
  }
  return { ok: true };
}

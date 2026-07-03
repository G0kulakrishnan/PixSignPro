// Firebase Cloud Messaging (push notifications) for the mobile app.
//
// "Build now, key later": this module is safe to import and call even when no
// Firebase service account is configured. Until FCM_SERVICE_ACCOUNT_PATH points
// at a valid service-account JSON, sendPushToTokens() is a logged no-op. Drop in
// the key + set the env var + restart to activate real push delivery.

import fs from 'fs';
import admin from 'firebase-admin';

let messaging: admin.messaging.Messaging | null = null;
let initialized = false;

/** Initialise Firebase Admin from the service-account JSON, if configured. */
export function initFcm(): void {
  if (initialized) return;
  initialized = true;

  const keyPath = process.env.FCM_SERVICE_ACCOUNT_PATH;
  if (!keyPath) {
    console.warn('[fcm] FCM_SERVICE_ACCOUNT_PATH not set — push notifications disabled.');
    return;
  }
  if (!fs.existsSync(keyPath)) {
    console.warn(`[fcm] service account not found at ${keyPath} — push notifications disabled.`);
    return;
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    messaging = app.messaging();
    console.log('[fcm] Firebase Admin initialised — push notifications enabled.');
  } catch (e) {
    console.error('[fcm] failed to initialise Firebase Admin — push disabled:', e);
  }
}

/** Is FCM configured and ready to send? */
export function isFcmReady(): boolean {
  return messaging !== null;
}

export interface PushResult {
  sent: number;
  failed: number;
  invalidTokens: string[]; // tokens that are unregistered/invalid and should be pruned
}

/**
 * Send a notification to a list of device tokens.
 * No-op (logged) when FCM isn't configured. Returns which tokens are dead so
 * the caller can delete them.
 */
export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, invalidTokens: [] };
  if (!tokens.length) return result;

  if (!messaging) {
    console.warn(`[fcm] skipped push "${title}" to ${tokens.length} device(s) — FCM not configured.`);
    return result;
  }

  // sendEachForMulticast handles up to 500 tokens per call.
  const BATCH = 500;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    try {
      const resp = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        data,
        android: { priority: 'high', notification: { channelId: 'pixsign_alarm_v6' } },
      });
      result.sent += resp.successCount;
      result.failed += resp.failureCount;
      resp.responses.forEach((r, idx) => {
        const tok = batch[idx];
        if (!r.success && tok) {
          const code = r.error?.code ?? '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            result.invalidTokens.push(tok);
          }
        }
      });
    } catch (e) {
      console.error('[fcm] send batch failed:', e);
      result.failed += batch.length;
    }
  }

  return result;
}

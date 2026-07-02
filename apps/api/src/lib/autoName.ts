import { withTenant } from '@pixsignpro/db';

// Auto-title format: DDMMYYYY_N (IST date, sequential per business per day)
export async function generateAutoTitle(businessId: string): Promise<string> {
  const now = new Date();
  // IST = UTC+5:30
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = ist.getUTCFullYear();
  const prefix = `${dd}${mm}${yyyy}_`;

  // Count auto-named titles for this business today
  const count = await withTenant(businessId, (tx) =>
    tx.media.count({
      where: { businessId, title: { startsWith: prefix } },
    }),
  );

  return `${prefix}${count + 1}`;
}

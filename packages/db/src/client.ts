import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Singleton Prisma client. The connection uses the NON-superuser `pixsignpro`
 * role, so Postgres RLS is enforced. Never run tenant queries directly on this
 * client without a tenant context — use `withTenant` (or `withSystem`).
 */
export const prisma = new PrismaClient();

export type Tx = Prisma.TransactionClient;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run queries scoped to a single tenant.
 *
 * Opens a transaction and sets `app.current_business_id` for its duration, so
 * every statement is filtered by Postgres RLS. This is the ONLY way tenant code
 * should touch the database — it guarantees isolation even if an individual
 * query forgets an explicit `business_id` filter.
 *
 * @param businessId tenant UUID (from the verified JWT — never from client input)
 */
export async function withTenant<T>(businessId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(businessId)) {
    // Fail closed: an invalid tenant id must never reach a raw SET LOCAL.
    throw new Error('withTenant: businessId must be a valid UUID');
  }
  return prisma.$transaction(async (tx) => {
    // SET LOCAL cannot be parameterized; businessId is validated as a UUID above,
    // so interpolation here is safe from injection.
    await tx.$executeRawUnsafe(`SET LOCAL app.current_business_id = '${businessId}'`);
    return fn(tx);
  });
}

/**
 * Privileged path that BYPASSES tenant RLS. Use ONLY for:
 *   - super_admin cross-tenant operations (must be RBAC-guarded + audited), and
 *   - narrow system lookups that legitimately cross tenants, e.g. resolving a
 *     user by globally-unique mobile number at login.
 *
 * Every call site is a deliberate, reviewed relaxation of isolation. Keep the
 * work inside as small as possible.
 */
export async function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.bypass_rls = 'on'`);
    return fn(tx);
  });
}

export { prisma, withTenant, withSystem } from './client';
export type { Tx } from './client';

// Re-export Prisma-generated types & enums for consumers.
export * from '@prisma/client';

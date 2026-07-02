import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, withSystem, withTenant } from '../src';

// These tests PROVE tenant isolation and gate merges (see CLAUDE.md §9).
// They require a running database with migrations + RLS applied:
//   npm run -w @pixsignpro/db migrate:dev
//   npm run -w @pixsignpro/db rls
//   npm run -w @pixsignpro/db test

const tag = Date.now().toString();
let bizA = '';
let bizB = '';

beforeAll(async () => {
  await withSystem(async (tx) => {
    const a = await tx.business.create({ data: { name: `ISO_A_${tag}` } });
    const b = await tx.business.create({ data: { name: `ISO_B_${tag}` } });
    bizA = a.id;
    bizB = b.id;

    await tx.media.create({
      data: {
        businessId: a.id,
        type: 'image',
        title: 'a1',
        fileName: `a1_${tag}`,
        filePath: `/x/a1_${tag}`,
        fileSize: BigInt(10),
        mimeType: 'image/png',
      },
    });
    await tx.media.create({
      data: {
        businessId: b.id,
        type: 'image',
        title: 'b1',
        fileName: `b1_${tag}`,
        filePath: `/x/b1_${tag}`,
        fileSize: BigInt(10),
        mimeType: 'image/png',
      },
    });

    await tx.user.create({
      data: { businessId: a.id, mobileNo: `a${tag}`, passwordHash: 'x', name: 'ua' },
    });
    await tx.user.create({
      data: { businessId: b.id, mobileNo: `b${tag}`, passwordHash: 'x', name: 'ub' },
    });
  });
});

afterAll(async () => {
  await withSystem(async (tx) => {
    await tx.business.deleteMany({ where: { id: { in: [bizA, bizB] } } });
  });
  await prisma.$disconnect();
});

describe('tenant isolation (RLS)', () => {
  it('a tenant sees only its own media', async () => {
    const rows = await withTenant(bizA, (tx) => tx.media.findMany());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.businessId).toBe(bizA);
  });

  it('(a) cross-tenant READ returns nothing even with an explicit foreign filter', async () => {
    const rows = await withTenant(bizA, (tx) =>
      tx.media.findMany({ where: { businessId: bizB } }),
    );
    expect(rows).toHaveLength(0);
  });

  it('(b) cross-tenant WRITE is blocked by RLS WITH CHECK', async () => {
    await expect(
      withTenant(bizA, (tx) =>
        tx.media.create({
          data: {
            businessId: bizB, // tampered: points at another tenant
            type: 'image',
            title: 'evil',
            fileName: `evil_${tag}`,
            filePath: `/x/evil_${tag}`,
            fileSize: BigInt(1),
            mimeType: 'image/png',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('(c) a tampered business_id cannot escape the tenant on read', async () => {
    const foreign = await withTenant(bizA, (tx) => tx.user.findMany({ where: { businessId: bizB } }));
    expect(foreign).toHaveLength(0);
  });

  it('(d) no tenant context => default DENY (RLS blocks the query)', async () => {
    const rows = await prisma.media.findMany();
    expect(rows).toHaveLength(0);
  });

  it('super_admins table is invisible to a tenant', async () => {
    const rows = await withTenant(bizA, (tx) => tx.superAdmin.findMany());
    expect(rows).toHaveLength(0);
  });
});

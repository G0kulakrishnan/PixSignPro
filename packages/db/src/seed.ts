import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma, withSystem } from './client';

/**
 * Seed initial data:
 *   - one super_admin (platform operator)
 *   - one demo subscription plan
 *   - one demo business + its first business_admin
 *
 * Credentials come from env (see .env.example). Runs via the `withSystem`
 * (bypass) path because it creates cross-tenant / platform data.
 */
async function main() {
  const superMobile = process.env.SEED_SUPERADMIN_MOBILE ?? '9000000000';
  const superPass = process.env.SEED_SUPERADMIN_PASSWORD ?? 'ChangeMe_SuperAdmin1';
  const bizAdminMobile = process.env.SEED_BUSINESS_ADMIN_MOBILE ?? '9111111111';
  const bizAdminPass = process.env.SEED_BUSINESS_ADMIN_PASSWORD ?? 'ChangeMe_BizAdmin1';

  const [superHash, bizAdminHash] = await Promise.all([
    bcrypt.hash(superPass, 12),
    bcrypt.hash(bizAdminPass, 12),
  ]);

  await withSystem(async (tx) => {
    // Super admin
    await tx.superAdmin.upsert({
      where: { mobileNo: superMobile },
      update: {},
      create: { mobileNo: superMobile, name: 'Platform Owner', passwordHash: superHash },
    });

    // Demo plan (find by name; plan name isn't a unique key so use findFirst)
    let plan = await tx.subscriptionPlan.findFirst({ where: { name: 'Starter' } });
    if (!plan) {
      plan = await tx.subscriptionPlan.create({
        data: {
          name: 'Starter',
          price: 999,
          currency: 'INR',
          billingPeriod: 'monthly',
          maxUsers: 25,
          maxStorageMb: 5120,
          features: { scheduledPublish: true, analytics: true },
        },
      });
    }

    // Demo business + first business_admin
    const existing = await tx.user.findUnique({ where: { mobileNo: bizAdminMobile } });
    if (!existing) {
      const business = await tx.business.create({
        data: {
          name: 'Demo Agency',
          agencyName: 'Demo Agency',
          city: 'Chennai',
          planId: plan.id,
          subscriptionStatus: 'active',
          subscriptionStart: new Date(),
        },
      });
      await tx.user.create({
        data: {
          businessId: business.id,
          mobileNo: bizAdminMobile,
          passwordHash: bizAdminHash,
          role: 'business_admin',
          name: 'Demo Admin',
          city: 'Chennai',
        },
      });
      console.log(`✔ Created demo business ${business.id} + business_admin (${bizAdminMobile})`);
    } else {
      console.log('• Demo business_admin already exists, skipping.');
    }
  });

  console.log('✔ Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

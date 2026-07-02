# PixSign Pro

Multi-tenant B2B SaaS for uploading and distributing images/videos to staff.
See [CLAUDE.md](./CLAUDE.md) for architecture & rules, and [PLAN.md](./PLAN.md) for the roadmap.

## Monorepo layout

```
apps/
  api/    Express + Prisma API (port 3010)          [scaffold]
  web/    React business portal                     [pending]
  admin/  React super-admin panel                   [pending]
packages/
  db/     Prisma schema, RLS policies, client, seed [built]
```

## Prerequisites

- Node >= 20, npm >= 10
- PostgreSQL (VPS): DB `pixsignpro`, non-superuser role `pixsignpro`, port 5432

## Local / first-time setup

```bash
# 1. Install all workspaces
npm install

# 2. Configure env (both files are gitignored)
cp packages/db/.env.example packages/db/.env   # set DATABASE_URL + seed creds
cp apps/api/.env.example   apps/api/.env        # set DATABASE_URL, JWT secrets, STORAGE_DIR

# 3. Generate Prisma client
npm run db:generate
```

## Database: migrate + RLS + seed (run on the server / where the DB is reachable)

```bash
# Create tables from the schema
npm run db:migrate:dev        # dev: creates a migration
# or, on the server for an existing migration history:
npm run db:migrate            # prisma migrate deploy

# Apply Row-Level Security policies (idempotent — run after EVERY migrate)
npm run db:rls

# Seed super_admin + demo plan + demo business/admin
npm run db:seed

# Shortcut for all three (deploy + rls + seed):
npm run db:setup
```

> **RLS ordering matters.** Always run `db:rls` after any migration so new/changed
> tenant tables get their policies + `FORCE ROW LEVEL SECURITY`.

## Tenant-isolation tests (merge gate)

```bash
npm run db:test
```
Proves: cross-tenant read blocked, cross-tenant write blocked, tampered `business_id`
contained, and default-deny when no tenant context is set. Requires a DB with
migrations + RLS applied.

## Run the API (dev)

```bash
npm run dev:api        # http://localhost:3010/health
```

## Deploy (VPS)

- App path: `/var/www/pixsignpro` — run as user `pixsignpro-deploy` (never root).
- Media dir: `/var/www/pixsignpro/storage` (owner-only `700`, outside web root).
- API port: **3010** (3000/4000 are taken by other pm2 apps).
- Register with pm2 (ecosystem file added in Phase 7).

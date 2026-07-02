# PixSign Pro — Implementation Plan & Checklist

Build order is designed so each phase is runnable/testable before the next.
See `CLAUDE.md` for architecture, rules, and domain logic.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 0 — Foundation & tooling
- [x] Initialize git repo, connect to `github.com/G0kulakrishnan/PixSignPro`
- [x] Add `.gitignore`, `.editorconfig`, root `package.json` (npm workspaces)
- [x] Set up monorepo dirs: `apps/api`, `packages/db` (`apps/web`, `apps/admin` in Ph.5/6)
- [x] Root TypeScript config + shared lint/format (ESLint + Prettier)
- [x] `.env.example` for API (DB URL, JWT secrets, storage path, port)

## Phase 1 — Database & tenant isolation
- [x] Prisma init in `packages/db`; point at PixSign Pro's own DB/schema on the VPS Postgres
- [x] Define schema: `subscription_plans`, `businesses`, `super_admins`, `users`,
      `media`, `media_events` (all UUID PKs; `mobile_no` globally unique)
- [x] Add indexes (business_id everywhere, mobile_no unique, media type/published, scheduled_publish_at)
- [x] `withTenant` / `withSystem` client wrappers (`SET LOCAL app.current_business_id`
      per-request transaction + super_admin bypass path)
- [x] RLS policies (`prisma/sql/rls.sql`) with `FORCE ROW LEVEL SECURITY`, default-deny
- [x] Seed script: one super_admin, a demo plan, a demo business + business_admin
- [x] Isolation test suite (cross-tenant read/write blocked, tampered id, default-deny)
- [ ] **Run on VPS DB:** `db:migrate` → `db:rls` → `db:seed` → `db:test` (needs DB access)
- [x] Local checks passed: `prisma validate`, `prisma generate`, `tsc`, API `/health` boots

## Phase 2 — API core & auth
- [ ] Express app skeleton: config, logging, error handler, `{data}/{error}` envelope, CORS
- [ ] Password hashing (argon2/bcrypt) helpers
- [ ] JWT access + refresh; auth middleware (decode → attach user, business_id, role)
- [ ] RBAC middleware (role guards per route)
- [ ] `POST /auth/login` (mobile + password), `POST /auth/refresh`, `POST /auth/logout`
- [ ] Rate limiting on auth routes
- [ ] `GET /me` (current user + profile)

## Phase 3 — Business portal API
- [ ] Users: CRUD (business_admin only), set/reset password, list staff/media users
- [ ] Enforce plan limits (max users) on user creation
- [ ] Profile: `GET/PUT /me/profile`, change own password
- [ ] Profile image + company logo upload
- [ ] Media storage abstraction (local FS now; interface for S3/R2 later)
- [ ] Media upload: single + **bulk**, optional title, auto-name `DDMMYYYY_N`,
      `scheduled_publish_at`, mime/size validation, per-plan storage enforcement
- [ ] Media list/download with **schedule-aware visibility** (staff can't see pre-publish)
- [ ] Media delete (media_admin/business_admin)
- [ ] Cron/job to flip `published` at scheduled time
- [ ] Event tracking endpoints: download, share, app-open
- [ ] Analytics endpoint feeding the required table columns

## Phase 4 — Super admin API
- [ ] Super admin auth (separate login)
- [ ] Subscription plans CRUD
- [ ] Businesses CRUD (create business + first business_admin, assign plan, set sub dates/status)
- [ ] Cross-tenant read endpoints (businesses, users, media counts, analytics)

## Phase 5 — Business portal (React)
- [ ] Vite + React + TS + router + auth context + API client
- [ ] Login page (mobile + password)
- [ ] Dashboard tiles: Manage Images, Manage Videos, Manage Users, Manage Profile, Visit Website
- [ ] Manage Images / Manage Videos: grid, upload (bulk, title, schedule), delete, download
- [ ] Manage Users (business_admin): list, create/edit/delete, set/reset password
- [ ] Profile page (all 12 fields, pic + logo upload, change password)
- [ ] Analytics page (the specified table)
- [ ] Role-based UI gating (mirror server RBAC)

## Phase 6 — Super admin panel (React) — `/admin`
- [ ] Separate app/route with super_admin login
- [ ] Plans management UI (CRUD)
- [ ] Businesses management UI (create/edit/delete, assign plan, subscription status)
- [ ] Global overview dashboard (all tenants' details)

## Phase 7 — Hardening & deploy
- [ ] Input validation (zod) on all endpoints
- [ ] Security pass: authz on every route, upload safety, rate limits, headers (helmet)
- [ ] **Isolation test suite (merge gate):** cross-tenant read fails, cross-tenant write fails,
      tampered `business_id` cannot escape tenant, RLS blocks queries with no business_id set
- [ ] Tests: auth, RBAC, schedule visibility, plan limits, subscription lock
- [ ] Build scripts; pm2 ecosystem file (unique port, no clash with existing apps)
- [ ] nginx config notes for `pixsignpro.in` + `/admin`
- [ ] Deploy runbook (migrations, env, pm2 start) in README

---

## Suggested build sequence
0 → 1 → 2 → get **login working end-to-end** (a thin slice of 5) → 3 → 5 → 4 → 6 → 7.

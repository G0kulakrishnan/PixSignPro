# PixSign Pro — Project Guide (CLAUDE.md)

> Source of truth for architecture, rules, conventions, and domain logic.
> Read this before making changes. Keep it updated when decisions change.

## 1. What this is

**PixSign Pro** is a multi-tenant B2B SaaS. Businesses subscribe to a plan and use
the app to upload and distribute images/videos to their staff. There are two web
surfaces plus a shared API:

1. **Super Admin panel** — `portal.pixsignpro.in/admin`. Platform operators manage
   businesses and subscription plans, and see all data across all tenants.
2. **Business portal** — the tenant-facing app. Businesses manage their own media,
   users, profile, and analytics. A business can **never** see another business's data.
3. **Landing site** — the marketing page at `pixsignpro.in` (created separately, not in this repo).

## 2. Tech stack (decided)

| Layer            | Choice                                             |
|------------------|----------------------------------------------------|
| Frontend         | React (Vite) + TypeScript                          |
| Backend / API    | Node + Express + TypeScript                         |
| ORM              | Prisma                                              |
| Database         | PostgreSQL (existing multi-tenant instance on VPS) |
| Auth             | JWT (access + refresh), password login             |
| Media storage    | Local VPS filesystem (abstracted for future S3/R2) |
| Process manager  | pm2 (VPS already runs several pm2 apps)             |
| Reverse proxy    | nginx (assumed, like the other VPS apps)           |

### Deployment context (VPS)
- Single Linux VPS also running: `t2gcrm`, `dev-t2gcrm`, `hotel-pms`, `vaultguard-api` (all pm2/Node).
  Ubuntu, Postgres 17 on :5432. Ports taken: 3000 (t2gcrm), 3001 (dev-t2gcrm), 3002 (hotel-pms), 4000 (vaultguard).
- **Shared PostgreSQL** with existing multi-tenancy. PixSign Pro has its **own database + role**
  (`pixsignpro` / `pixsignpro`, non-superuser) — does not collide with the other apps' tables.
- **App code path:** `/var/www/pixsignpro` (owned by a dedicated non-root deploy user).
  NOTE: `/var/www/pixsign` is the existing **landing page** — do not touch it.
- **API port: 3010** (verified free). Registered with pm2, run as the deploy user (not root).
- Media stored under a dedicated, owner-only dir (e.g. `/var/www/pixsignpro/storage`,
  outside any web root; served only via authorized API endpoints).

## 3. Multitenancy model (decided): Row-level + RLS

- Every tenant-scoped table has a `business_id` column (FK → `businesses.id`).
- **Postgres Row-Level Security (RLS)** policies enforce isolation at the DB layer —
  defense in depth on top of app-level scoping.
- On each authenticated request the API opens a transaction and runs
  `SET LOCAL app.current_business_id = '<uuid>'`; RLS policies filter every query by it.
- Super admin uses a privileged path that can bypass RLS (a role/flag) to read across tenants.
- **Rule:** no tenant-scoped query may run without a `business_id` in scope. App-level
  scoping is mandatory even with RLS on (belt and suspenders).

## 4. Roles & permissions

Platform role (admin panel):
- **super_admin** — manage businesses, create/edit/delete subscription plans, view everything.

Business roles (portal), stored on `users.role`:
- **business_admin** — full control within their business: create/manage/delete users of ANY role,
  set/reset any user's password, manage media, view analytics, edit business profile.
- **user_full_admin** — list/create/edit/delete **staff** users only (incl. reset staff passwords).
  Views media like staff (published only, no upload/delete). No analytics. Cannot touch non-staff users.
- **user_creation_admin** — create **staff** users only (no list/edit/delete). Views media like staff.
  No analytics.
- **media_admin** — upload & delete images/videos; view analytics. Cannot manage users.
- **staff** — download images/videos only. No upload, no delete, no user management.

> **Privilege-escalation guard:** only `business_admin` may assign roles other than `staff`.
> `user_full_admin` / `user_creation_admin` can only create/keep `staff`, and `user_full_admin`
> may only manage users whose current role is `staff`. Enforced server-side in
> `apps/api/src/lib/roles.ts` (mirrored in the web UI at `apps/web/src/roles.ts`). In the legacy
> mobile app, only `media_admin`/`business_admin` map to `"bizadmin"` (upload button); the two
> user-admin roles map to `"staff"` and are blocked from upload endpoints server-side.

Permission matrix:

| Action                          | staff | media_admin | user_creation_admin | user_full_admin | business_admin | super_admin |
|---------------------------------|:-----:|:-----------:|:-------------------:|:---------------:|:--------------:|:-----------:|
| Download media                  |  ✅   |     ✅      |         ✅          |       ✅        |      ✅        |     ✅      |
| Upload media                    |  ❌   |     ✅      |         ❌          |       ❌        |      ✅        |     —       |
| Delete media                    |  ❌   |     ✅      |         ❌          |       ❌        |      ✅        |     —       |
| View analytics                  |  ❌   |     ✅      |         ❌          |       ❌        |      ✅        |     ✅      |
| Create staff users              |  ❌   |     ❌      |         ✅          |       ✅        |      ✅        |     —       |
| List/edit/delete staff users    |  ❌   |     ❌      |         ❌          |       ✅        |      ✅        |     —       |
| Create/edit/delete ANY-role user|  ❌   |     ❌      |         ❌          |       ❌        |      ✅        |     —       |
| Set/reset staff password        |  ❌   |     ❌      |         ❌          |       ✅        |      ✅        |     —       |
| Edit business profile           |  ❌   |     ❌      |         ❌          |       ❌        |      ✅        |     ✅      |
| Change own password / profile   |  ✅   |     ✅      |         ✅          |       ✅        |      ✅        |     ✅      |
| Manage businesses & plans       |  ❌   |     ❌      |         ❌          |       ❌        |      ❌        |     ✅      |

## 5. Authentication

- **Login = mobile number + password** (not email).
- `mobile_no` is **globally unique** across all users (one mobile = one account, any tenant).
  Login looks up the user by mobile alone, then derives `business_id` from that user.
- All entity IDs are **globally unique UUIDs** (business owner id, user id, etc.).
- Passwords are hashed with **bcrypt/argon2**. Never store or log plaintext passwords.
- JWT contains `user_id`, `business_id`, `role`. Short-lived access token + refresh token.
- Business admins can set/reset staff & media passwords (no email flow required).

## 6. Domain features

### 6.1 Dashboard (business portal)
Tiles: **Manage Images**, **Manage Videos**, **Manage Users**, **Manage Profile**,
**Visit Website** (opens the business's own website link from profile).

### 6.2 Upload media
- Optional **title** per file. If omitted, auto-name as `DDMMYYYY_N`
  (e.g. `02072026_1`, `02072026_2`) — sequential per business per day.
- **Bulk upload** supported (multiple files in one action).
- **Scheduled publish:** each media item has `scheduled_publish_at` (nullable).
  - If null → published immediately.
  - If set → **not visible/downloadable to staff before that time.** Media/business admins
    may still see it (as "scheduled"). Visibility computed at query time
    (`scheduled_publish_at IS NULL OR scheduled_publish_at <= now()`), plus a cron to flip a
    `published` flag for accurate analytics/notifications.
- Media type: `image` or `video`.

### 6.3 Profile page (per user)
View own profile; change own password. Fields:
1. Profile picture (upload)
2. Company logo (upload)
3. Name
4. Mobile number
5. Agency name
6. City
7. Role (read-only, set by admin)
8. YouTube channel name
9. Website link
10. Instagram name
11. Optional field 1
12. Optional field 2

### 6.4 Analytics page (business_admin & media_admin)
Table columns:
`S.No | Username | MobileNo | City | Media_Name | UploadedDate | ImageShared |
ImageDownloaded | VideoShared | VideoDownloaded | AppOpenedDate | Date`
- Aggregated per user/media from tracked events (download, share, app-open).
- Track events via API endpoints hit by the client (and future mobile app).

### 6.5 Super admin panel (`/admin`)
- CRUD **subscription plans** (name, price, billing period, limits: max users, max storage,
  feature flags).
- CRUD **businesses** (create a business + its first business_admin, assign a plan,
  set subscription start/end/status).
- View all businesses, users, media counts, analytics across every tenant.

## 7. Data model (target — Prisma)

Tenant-scoped tables carry `business_id`. Draft entities:

- **subscription_plans**: id, name, price, currency, billing_period, max_users,
  max_storage_mb, features (jsonb), is_active, timestamps.
- **businesses** (tenant): id, name, agency_name, city, logo_url, website, plan_id,
  subscription_status, subscription_start, subscription_end, is_active, timestamps.
- **users**: id, business_id, mobile_no, password_hash, role, name, profile_pic_url,
  company_logo_url, agency_name, city, youtube, website, instagram, optional1, optional2,
  last_app_opened_at, is_active, timestamps.
- **super_admins**: id, mobile_no/email, password_hash, name (platform operators).
- **media**: id, business_id, type(image|video), title, file_path, file_size, mime_type,
  uploaded_by (user_id), scheduled_publish_at, published(bool), created_at.
- **media_events**: id, business_id, media_id, user_id, event_type(download|share|view),
  created_at. (Source for analytics.)

> Auto-naming counter for `DDMMYYYY_N` derived per business+day from existing media.

## 8. Repository structure (target)

Monorepo (npm workspaces):

```
pixsign-pro/
  apps/
    api/        Express + Prisma API (serves portal + admin)
    web/        React business portal
    admin/      React super admin panel
  packages/
    db/         Prisma schema, migrations, client
    ui/         (optional) shared React components
  CLAUDE.md
  PLAN.md       phased checklist
```

## 9. Security rules (must-follow) — TOP PRIORITY

> **Security and zero data sharing between businesses is the #1 requirement.**
> A cross-tenant data leak is a critical bug. Every feature is designed isolation-first.

### Tenant isolation — enforced in THREE independent layers (all mandatory)
1. **Database (RLS):** every tenant table has RLS enabled with `FORCE ROW LEVEL SECURITY`
   (so even the table owner is filtered). Policies key on `app.current_business_id`, set via
   `SET LOCAL` per request transaction. The app connects as a **non-superuser** role.
2. **Application:** every tenant query is explicitly scoped by `business_id` from the JWT.
   No endpoint trusts a `business_id` supplied by the client — it always comes from the token.
3. **Authorization:** server-side RBAC on every route (never rely on hidden UI). Super_admin
   cross-tenant access is a separate, explicit, audited code path — the only place isolation
   is intentionally relaxed.

### Non-negotiable rules
- **No business can ever see another business's data** — users, media, analytics, profile.
  A cross-tenant read/write must be impossible even with a crafted request or a buggy query.
- **Mandatory tests** proving: (a) cross-tenant read fails, (b) cross-tenant write fails,
  (c) a request with a tampered `business_id` cannot escape its tenant, (d) RLS blocks
  queries when no `business_id` is set. These tests gate merges.
- Media files are **never publicly listable or guessable**. Per-business directories,
  random (UUID) filenames, stored **outside web root**, served only through authorized API
  endpoints that re-check `business_id` + role on every request. No direct static serving.
- Passwords hashed (argon2/bcrypt), never logged. Secrets (JWT, DB creds) in env vars only,
  never committed. Rotate on suspicion.
- Validate & sanitize **all** uploads: allowlist mime types + extensions, size limits from
  plan, strip metadata where sensible. Reject on mismatch.
- Rate-limit auth + sensitive endpoints; lock out on brute force. Enforce plan limits and
  **subscription lock** server-side (expired/locked business → access denied).
- Short-lived access tokens + refresh rotation; invalidate on password reset/logout.
- Security headers (helmet), strict CORS allowlist, HTTPS only in prod.
- Restrictive filesystem permissions on the media directory (owner-only).
- Log auth events and super_admin cross-tenant access for audit; never log secrets or PII beyond need.
- **Default-deny:** new endpoints require explicit auth + role + tenant scoping before merge.

## 10. Conventions

- TypeScript everywhere; strict mode.
- API responses: consistent `{ data }` / `{ error }` envelope; proper HTTP status codes.
- Env config via `.env` (never commit); provide `.env.example`.
- Dates stored UTC; format for display in the client. Auto-names use IST/local date `DDMMYYYY`.
- Commit style: end commit messages with the Co-Authored-By trailer.
- GitHub repo: https://github.com/G0kulakrishnan/PixSignPro

## 11. Resolved decisions

- **`mobile_no` is globally unique.** Login by mobile alone → derive business_id. IDs are UUIDs.
- **Subscription expiry = LOCK.** On expiry the business is locked out (login blocked or
  hard read-only lock). Enforce server-side by checking `subscription_status`/`subscription_end`
  in auth middleware; super_admin can reactivate.
- **Per-user expiry = LOCK.** `users.expires_at` (nullable). An expired user is denied login on
  both web and mobile, independent of the business's own expiry. Set by business_admin (portal
  Users page) or super_admin (admin Users page). Mobile `expiry_date` returns the user's own
  expiry, falling back to the business's `subscription_end`.
- **Plan limits by count.** `subscription_plans` carries `max_users`, `max_images`, `max_videos`,
  `max_storage_mb` (**-1 = unlimited** each; 0 = none allowed). Enforced on upload (web + mobile),
  user creation, and bulk staff import.
- **Billing = manual v1.** No payment gateway; super_admin sets plan + subscription dates/status.
- **Scheduled-publish = hourly cron + FCM push.** Cron (`apps/api/src/lib/publishCron.ts`) flips
  `media.published` false→true when `scheduled_publish_at` passes (keeps the timestamp) and pushes
  an FCM notification to the business's devices. FCM (`lib/fcm.ts`) is a no-op until
  `FCM_SERVICE_ACCOUNT_PATH` points at a Firebase service-account JSON. Device tokens live in
  `fcm_tokens` (RLS-isolated), stored via `user-fcm-store.php`.
- **App-open analytics.** `media_events.event_type` includes `app_open` (media_id null); the
  analytics table surfaces open counts + "opened but no download/share" rows.
- **Per-media share caption.** `media.caption` (nullable text) is typed by the uploader at upload
  (web modal + legacy mobile upload accept it; portal PATCH edits it). It rides along as the share
  text when the app shares the item. Fallback when a media item has no caption = **`users.share_message`**
  (nullable text), a per-user default set on the web Profile page or via legacy `update-profile.php`
  (`share_message`). Legacy `view-images/videos.php` expose the caption as `share_message`; the app's
  share dialog pre-fills it, with a **default-ticked "Attach caption" checkbox** (untick = share file
  only). Instagram strips pre-filled captions, so the app **copies the caption to the clipboard** when
  sharing to Instagram. Mobile changes ship as a patch (`pixsign-caption-mobile.patch`), applied to the
  Flutter repo — not committed here.
- **Legacy mobile app (Flutter) is supported via a compat layer** — see §14.

### Still to confirm
- Exact PixSign Pro DB name/credentials/port on the VPS (see setup steps below / README runbook).

## 12. Database & environment (VPS Postgres)

PixSign Pro gets its **own database + dedicated DB role** on the shared Postgres instance.

- DB name: `pixsignpro`  ·  DB role: `pixsignpro`  ·  App port: pick a free one (e.g. `3010`).
- Connection string (goes in `apps/api/.env` as `DATABASE_URL`):
  `postgresql://pixsignpro:<password>@localhost:5432/pixsignpro?schema=public`
- The dedicated role is **non-superuser** so RLS actually applies (superusers bypass RLS).

## 13. Deployment (VPS)

### Server details
- **VPS IP:** `85.208.51.93`
- **Deploy user:** `pixsignpro-deploy` (SSH key: `C:/Users/Gokul/.ssh/claude_pixsignpro`)
- **App root:** `/var/www/pixsignpro` (this is also the deploy user's home directory)
- **Domain:** `portal.pixsignpro.in` (webapp/portal + admin + API; HTTPS via Let's Encrypt, nginx reverse proxy).
  `pixsignpro.in` is the separate marketing landing page.
- **API port:** `3010`
- **Media storage:** `/var/www/pixsignpro/storage/<business_id>/`

### SSH access
```bash
ssh -i C:/Users/Gokul/.ssh/claude_pixsignpro pixsignpro-deploy@85.208.51.93
```

### Node / npm / pm2 — IMPORTANT
- Node.js is installed via **nvm under root** (`/root/.nvm/versions/node/v20.20.2/`)
- `npm`, `pm2`, and all build tools must be run as **sudo with explicit PATH**:
```bash
sudo env PATH=/root/.nvm/versions/node/v20.20.2/bin:$PATH npm <cmd>
sudo env PATH=/root/.nvm/versions/node/v20.20.2/bin:$PATH pm2 <cmd>
```
- Plain `sudo npm` or `sudo pm2` won't work — nvm PATH isn't inherited by sudo.
- The `pixsignpro-deploy` user does **not** have npm/node in its own PATH.

### Deploy workflow (git-based)
```bash
# 1. Commit + push locally
git add <files> && git commit -m "..." && git push origin main

# 2. SSH into VPS and pull
ssh -i C:/Users/Gokul/.ssh/claude_pixsignpro pixsignpro-deploy@85.208.51.93

# 3. On VPS: pull, build, restart
cd /var/www/pixsignpro
git pull origin main
NODE=/root/.nvm/versions/node/v20.20.2/bin
sudo env PATH=$NODE:$PATH npm install              # after adding new npm deps
sudo env PATH=$NODE:$PATH npm run generate --workspace=packages/db   # ALWAYS after schema changes
sudo env PATH=$NODE:$PATH npm run migrate  --workspace=packages/db   # ALWAYS after schema changes
sudo env PATH=$NODE:$PATH npm run build --workspace=packages/db
sudo env PATH=$NODE:$PATH npm run build --workspace=apps/api
sudo env PATH=$NODE:$PATH npm run build --workspace=apps/web
sudo env PATH=$NODE:$PATH pm2 restart pixsignpro-api
```

> **Schema change checklist:** run `generate` → `migrate` → `build` in that order.
> `generate` regenerates the Prisma TypeScript client (reads schema, no DB needed).
> `migrate` applies pending SQL migrations to the live DB.

### Nginx config
- Config file: `/etc/nginx/sites-available/portal.pixsignpro.in`
- `/api/` → proxied to `http://127.0.0.1:3010`
- `/admin/` → `alias /var/www/pixsignpro/apps/admin/dist/` (SPA with try_files)
- `/` → `root /var/www/pixsignpro/apps/web/dist` (SPA with try_files)
- Reload: `sudo nginx -t && sudo systemctl reload nginx`

### PM2
- Process name: `pixsignpro-api`
- Ecosystem file: `/var/www/pixsignpro/ecosystem.config.cjs`
- Commands (always use `sudo env PATH=...`):
  - `sudo env PATH=... pm2 status` — check status
  - `sudo env PATH=... pm2 restart pixsignpro-api` — restart after API build
  - `sudo env PATH=... pm2 logs pixsignpro-api --lines 50` — view logs

## 14. Legacy mobile app (Flutter) compatibility

The existing Flutter app (`github.com/techtogrowindia/pixsignpro_new` — current repo as of
2026-07-08; the old `techtogrowindia/pixsign_pro` repo is retired, ignore it) points at our
backend by changing only its base URL to `https://portal.pixsignpro.in/pro/api/`. We serve its
fixed PHP-era contract; the app is unchanged. Full contract + verification log: **`MOBILE_API_PLAN.md`**.

### Key facts (do not break these)
- **Endpoints:** `apps/api/src/routes/legacy/` mounted at `/pro/api/*.php` (12 endpoints:
  login, user_profile, delete-user, register, update-profile, update-password, view-images,
  view-videos, upload-image, upload-video, analytics, user-fcm-store).
- **Envelope:** every legacy response is HTTP **200** with body `{ status_code, Status, message, ... }`
  — capital-S `Status` (`"success"`/`"error"`). This differs from the portal's `{data}`/`{error}`.
- **Integer ids:** app parses ids as `int`. Businesses/users/media carry a `legacy_id`
  (`Int @unique @default(autoincrement())`) surrogate; UUIDs stay internal. Legacy routes
  resolve int→UUID in, UUID→int out. Never expose UUIDs to the app.
- **Role mapping:** `business_admin`+`media_admin` → `"bizadmin"` (upload button); `staff` → `"staff"`.
- **Auth model:** app sends **no JWT** — only `business_id`/`user_id` in the request + a static
  `api-key` query param (`LEGACY_API_KEY`). Legacy routes use `requireApiKey`, verify user∈business,
  and still run every query through `withTenant()` so RLS applies. This is weaker than the portal
  (IDOR-prone by the app's design); true fix needs an app update. Documented tradeoff.
- **Public media:** app loads images with no auth, so media/profile files are served at
  `GET /uploads/:businessId/:filename` (public, UUID-named = unguessable capability URLs,
  traversal-guarded). `image_url`/`profile_pic`/`logo` are returned as **full absolute URLs**
  built from `PUBLIC_BASE_URL`.
- **nginx:** `location /pro/api/` (client_max_body_size 550m) and `location /uploads/` both proxy
  to `127.0.0.1:3010`.
- **New env:** `PUBLIC_BASE_URL`, `LEGACY_API_KEY` (see `.env.example`).
- **Analytics `type` values from the app:** `APP_OPENED`, `IMAGE_DOWNLOADED`, `IMAGE_SHARED`,
  `VIDEO_DOWNLOADED`, `VIDEO_SHARED` (→ `download`/`share` events; `APP_OPENED` just bumps
  `last_app_opened_at`).

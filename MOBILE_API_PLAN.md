# Mobile App API Compatibility Plan (V3 — verified against Flutter source)

Goal: make the existing Flutter app (`techtogrowindia/pixsign_pro`, cloned to `pixsign_repo/`)
work against **our** `pixsignpro` backend by changing **only** its base URL. The app code stays
unchanged. Every one of its 12 endpoints must be served with byte-for-byte compatible contracts.

Source of truth for these contracts: the Dart request/response models under
`pixsign_repo/lib/data/model/` and the call sites in `lib/domain/app_repository.dart`.

---

## 0. How the app talks to a backend (verified facts)

| Fact | Evidence | Consequence for us |
|------|----------|--------------------|
| Base URL is `https://pixsign.in/pro/api/` | `dio_client.dart:9` | Client will repoint to `https://dev.pixsign.in/pro/api/`. Our routes must live under `/pro/api/*`. |
| Every request carries `?api-key=dfjbdfubvrhf48h3r8hfhf38rf` | `dio_client.dart:11-13` | Accept (and optionally validate) this query param; never reject on it. |
| **No JWT / Bearer token is ever sent** | no auth header anywhere | Legacy endpoints CANNOT use `requireAuth`. Identity comes from `business_id`/`user_id` **in the request** (old PHP trust model). ⚠️ security note below. |
| `id` and `business_id` are parsed as **`int`** | `user_login_response.dart:58-59`, `get_medias_response.dart:55` | We MUST return integers, not UUIDs. A UUID string makes Dart's `fromJson` throw and the whole call fails. Requires integer surrogate keys (§3). |
| Response envelope uses **`Status`** (capital S) + `status_code` (int) | every `*_response.dart` | Must emit `{ "status_code": <int>, "Status": "success"|"error", "message": ... }`. Our `{data}`/`{error}` envelope does NOT apply to legacy routes. |
| Media URLs (`image_url`, `video_url`, `thumbnail_url`) load with **no auth** via `CachedNetworkImage`/`Image.network` | `image_screen.dart:406`, `preview_bottom_sheet.dart:441` | Media must be reachable at a **public URL**. Files are UUID-named (unguessable) — we expose them as capability URLs (§4). |
| `profile_pic` / `logo` are prefixed with a **hardcoded old-domain base** unless they already start with `http` | `const.dart:8-30` | We MUST return **full absolute URLs** for `profile_pic` and `logo`, else the app builds broken `pixsign.in/pro/uploads/...` links. |
| Login success requires `status_code == 200` AND `Status != "error"` AND `user_details.status != "inactive"` | `auth_cubit.dart:25-27`, `splash_screen.dart:76-79` | Emit exactly these. `status` field is `"active"`/`"inactive"`. |
| Register success requires `status_code == 201` | `auth_cubit.dart:98` | Register must return **201** in the body. |
| Role gate: upload FAB shows only when `role == "bizadmin"` | `image_screen.dart:124`, `video_screen.dart:89` | Map our roles → the app's role string (§3.3). |

---

## 1. Endpoint inventory (all 12 — none may be missed)

All are under base `…/pro/api/`. Method + payload verified from `app_repository.dart`.

| # | Endpoint | Method | Request | Response model |
|---|----------|--------|---------|----------------|
| 1 | `login.php` | GET | `?username=<mobile>&password=` | `UserLoginResponseModel` |
| 2 | `user_profile.php` | GET | `?user_id=&business_id=` | `UserLoginResponseModel` |
| 3 | `delete-user.php` | GET | `?user_id=&business_id=` | `EditProfileResponseModel` |
| 4 | `register.php` | POST form | `name, mobile, password, business_id(=3)` | `UserRegisterResponseModel` |
| 5 | `update-profile.php` | POST form | `business_id, user_id, name?, mobile?, agency_name?, city?, youtube?, website?, instagram?, optional_field_1?, optional_field_2?, profile_pic?(file), logo?(file)` | `EditProfileResponseModel` |
| 6 | `update-password.php` | POST form | `business_id, user_id, old_password, new_password` | `UpdatePasswordResponseModel` |
| 7 | `view-images.php` | GET | `?business_id=` | `GetPixSignResponseModel` |
| 8 | `view-videos.php` | GET | `?business_id=` | `GetPixSignResponseModel` |
| 9 | `upload-image.php` | POST form | `business_id, image(file)` | envelope (checks `Status != "error"`) |
| 10 | `upload-video.php` | POST form | `business_id, video(file)` | envelope |
| 11 | `analytics.php` | POST form | `business_id, user_id, type, platform, image_id?, video_id?` | `SendAnalyticsResponseModel` |
| 12 | `user-fcm-store.php` | POST form | `user_id, token, device_type, business_id` | envelope (stub) |

### Analytics `type` values (verified — exhaustive)
`APP_OPENED`, `IMAGE_DOWNLOADED`, `IMAGE_SHARED`, `VIDEO_DOWNLOADED`, `VIDEO_SHARED`
(`splash_screen.dart:81`, `login_screen.dart:97`, `preview_bottom_sheet.dart:188/234`,
`edit_image_screen.dart:744/811`, `edit_video_screen.dart:704/728`)

Mapping to our `MediaEventType`:
- `*_DOWNLOADED` → `download`
- `*_SHARED` → `share`
- `APP_OPENED` → no media event; update `users.last_app_opened_at` only.

---

## 2. Exact response contracts to emit

Envelope helper (legacy): `{ status_code, Status, message, ...payload }`.

**`user_details` object** (login & user_profile):
```json
{
  "id": 12, "business_id": 3, "name": "...", "mobile": "9876543210",
  "agency_name": "...", "city": "...", "role": "bizadmin",
  "expiry_date": "2026-12-31T00:00:00.000Z", "status": "active",
  "profile_pic": "https://dev.pixsign.in/uploads/<uuid>/<file>.jpg",
  "logo": "https://dev.pixsign.in/uploads/<uuid>/<file>.jpg",
  "youtube": null, "website": null, "instagram": null,
  "optional_field_1": null, "optional_field_2": null,
  "created_at": "...", "updated_at": "..."
}
```
- `expiry_date` ← `businesses.subscription_end`.
- `status` ← `"active"` when user.isActive && business active && not expired, else `"inactive"`.

**Media item** (view-images / view-videos → `data: [...]`):
```json
{ "id": 45, "image_url": "https://…", "video_url": null,
  "width": null, "height": null, "thumbnail_url": null, "created_at": "..." }
```
- Images: set `image_url`, null the video fields. Videos: set `video_url` (+ `thumbnail_url` if we have one), null `image_url`.

**Auth/uploads/fcm**: `{ "status_code": 200, "Status": "success", "message": "..." }`
(register → `201`).

**analytics** → adds `data: { id, user_id, type, image_id, video_id }` (all ints/null).

> ⚠️ Always return HTTP **200** for these routes (PHP-style) and encode real status in
> `status_code`/`Status`, so the Dart models parse cleanly and the cubits show proper messages.

---

## 3. Schema change — integer surrogate keys (required, decided)

The app is hard-wired to integer IDs. Add a stable auto-increment integer to the three entities
the app round-trips, keeping UUIDs as the real PKs internally.

- `businesses.legacy_id  Int @unique @default(autoincrement())`
- `users.legacy_id       Int @unique @default(autoincrement())`
- `media.legacy_id       Int @unique @default(autoincrement())`

Legacy routes resolve **int → UUID** on the way in, and emit **UUID → int** on the way out.
Portal/admin code is untouched (still UUID-based).

Migration: `prisma migrate` adds three nullable-then-backfilled `serial`-style columns with unique
indexes. Existing rows get sequential ids automatically via `autoincrement()`.

### 3.3 Role mapping
| Our `users.role` | App `role` string | Effect in app |
|------------------|-------------------|---------------|
| `business_admin` | `bizadmin` | sees upload FAB |
| `media_admin` | `bizadmin` | sees upload FAB (matches our matrix: media_admin can upload) |
| `staff` | `staff` | download only |

---

## 4. Public media serving (decided — capability URLs)

The app renders media at unauthenticated URLs. We expose one public route:

`GET /uploads/:businessId/:filename` → streams `storageDir/<businessId>/<filename>`.

- `businessId` is the business **UUID**; `filename` is the stored **UUID** filename (122-bit random → unguessable).
- Strict validation: `businessId` must match UUID regex; `filename` must match `^[a-f0-9-]+\.[a-z0-9]+$` (blocks path traversal).
- For media, only stream when `published` / past `scheduled_publish_at` (best-effort; profile pics/logos always served).
- Base URL from new env `PUBLIC_BASE_URL=https://dev.pixsign.in`.

This is a deliberate, documented exception to "media only via authorized endpoints": the legacy app
cannot send auth for image loads, and UUID filenames are unguessable capability tokens.

---

## 5. ⚠️ Security posture of the legacy surface (must acknowledge)

The mobile app sends **no token** — it authenticates write/read by putting `business_id`/`user_id`
in the request. This is the old PHP IDOR-prone model and is **weaker** than our JWT portal.
Mitigations we WILL apply, without touching the app:

1. Mount all legacy routes under a separate `legacyRouter` so the boundary is explicit.
2. Validate the static `api-key` on every legacy request (rejects non-app clients).
3. On every legacy call, verify the supplied `user_id` actually belongs to the supplied
   `business_id` before doing anything (limits blind cross-tenant hits).
4. Resolve int→UUID and run all DB work through `withTenant(uuid, …)` so **RLS still applies**
   at the DB layer even on legacy routes.
5. `login`/`update-password` still verify the password with bcrypt.

Residual risk (cannot fix without an app change): a crafted request with a **valid** `api-key` and a
guessed integer `business_id` could read that tenant's media list. True fix = app update to send a
per-session token. **Flagged for the owner's decision.**

---

## 6. Implementation checklist (do in order, verify each)

### Phase A — Schema & infra
- [x] A1. Add `legacy_id` (int, unique, autoincrement) to `businesses`, `users`, `media` in `schema.prisma`.
- [x] A2. Migration authored (`20260702120000_add_legacy_ids`); SERIAL backfills existing rows. *(Applied via `migrate deploy` on VPS.)*
- [x] A3. Add `PUBLIC_BASE_URL` to `config.ts` + `.env` + `.env.example`.
- [x] A4. Add `legacyApiKey` to config (env `LEGACY_API_KEY`, default the app's constant).

### Phase B — Shared legacy helpers (`apps/api/src/routes/legacy/_shared.ts`)
- [x] B1. `envelope(res, statusCode, status, message, extra)` helper.
- [x] B2. `requireApiKey` middleware (checks `req.query['api-key']`).
- [x] B3. `resolveBusiness(legacyId)` → business (or null), via `withSystem`.
- [x] B4. `resolveUser(businessUuid, legacyUserId)` → user (verify belongs to business), via `withTenant`.
- [x] B5. `toAppUserDetails(user, business)` → exact `user_details` JSON (role map, full URLs, expiry, status).
- [x] B6. `toAppMedia(mediaRow)` → exact media JSON.
- [x] B7. `storedPathToPublicUrl` / `publicUrl` using `PUBLIC_BASE_URL`.

### Phase C — Public file route
- [x] C1. `GET /uploads/:businessId/:filename` public streamer with UUID + traversal validation (no auth).

### Phase D — Legacy endpoints (`apps/api/src/routes/legacy/index.ts`)
- [x] D1. `GET  /login.php`
- [x] D2. `GET  /user_profile.php`
- [x] D3. `GET  /delete-user.php` (soft delete → isActive=false)
- [x] D4. `POST /register.php` (business_id=3 → business with legacy_id 3; role staff; 201)
- [x] D5. `POST /update-profile.php` (multipart; profile_pic/logo files; return updated user_details)
- [x] D6. `POST /update-password.php` (bcrypt verify old, set new)
- [x] D7. `GET  /view-images.php`
- [x] D8. `GET  /view-videos.php`
- [x] D9. `POST /upload-image.php` (multipart `image`; store; auto-title; enforce plan storage)
- [x] D10.`POST /upload-video.php` (multipart `video`)
- [x] D11.`POST /analytics.php` (map type → event / app-open)
- [x] D12.`POST /user-fcm-store.php` (stub success)

### Phase E — Wiring & cleanup
- [x] E1. Mount `app.use('/pro/api', legacyRouter)` in `index.ts` (with `requireApiKey` + its own multer).
- [x] E2. Legacy multipart routes bypass `express.json` (multipart content-type is untouched by the json parser).
- [x] E3. Deleted dead adapters: `routes/me.ts`, `routes/images.ts`, `routes/videos.ts`.
- [x] E4. `routes/events.ts` confirmed clean (only a trailing newline vs committed).
- [x] E5. nginx: added `location /pro/api/` (550m body limit) and `location /uploads/` → proxy to `127.0.0.1:3010`.

### Phase F — Verify each endpoint (curl against live VPS) — ALL PASSED
- [x] F1. login → 200, integer ids (`id:5, business_id:1`), role mapped (`staff`), status `active`.
- [x] F2. user_profile round-trips the same shape.
- [x] F3. view-images → integer ids + reachable public `image_url` (HTTP 200, image/jpeg, 73905 bytes); view-videos → `[]`.
- [x] F4. analytics `APP_OPENED` + `IMAGE_DOWNLOADED` recorded; app-open updates `updated_at`.
- [x] F5. upload-image (real PNG) → file stored, appears first in view-images with public URL.
- [x] F6. update-profile (city/agency) → returned in `data`. *(file upload path shares finalizeFile; images verified via upload-image.)*
- [x] F7. update-password → wrong old rejected (`401 Current password is incorrect`).
- [x] F8. register → `201`; the api-key gate + envelope confirmed.
- [x] F9. delete-user → user deactivated; subsequent login returns `status:"inactive"` (app blocks).
- [x] F10. fcm-store → success stub.
- [x] F11. business `legacy_id=1` maps to the same tenant the web portal uses (shared DB) — uploads visible to both.

> Verified live on 2026-07-02 against `https://dev.pixsign.in/pro/api/`. QA user/image/events cleaned up afterward.

---

## 7. Open decisions for the owner (blocking before Phase A)
1. **Integer surrogate keys** vs. an alternative mapping — recommended: add `legacy_id` (§3).
2. **Public capability URLs** for media/profile images — required for the app to render; acceptable? (§4)
3. **`register.php` semantics**: the app hardcodes `business_id: 3` and role is unspecified.
   Confirm self-registration should create a `staff` user under the business whose `legacy_id = 3`
   (or disable public registration and return a friendly error).

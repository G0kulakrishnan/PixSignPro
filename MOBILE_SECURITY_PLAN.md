# Mobile App — Security Hardening Plan

> **Status: implemented.** The backend side (§4.A, B1–B7) is live — Bearer JWT + refresh
> rotation + signed media URLs. The checklist below predates that work and reads as a proposal;
> for the current live contract, see `API.md` (§ Legacy Mobile API). Kept here as the design
> rationale/decision record for *why* the hardening was built this way.

Purpose: replace the legacy PHP-era trust model with proper token auth so the mobile app is as
secure as the web portal. This document is written to be handed to the **app developer** — it
states exactly what changes on the **app side** and what we change on the **backend side**, and the
new request/response contract.

> Timing advantage: the app has **not yet shipped** against our backend (only the base URL is
> planned to change). So we bake security into the **same release** — no compatibility window,
> no dual-mode. The app's first build against `portal.pixsignpro.in` is already the secure version.

---

## 1. What's wrong today (threats we're closing)

| # | Problem (current legacy `/pro/api`) | Risk |
|---|-------------------------------------|------|
| T1 | **Login sends credentials in the URL** (`GET login.php?username=&password=`) | Passwords land in server access logs, proxies, crash reports, browser/OS history. |
| T2 | **No session token.** Requests are "authenticated" by `business_id`/`user_id` sent in the request | **Cross-tenant/IDOR:** a crafted request with another business's id can read/write its data. |
| T3 | **Static `api-key` hardcoded in the app binary** | Trivially extracted from the APK; not a real secret. |
| T4 | **Session/user data stored in plaintext** (`SharedPreferences`) | Readable on rooted/jailbroken or backed-up devices. |
| T5 | **Media served at public URLs** (`/uploads/...`) | Anyone with the URL can fetch it; no expiry, no per-user check. |
| T6 | **No brute-force protection tuned for the app surface** | Password guessing on login. |

---

## 2. Target design (what "secure" looks like)

1. **Token auth (JWT):** login returns a short-lived **access token** + a longer-lived **refresh
   token**. Every subsequent request carries `Authorization: Bearer <access>`.
2. **Server derives identity from the token** — `business_id`, `user_id`, `role` come from the
   signed token, never from the request body/query. This alone kills IDOR (T2).
3. **Credentials only in POST body over HTTPS** (T1).
4. **Tokens stored in the OS secure enclave** (`flutter_secure_storage` → Keychain / Keystore),
   not SharedPreferences (T4).
5. **Media via short-lived signed URLs** (HMAC + expiry) — no public listing, links expire (T5).
6. **`api-key` demoted** to a non-secret app identifier (or dropped); real security is the token (T3).
7. **Login rate-limited + lockout**, short access-token TTL, refresh rotation, revoke on
   logout/password-change (T6).

---

## 3. New API contract (what the app calls)

Base stays `https://portal.pixsignpro.in/pro/api/`. Envelope stays the same shape the app already parses
(`{ status_code, Status, message, ... }`) and ids stay integers — so **the app's models/screens
barely change**; the change is *how requests are authenticated*, not the data shapes.

### 3.1 Login — now POST, returns tokens
`POST /pro/api/login.php`  · body `application/json` (or form) `{ "username": "<mobile>", "password": "<pass>" }`
```json
{
  "status_code": 200, "Status": "success", "message": "Login successful",
  "access_token": "<jwt ~15m>",
  "refresh_token": "<jwt ~30d>",
  "user_details": { ...unchanged... }
}
```
Failure → `{ "status_code": 401, "Status": "error", "message": "Invalid mobile number or password" }`.

### 3.2 Refresh — new endpoint
`POST /pro/api/refresh.php` · body `{ "refresh_token": "<jwt>" }`
```json
{ "status_code": 200, "Status": "success", "access_token": "<new access>", "refresh_token": "<rotated refresh>" }
```
On invalid/expired refresh → `401` → app forces re-login.

### 3.3 Logout — new endpoint
`POST /pro/api/logout.php` · header `Authorization: Bearer <access>` → revokes the refresh token, returns success.

### 3.4 Every other endpoint
- Sends header `Authorization: Bearer <access>`.
- **Stops sending `business_id` and `user_id`** — the server ignores them and uses the token.
  (If easier for the app dev, they may keep sending them; the server will **ignore** client-sent
  ids and use the token. But dropping them is cleaner.)
- Contract examples:
  - `GET /pro/api/view-images.php` (no `business_id` needed) → same `data: [...]` shape.
  - `POST /pro/api/analytics.php` body `{ type, image_id?, video_id?, platform }` (no `user_id`).
  - `POST /pro/api/upload-image.php` multipart `image` only.
  - `GET /pro/api/user_profile.php` (no ids) → the caller's own profile.
  - `POST /pro/api/update-profile.php`, `update-password.php` → act on the token's user.

### 3.5 Media — signed, expiring URLs
`image_url` / `video_url` / `profile_pic` / `logo` come back as **time-limited signed URLs**:
```
https://portal.pixsignpro.in/uploads/<businessId>/<file>?exp=<unixts>&sig=<hmac_sha256>
```
- The server signs each URL when building the list/profile response (valid ~1 hour).
- The `/uploads` route validates `exp` + `sig` before streaming; expired/forged → 403.
- **App change is minimal:** `CachedNetworkImage`/`Image.network` still just receive a URL string
  — no header plumbing needed for images. When a cached URL expires, re-fetch the list to get fresh
  ones (the app already pull-to-refreshes).

---

## 4. Work split

### 4.A Backend — we do
- [ ] B1. `login.php` → accept **POST** (json/form), verify password, issue access+refresh, return tokens + `user_details`. (Keep old GET rejected.)
- [ ] B2. `refresh.php`, `logout.php` (refresh rotation + a revocation store — DB table or Redis).
- [ ] B3. `requireMobileAuth` middleware: verify Bearer, attach `{userId, businessId, role}`; **all** legacy routes use it and derive ids from the token (ignore client ids). Keep everything inside `withTenant()` so RLS still applies.
- [ ] B4. Sign media URLs (HMAC-SHA256 over `businessId/file` + `exp`, secret in env). Update `/uploads/:businessId/:filename` to require+validate `exp`+`sig`.
- [ ] B5. Login rate-limit + temporary lockout after N failures; short access TTL; revoke refresh on password change / logout / delete-user.
- [ ] B6. `api-key` becomes optional/app-identifier only (or removed). Decide (see §6).
- [ ] B7. Keep response envelope + integer ids unchanged (minimize app churn).

### 4.B App — developer does
- [ ] A1. **Login:** call `POST login.php` with credentials in the **body**; store `access_token` + `refresh_token`.
- [ ] A2. **Secure storage:** save tokens (and cached user) with `flutter_secure_storage` instead of `SharedPreferences`. (`shared_pref_helper.dart` → secure equivalent.)
- [ ] A3. **Dio interceptor** (`dio_client.dart`): attach `Authorization: Bearer <access>` to every request; **remove** the static `api-key` default query param (or keep only if we keep B6).
- [ ] A4. **401 handling:** on `401`, call `refresh.php` once, retry the original request; if refresh fails, clear storage → go to login. (Add to the existing `InterceptorsWrapper.onError`.)
- [ ] A5. **Drop client ids:** stop putting `business_id`/`user_id` in requests (`app_repository.dart`). Server derives them.
- [ ] A6. **Logout:** call `logout.php`, then clear secure storage.
- [ ] A7. **Media:** no code change required if we use signed URLs (§3.5). Just refresh the list when images fail to load (expired link).
- [ ] A8. (Optional, recommended) **TLS certificate pinning** for `portal.pixsignpro.in` to block MITM.
- [ ] A9. Ensure Android `usesCleartextTraffic=false` and iOS ATS enabled (HTTPS only).

---

## 5. Rollout
1. Backend ships B1–B7 behind the existing `/pro/api` path.
2. App dev ships A1–A9 in the same build that points the base URL at `portal.pixsignpro.in`.
3. Because no app is live against our backend yet, this is a **clean cutover** — the first secure
   build is the only build users get. No dual-mode needed.
4. Verify with the same endpoint checklist we used before, now asserting: no request succeeds
   without a valid Bearer, and a token from business A cannot read business B.

---

## 6. Decisions for you (confirm before the developer starts)
1. **Media URL style:** signed expiring URLs (recommended, least app change) **vs** token-header
   media requests (`CachedNetworkImage` with `Authorization` header). Recommend **signed URLs**.
2. **`api-key`:** drop it entirely (token is the real auth) **vs** keep it as a soft app-identifier.
   Recommend **drop** to avoid a false sense of a secret in the binary.
3. **Certificate pinning (A8):** include now (more secure, slightly more app work + care on cert
   renewal) **vs** defer. Recommend **include** if the developer is comfortable managing it.
4. **Refresh revocation store:** small DB table (simplest, we already have Postgres) vs Redis.
   Recommend **DB table**.

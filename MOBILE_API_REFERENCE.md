# PixSign Pro — Mobile API Reference (Secure v1)

**Audience:** mobile app developer.
**Base URL:** `https://portal.pixsignpro.in/pro/api/`
**Transport:** HTTPS only. Reject cleartext (Android `usesCleartextTraffic=false`, iOS ATS on).

This is the **token-authenticated** contract. Response bodies keep the familiar
`{ status_code, Status, message, ... }` shape and **integer ids**, so existing model classes need
minimal change — the difference is *authentication*, not the data shapes.

---

## 0. Conventions

### 0.1 Authentication model
- **Login** returns an **`access_token`** (short-lived, ~15 min) and a **`refresh_token`** (~30 days).
- Every request **except** `login` and `refresh` must send:
  ```
  Authorization: Bearer <access_token>
  ```
- The server derives `business_id`, `user_id`, and `role` **from the token**. The app must **not**
  send `business_id` / `user_id` in any request — they are ignored.
- When the access token expires the server returns **HTTP 401** → app calls `refresh.php` once,
  retries the original request; if refresh also fails → clear tokens, go to login.
- The old `api-key` query parameter is **removed**. Do not send it.

### 0.2 HTTP status codes (real codes are used)
| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Validation error (missing/invalid fields) |
| 401 | Missing / invalid / expired token, or bad login credentials |
| 403 | Forbidden (role not allowed, or subscription inactive/expired) |
| 404 | Resource not found |
| 409 | Conflict (e.g. mobile number already registered) |
| 429 | Too many requests (rate limit / lockout) |
| 500 | Server error |

The body always mirrors the code in `status_code` and carries a human `message`.

### 0.3 Standard error body (all endpoints)
```json
{ "status_code": 401, "Status": "error", "message": "Session expired. Please sign in again." }
```

### 0.4 Token storage (app side)
Store `access_token`, `refresh_token`, and cached `user_details` in **secure storage**
(`flutter_secure_storage` → Keychain/Keystore), **not** SharedPreferences.

### 0.5 Shared object: `user_details`
Returned by login, refresh (optional), user_profile, update-profile.
```json
{
  "id": 12,
  "business_id": 3,
  "name": "Ramesh Kumar",
  "mobile": "9876543210",
  "agency_name": "Bright Studio",
  "city": "Madurai",
  "role": "bizadmin",
  "expiry_date": "2026-12-31T00:00:00.000Z",
  "status": "active",
  "profile_pic": "https://portal.pixsignpro.in/uploads/<uuid>/<file>.jpg?exp=1767200000&sig=ab12…",
  "logo": "https://portal.pixsignpro.in/uploads/<uuid>/<file>.png?exp=1767200000&sig=cd34…",
  "youtube": null,
  "website": null,
  "instagram": null,
  "optional_field_1": null,
  "optional_field_2": null,
  "created_at": "2026-07-02T17:04:38.234Z",
  "updated_at": "2026-07-02T17:05:03.517Z"
}
```
- `role`: `"bizadmin"` (can upload) or `"staff"` (download only).
- `status`: `"active"` or `"inactive"` (inactive/expired → block use, force logout).
- `profile_pic` / `logo`: full **signed** URLs or `null`.

### 0.6 Shared object: media item
Returned inside `view-images.php` / `view-videos.php`.
```json
{
  "id": 45,
  "image_url": "https://portal.pixsignpro.in/uploads/<uuid>/<file>.jpg?exp=1767200000&sig=ef56…",
  "video_url": null,
  "width": null,
  "height": null,
  "thumbnail_url": null,
  "created_at": "2026-07-02T14:03:25.693Z"
}
```
For videos: `video_url` is set (+ `thumbnail_url` when available) and `image_url` is `null`.

---

# 1. Authentication

## 1.1 Login
Authenticate by mobile + password; receive tokens.

- **Method / URL:** `POST /pro/api/login.php`
- **Auth:** none
- **Headers:** `Content-Type: application/json`
- **Body:**
```json
{ "username": "9876543210", "password": "S3cret!" }
```
> `username` is the mobile number. Credentials go in the **body**, never the URL.

### ✅ Success — 200
```json
{
  "status_code": 200,
  "Status": "success",
  "message": "Login successful",
  "access_token": "eyJhbGciOiJIUzI1NiІsInR5cCI6IkpXVCJ9…",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "user_details": { /* see 0.5 */ }
}
```

### ❌ Failure
Invalid credentials — **401**
```json
{ "status_code": 401, "Status": "error", "message": "Invalid mobile number or password" }
```
Account/subscription inactive — **403**
```json
{ "status_code": 403, "Status": "error", "message": "Account is inactive. Please contact support." }
```
Missing fields — **400**
```json
{ "status_code": 400, "Status": "error", "message": "Mobile number and password are required" }
```
Too many attempts — **429**
```json
{ "status_code": 429, "Status": "error", "message": "Too many attempts. Try again in a few minutes." }
```

---

## 1.2 Refresh token
Exchange a valid refresh token for a new access token (and a rotated refresh token).

- **Method / URL:** `POST /pro/api/refresh.php`
- **Auth:** none (the refresh token *is* the credential)
- **Headers:** `Content-Type: application/json`
- **Body:**
```json
{ "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…" }
```

### ✅ Success — 200
```json
{
  "status_code": 200,
  "Status": "success",
  "message": "Token refreshed",
  "access_token": "<new access token>",
  "refresh_token": "<rotated refresh token>"
}
```
> Replace both stored tokens with the returned pair.

### ❌ Failure — 401 (force re-login)
```json
{ "status_code": 401, "Status": "error", "message": "Invalid or expired refresh token" }
```

---

## 1.3 Logout
Revoke the current session's refresh token.

- **Method / URL:** `POST /pro/api/logout.php`
- **Auth:** `Authorization: Bearer <access_token>`
- **Body:** none

### ✅ Success — 200
```json
{ "status_code": 200, "Status": "success", "message": "Logged out" }
```
> Then clear tokens + cached user from secure storage.

### ❌ Failure — 401
```json
{ "status_code": 401, "Status": "error", "message": "Session expired. Please sign in again." }
```

---

# 2. Profile & Account

## 2.1 Register
Self-registration. Creates a `staff` user under the default business.

- **Method / URL:** `POST /pro/api/register.php`
- **Auth:** none
- **Headers:** `multipart/form-data` (or form-urlencoded)
- **Body fields:**

| Field | Required | Example |
|-------|----------|---------|
| `name` | yes | `Ramesh Kumar` |
| `mobile` | yes | `9876543210` |
| `password` | yes (min 6) | `S3cret!` |

> Note: the business is fixed server-side (default business). The app does **not** choose it.

### ✅ Success — 201
```json
{ "status_code": 201, "Status": "success", "message": "Registered successfully" }
```

### ❌ Failure
Duplicate mobile — **409**
```json
{ "status_code": 409, "Status": "error", "message": "Mobile number already in use" }
```
Validation — **400**
```json
{ "status_code": 400, "Status": "error", "message": "Name, mobile and password (min 6 chars) are required" }
```

---

## 2.2 Get my profile
Returns the authenticated user's own profile.

- **Method / URL:** `GET /pro/api/user_profile.php`
- **Auth:** `Authorization: Bearer <access_token>`
- **Params:** none (identity comes from the token)

### ✅ Success — 200
```json
{
  "status_code": 200,
  "Status": "success",
  "message": "Profile fetched",
  "user_details": { /* see 0.5 */ }
}
```

### ❌ Failure — 401
```json
{ "status_code": 401, "Status": "error", "message": "Session expired. Please sign in again." }
```

---

## 2.3 Update profile
Update own profile fields and/or profile picture & logo.

- **Method / URL:** `POST /pro/api/update-profile.php`
- **Auth:** `Authorization: Bearer <access_token>`
- **Headers:** `multipart/form-data`
- **Body fields (all optional; send only what changed):**

| Field | Type | Example |
|-------|------|---------|
| `name` | text | `Ramesh Kumar` |
| `mobile` | text | `9876543210` |
| `agency_name` | text | `Bright Studio` |
| `city` | text | `Madurai` |
| `youtube` | text | `@brightstudio` |
| `website` | text | `https://bright.example` |
| `instagram` | text | `bright.studio` |
| `optional_field_1` | text | — |
| `optional_field_2` | text | — |
| `profile_pic` | file (jpg/png) | — |
| `logo` | file (jpg/png) | — |

### ✅ Success — 200
```json
{
  "status_code": 200,
  "Status": "success",
  "message": "Profile updated",
  "data": { /* updated user_details, see 0.5 */ }
}
```

### ❌ Failure
Mobile taken — **409**
```json
{ "status_code": 409, "Status": "error", "message": "Mobile number already in use" }
```
Unauthorized — **401**
```json
{ "status_code": 401, "Status": "error", "message": "Session expired. Please sign in again." }
```

---

## 2.4 Update password
Change own password (verifies the current one).

- **Method / URL:** `POST /pro/api/update-password.php`
- **Auth:** `Authorization: Bearer <access_token>`
- **Headers:** `multipart/form-data` (or form-urlencoded)
- **Body fields:**

| Field | Required | Example |
|-------|----------|---------|
| `old_password` | yes | `S3cret!` |
| `new_password` | yes (min 6) | `N3wPass!` |

### ✅ Success — 200
```json
{ "status_code": 200, "Status": "success", "message": "Password updated successfully" }
```
> On success the server revokes existing refresh tokens. The app should keep the current session
> (a fresh access token remains valid) or re-login — recommend prompting re-login.

### ❌ Failure
Wrong current password — **401**
```json
{ "status_code": 401, "Status": "error", "message": "Current password is incorrect" }
```
Validation — **400**
```json
{ "status_code": 400, "Status": "error", "message": "Old and new password (min 6 chars) are required" }
```

---

## 2.5 Delete my account
Soft-deletes (deactivates) the authenticated user.

- **Method / URL:** `POST /pro/api/delete-user.php`
- **Auth:** `Authorization: Bearer <access_token>`
- **Body:** none

### ✅ Success — 200
```json
{
  "status_code": 200,
  "Status": "success",
  "message": "Account deleted",
  "data": { "id": 12, "name": "Ramesh Kumar", "mobile": "9876543210" }
}
```
> After success: clear tokens and return to login. Subsequent logins return `403 inactive`.

### ❌ Failure — 401
```json
{ "status_code": 401, "Status": "error", "message": "Session expired. Please sign in again." }
```

---

# 3. Media

## 3.1 List images
- **Method / URL:** `GET /pro/api/view-images.php`
- **Auth:** `Authorization: Bearer <access_token>`
- **Params:** none (business comes from the token)

### ✅ Success — 200
```json
{
  "status_code": 200,
  "Status": "success",
  "message": "OK",
  "data": [
    { "id": 45, "image_url": "https://portal.pixsignpro.in/uploads/…?exp=…&sig=…",
      "video_url": null, "width": null, "height": null, "thumbnail_url": null,
      "created_at": "2026-07-02T14:03:25.693Z" }
  ]
}
```
> `image_url` is a **signed URL valid ~1 hour**. If an image fails to load (expired), re-call this
> endpoint to get fresh URLs.

### ❌ Failure — 401
```json
{ "status_code": 401, "Status": "error", "message": "Session expired. Please sign in again." }
```

---

## 3.2 List videos
- **Method / URL:** `GET /pro/api/view-videos.php`
- **Auth:** `Authorization: Bearer <access_token>`
- **Params:** none

### ✅ Success — 200
```json
{
  "status_code": 200,
  "Status": "success",
  "message": "OK",
  "data": [
    { "id": 88, "image_url": null,
      "video_url": "https://portal.pixsignpro.in/uploads/…?exp=…&sig=…",
      "width": null, "height": null,
      "thumbnail_url": "https://portal.pixsignpro.in/uploads/…?exp=…&sig=…",
      "created_at": "2026-07-02T14:03:25.693Z" }
  ]
}
```

### ❌ Failure — 401 (see 3.1)

---

## 3.3 Upload image
Requires `bizadmin` role.

- **Method / URL:** `POST /pro/api/upload-image.php`
- **Auth:** `Authorization: Bearer <access_token>`
- **Headers:** `multipart/form-data`
- **Body fields:**

| Field | Required | Notes |
|-------|----------|-------|
| `image` | yes | image file (jpg/png/webp/gif) |

### ✅ Success — 200
```json
{ "status_code": 200, "Status": "success", "message": "Image uploaded" }
```

### ❌ Failure
No file — **400**
```json
{ "status_code": 400, "Status": "error", "message": "No image uploaded" }
```
Not allowed (role is staff) — **403**
```json
{ "status_code": 403, "Status": "error", "message": "You do not have permission to upload" }
```
Storage limit — **403**
```json
{ "status_code": 403, "Status": "error", "message": "Storage limit reached for your plan" }
```

---

## 3.4 Upload video
Requires `bizadmin` role.

- **Method / URL:** `POST /pro/api/upload-video.php`
- **Auth:** `Authorization: Bearer <access_token>`
- **Headers:** `multipart/form-data`
- **Body fields:**

| Field | Required | Notes |
|-------|----------|-------|
| `video` | yes | video file (mp4/mov/webm/…) |

### ✅ Success — 200
```json
{ "status_code": 200, "Status": "success", "message": "Video uploaded" }
```

### ❌ Failure — same shape as 3.3 (`No video uploaded`, `403` role/storage).

---

## 3.5 Media file (signed URL)
How the URLs from 3.1/3.2 and profile images are served. The app usually just passes these URLs to
`CachedNetworkImage` / the video player — no manual call needed.

- **Method / URL:** `GET /uploads/<businessId>/<filename>?exp=<unix>&sig=<hmac>`
- **Auth:** none — the `sig` is the capability. **No Bearer header required.**
- The server validates `exp` (not expired) and `sig` (HMAC) before streaming bytes.

### ✅ Success — 200
Binary stream, `Content-Type` = the file's type (e.g. `image/jpeg`, `video/mp4`).

### ❌ Failure
- **403** — expired or invalid signature (body may be empty).
- **404** — file not found.

> Because links expire (~1 h), cache them for the session and refresh the list when they stop
> loading. Do **not** persist these URLs long-term.

---

# 4. Analytics

## 4.1 Record an event
Track downloads/shares/app-open. Used by the app after a save/share and on app open.

- **Method / URL:** `POST /pro/api/analytics.php`
- **Auth:** `Authorization: Bearer <access_token>`
- **Headers:** `multipart/form-data` (or form-urlencoded)
- **Body fields:**

| Field | Required | Values / Example |
|-------|----------|------------------|
| `type` | yes | `APP_OPENED`, `IMAGE_DOWNLOADED`, `IMAGE_SHARED`, `VIDEO_DOWNLOADED`, `VIDEO_SHARED` |
| `platform` | optional | `android` / `ios` |
| `image_id` | when image event | `45` |
| `video_id` | when video event | `88` |

> Do **not** send `user_id` — the server uses the token. `APP_OPENED` needs no media id.

### ✅ Success — 200
```json
{
  "status_code": 200,
  "Status": "success",
  "message": "Recorded",
  "data": { "id": null, "user_id": 12, "type": "IMAGE_DOWNLOADED", "image_id": 45, "video_id": null }
}
```

### ❌ Failure — 401
```json
{ "status_code": 401, "Status": "error", "message": "Session expired. Please sign in again." }
```

---

# 5. Notifications

## 5.0 Push notification overview (Firebase Cloud Messaging)
The server sends **automatic FCM push notifications** when new media is published in your business.
This happens in two cases:

1. **Immediate upload**: when images/videos are uploaded with no scheduled publish time, a push is
   sent right away.
2. **Scheduled publish**: when the scheduled time arrives, the media transitions from draft to
   published and a push is sent.

**Firebase Setup (already configured server-side):**
- Project: `pixsign-pro` (project_number: `482290357821`)
- App package: `com.t2g.pixsignpro`
- The server uses Firebase Admin SDK to send pushes to all registered device tokens in your business.

---

## 5.1 Store FCM token
Register the device's push token so it receives new-media notifications.

- **Method / URL:** `POST /pro/api/user-fcm-store.php`
- **Auth:** `Authorization: Bearer <access_token>`
- **Headers:** `multipart/form-data` (or form-urlencoded)
- **Body fields:**

| Field | Required | Example |
|-------|----------|---------|
| `token` | yes | `<fcm device token from Firebase Messaging>` |
| `device_type` | optional | `android` / `ios` |

> Do **not** send `user_id` — taken from the token.

### ✅ Success — 200
```json
{ "status_code": 200, "Status": "success", "message": "OK" }
```

### ❌ Failure — 401
```json
{ "status_code": 401, "Status": "error", "message": "Session expired. Please sign in again." }
```

---

## 5.2 Incoming push notification format
When media is published, the app receives an FCM push with this structure:

```json
{
  "notification": {
    "title": "New image available",
    "body": "\"My awesome photo\" is now available to download."
  },
  "data": {
    "type": "media_published",
    "count": "1"
  }
}
```

**Sample payloads:**
- Single image: `{ "title": "New image available", "body": "\"Photo Title\" is now available to download." }`
- Single video: `{ "title": "New video available", "body": "\"Video Title\" is now available to download." }`
- Multiple: `{ "title": "New media available", "body": "2 images and 1 video are now available to download." }`

**App-side implementation:**
1. Initialize Firebase Messaging (`firebase_messaging` package).
2. Request notification permission (iOS 13+, Android 13+).
3. Retrieve FCM token on app launch via `FirebaseMessaging.instance.getToken()`.
4. Call `POST /pro/api/user-fcm-store.php` to register the token (do this once per app install or when token changes).
5. Listen to foreground & background messages via `FirebaseMessaging.onMessage` / `onBackgroundMessage`.
6. On receive, refresh the media list (`GET /pro/api/view-images.php` + `view-videos.php`) to display new items.

---

# 6. Summary of client responsibilities

1. **Login** via `POST` body → store `access_token` + `refresh_token` in secure storage.
2. Attach `Authorization: Bearer <access_token>` to **every** request except login/refresh.
3. **Do not send** `business_id` / `user_id` / `api-key` anymore.
4. On **HTTP 401**: call `refresh.php` once, retry; if it fails, clear storage → login.
5. Treat media URLs as **short-lived**; re-fetch lists when they expire.
6. **Logout / delete**: call the endpoint, then clear secure storage.
7. Enforce **HTTPS only**; consider TLS certificate pinning for `portal.pixsignpro.in`.

---

## Endpoint index (in order)
| # | Endpoint | Method | Auth |
|---|----------|--------|------|
| 1.1 | `/login.php` | POST | none |
| 1.2 | `/refresh.php` | POST | refresh token |
| 1.3 | `/logout.php` | POST | Bearer |
| 2.1 | `/register.php` | POST | none |
| 2.2 | `/user_profile.php` | GET | Bearer |
| 2.3 | `/update-profile.php` | POST | Bearer |
| 2.4 | `/update-password.php` | POST | Bearer |
| 2.5 | `/delete-user.php` | POST | Bearer |
| 3.1 | `/view-images.php` | GET | Bearer |
| 3.2 | `/view-videos.php` | GET | Bearer |
| 3.3 | `/upload-image.php` | POST | Bearer (bizadmin) |
| 3.4 | `/upload-video.php` | POST | Bearer (bizadmin) |
| 3.5 | `/uploads/<biz>/<file>` | GET | signed URL |
| 4.1 | `/analytics.php` | POST | Bearer |
| 5.1 | `/user-fcm-store.php` | POST | Bearer |

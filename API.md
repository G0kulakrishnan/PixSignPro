# PixSign Pro API Documentation

**Base URL:** `https://portal.pixsignpro.in/api` (portal + admin) · `https://portal.pixsignpro.in/pro/api` (legacy mobile)

**Last Updated:** 2026-07-09 — verified directly against source (`apps/api/src/routes/`).

---

## Table of Contents

1. [Authentication](#authentication)
2. [Response Format](#response-format)
3. [Business Portal API](#business-portal-api)
4. [Admin Panel API](#admin-panel-api)
5. [Legacy Mobile API](#legacy-mobile-api)
6. [Error Codes](#error-codes)
7. [Roles & Permissions](#roles--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)

---

## Authentication

### Header Format
All requests (except login/refresh) require:
```
Authorization: Bearer <accessToken>
```

### Login (Business User)
**Endpoint:** `POST /auth/login`

**Request:**
```json
{ "mobileNo": "9876543210", "password": "yourpassword" }
```

**Response (200):**
```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Ramesh Kumar",
      "role": "business_admin",
      "businessId": "550e8400-e29b-41d4-a716-446655440001",
      "businessName": "Kumar Enterprises"
    }
  }
}
```

**Errors:** `400 validation_error`, `401 invalid_credentials`, `403 account_disabled`,
`403 account_expired` (per-user expiry passed), `403 subscription_inactive`,
`403 subscription_expired`.

### Refresh Token
**Endpoint:** `POST /auth/refresh`

**Request:** `{ "refreshToken": "..." }`

**Response (200):** `{ "data": { "accessToken": "..." } }`

**Errors:** `401 unauthorized` (invalid/expired refresh token, or business subscription inactive).

### Get Current User
**Endpoint:** `GET /auth/me` (Bearer)

**Response (200):**
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Ramesh Kumar",
    "mobileNo": "9876543210",
    "role": "business_admin",
    "businessId": "550e8400-e29b-41d4-a716-446655440001",
    "profilePicUrl": "/api/profile/file/<uuid>.jpg",
    "companyLogoUrl": "/api/profile/file/<uuid>.png",
    "agencyName": "Kumar Enterprises",
    "city": "Madurai",
    "youtube": "", "website": "https://kumar.in", "instagram": "@kumar_enterprises",
    "optional1": null, "optional2": null,
    "lastAppOpenedAt": "2026-07-09T12:30:00Z",
    "business": { "name": "Kumar Enterprises", "website": "https://kumar.in" }
  }
}
```

### Logout
**Endpoint:** `POST /auth/logout` (Bearer) → `{ "data": { "message": "Logged out successfully" } }`
Stateless JWT — this just acknowledges; no server-side revocation for portal tokens.

### Admin Login
**Endpoint:** `POST /auth/admin/login`

**Request:** `{ "mobileNo": "...", "password": "..." }`

**Response (200):**
```json
{ "data": { "accessToken": "...", "admin": { "id": "admin-uuid", "name": "Platform Owner" } } }
```
Token expires in 8h. Errors: `401 invalid_credentials`.

---

## Response Format

**Success:** `{ "data": <payload> }` — HTTP 200 (201 for creates).

**Error:** `{ "error": { "code": "...", "message": "..." } }` — HTTP 4xx/5xx.

This envelope applies to `/api/*` (portal + admin) only. `/pro/api/*` (legacy mobile) uses a
different, PHP-era envelope — see [Legacy Mobile API](#legacy-mobile-api).

---

## Business Portal API

All endpoints require `Authorization: Bearer <accessToken>` from a **business user** login.

### Media

#### List Media
**Endpoint:** `GET /media?type=image|video`

Download-only roles (`staff`, `user_full_admin`, `user_creation_admin`) only see published items
(`scheduledPublishAt` null/past, or `published: true`). Upload roles see everything, including
not-yet-published scheduled items.

**Response (200):**
```json
{
  "data": [
    {
      "id": "media-uuid-1", "type": "image", "title": "Product Shot",
      "caption": "Beautiful summer collection", "mimeType": "image/jpeg", "fileSize": 1048576,
      "scheduledPublishAt": null, "published": true,
      "createdAt": "2026-07-09T10:00:00Z", "uploadedById": "user-uuid-1"
    }
  ]
}
```

#### Upload Media
**Endpoint:** `POST /media/upload` · **Role:** `media_admin`, `business_admin`

**Request (multipart/form-data):**
```
files: <up to 20 files>
titles: '["Title 1","Title 2"]'        (optional JSON array, one per file; auto-named if omitted)
captions: '["Caption 1", null]'        (optional JSON array, one per file)
caption: "Shared caption"              (optional — applies to every file if per-file caption absent)
scheduledPublishAt: "2026-07-10T14:00:00Z"   (optional ISO datetime; omitted = publish immediately)
```

**Response (201):**
```json
{ "data": [ { "id": "media-uuid-1", "type": "image", "title": "Product Shot", "caption": "...", "scheduledPublishAt": null, "published": true } ] }
```
**Errors:** `400 validation_error` (no files), `403 plan_limit` (image/video count), `403 storage_limit`.
An immediately-published upload triggers an FCM push to the business's registered devices.

#### Scheduled Media Summary
**Endpoint:** `GET /media/scheduled/summary` · **Role:** `business_admin`, `media_admin`
```json
{
  "data": {
    "total": 5, "images": 3, "videos": 2,
    "byDay": [ { "date": "2026-07-10", "total": 3, "images": 2, "videos": 1,
      "items": [ { "id": "media-uuid-1", "title": "Product Shot", "type": "image", "scheduledPublishAt": "2026-07-10T14:00:00Z" } ] } ]
  }
}
```

#### Get Media
**Endpoint:** `GET /media/:id` → the media row (`fileSize` as a number). `404` if not found/not visible to the caller's role.

#### Media Analytics
**Endpoint:** `GET /media/:id/analytics` · **Role:** `business_admin`, `media_admin`
```json
{ "data": { "downloads": 42, "shares": 15, "views": 128 } }
```

#### Preview / Download
- `GET /media/:id/preview` — binary stream, no event recorded (used for thumbnails).
- `GET /media/:id/download` — binary stream, `Content-Disposition: attachment`, records a `download` event.

#### Update Media
**Endpoint:** `PATCH /media/:id` · **Role:** `media_admin`, `business_admin`
```json
{ "title": "Updated Title", "caption": "New caption or null to clear", "scheduledPublishAt": "2026-07-10T14:00:00Z" }
```
All fields optional; setting `scheduledPublishAt` un-publishes until that time.

#### Delete Media
**Endpoint:** `DELETE /media/:id` · **Role:** `media_admin`, `business_admin` → `{ "data": { "message": "Media deleted" } }`

### Users

#### List Users
**Endpoint:** `GET /users` · **Role:** `business_admin`, `media_admin`, `user_full_admin`
`user_full_admin` only sees `staff` users (the only role it may manage).
```json
{ "data": [ { "id": "user-uuid-1", "name": "Ramesh Kumar", "mobileNo": "9876543210", "role": "staff", "city": "Madurai", "agencyName": null, "isActive": true, "expiresAt": null, "createdAt": "2026-01-01T00:00:00Z" } ] }
```

#### Create User
**Endpoint:** `POST /users` · **Role:** `business_admin`, `user_full_admin`, `user_creation_admin`
```json
{ "mobileNo": "9876543211", "password": "welcome123", "name": "Priya S", "role": "staff", "city": "Chennai", "agencyName": "Priya Designs", "expiresAt": null }
```
The caller may only assign a role within its own `assignableRoles()` — `business_admin` can
assign anything; `user_full_admin`/`user_creation_admin` can only assign `staff`.
**Response (201):** `{ "id", "name", "mobileNo", "role", "isActive", "expiresAt" }`
**Errors:** `403 forbidden` (role escalation), `409 mobile_taken`, `403 plan_limit` (`maxUsers`, `-1` = unlimited).

#### Bulk Import Staff
**Endpoint:** `POST /users/bulk` · **Role:** `business_admin`, `user_full_admin`, `user_creation_admin`
```json
{ "users": [ { "name": "Ramesh Kumar", "mobileNo": "9876543210", "password": "staff123", "city": "Madurai", "expiresAt": null } ] }
```
Role is always `staff` (no escalation path). Max **500 rows** per request.
**Response (201):**
```json
{ "data": { "created": 1, "skippedCount": 1, "skipped": [ { "row": 2, "mobileNo": "9876543211", "reason": "Mobile number already registered" } ] } }
```
Skip reasons: invalid row shape, duplicate mobile within the file, mobile already registered,
plan `maxUsers` limit reached.

#### Get User
**Endpoint:** `GET /users/:id` · **Role:** `business_admin`, `user_full_admin` (staff targets only)
```json
{ "data": { "id": "user-uuid-1", "name": "Ramesh Kumar", "mobileNo": "9876543210", "role": "staff", "city": "Madurai", "agencyName": null, "isActive": true, "expiresAt": null, "createdAt": "2026-01-01T00:00:00Z" } }
```
**Errors:** `404 not_found`, `403 forbidden` (target role outside caller's management scope).

#### Update User
**Endpoint:** `PUT /users/:id` · **Role:** `business_admin`, `user_full_admin` (staff targets only)
All fields optional: `name`, `mobileNo`, `role`, `city`, `agencyName`, `isActive`, `expiresAt`.
Role changes are still subject to `assignableRoles()`.
**Response (200):** `{ "id", "name", "mobileNo", "role", "isActive", "expiresAt" }`
**Errors:** `404 not_found`, `403 forbidden`, `409 conflict` (mobile in use by another user).

#### Reset User Password
**Endpoint:** `POST /users/:id/reset-password` · **Role:** `business_admin`, `user_full_admin`
```json
{ "password": "newpassword123" }
```
**Response (200):** `{ "data": { "message": "Password reset successfully" } }`

#### Delete User
**Endpoint:** `DELETE /users/:id` · **Role:** `business_admin`, `user_full_admin` (staff targets only)
A caller cannot delete their own account (`400 bad_request`).
**Response (200):** `{ "data": { "message": "User deleted" } }`

### Profile

All profile endpoints act on the **calling user's own record** — there is no shared "business
profile" entity editable from the portal (only super_admin edits the `businesses` table directly).

#### Get My Profile
**Endpoint:** `GET /profile`
```json
{
  "data": {
    "id": "user-uuid-1", "name": "Ramesh Kumar", "mobileNo": "9876543210", "role": "business_admin",
    "profilePicUrl": "/api/profile/file/<uuid>.jpg", "companyLogoUrl": "/api/profile/file/<uuid>.png",
    "agencyName": "Kumar Enterprises", "city": "Madurai",
    "youtube": null, "website": "https://kumar.in", "instagram": null,
    "optional1": null, "optional2": null, "shareMessage": "Check out our latest collection!",
    "business": { "name": "Kumar Enterprises", "website": "https://kumar.in" }
  }
}
```

#### Update My Profile
**Endpoint:** `PUT /profile` — all fields optional:
`name`, `agencyName`, `city`, `youtube`, `website`, `instagram`, `optional1`, `optional2`, `shareMessage`.
**Response (200):** `{ "id", "name", "agencyName", "city", "shareMessage" }`

#### Change My Password
**Endpoint:** `POST /profile/change-password`
```json
{ "currentPassword": "oldpass123", "newPassword": "newpass123" }
```
**Response (200):** `{ "data": { "message": "Password changed successfully" } }`
**Errors:** `401 invalid_password`.

#### Upload Profile Picture
**Endpoint:** `POST /profile/picture` — multipart, field name **`file`**.
**Response (200):** `{ "id", "profilePicUrl" }`. Old file is deleted from disk.

#### Upload Company Logo
**Endpoint:** `POST /profile/logo` — multipart, field name **`file`**.
**Response (200):** `{ "id", "companyLogoUrl" }`.

#### Serve Profile File
**Endpoint:** `GET /profile/file/:filename` (Bearer) — streams the **caller's own** profile
picture / logo (tenant-scoped by JWT, path-traversal guarded). Not publicly listable.

### Analytics

**Endpoint:** `GET /analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` · **Role:** `business_admin`, `media_admin`

Both `from`/`to` are optional date filters on event timestamps.
```json
{
  "data": [
    {
      "sNo": 1, "username": "Ramesh Kumar", "mobileNo": "9876543210", "city": "Madurai",
      "mediaName": "Product Shot", "uploadedDate": "2026-07-08T10:00:00Z",
      "imageShared": 5, "imageDownloaded": 12, "videoShared": 0, "videoDownloaded": 0,
      "appOpened": 3, "appOpenedDate": "2026-07-09T14:30:00Z", "date": "2026-07-09"
    }
  ]
}
```
Users who opened the app but have no download/share activity in range still appear (as a row with
`mediaName: "—"`), so admins can see engagement without action.

### Events

**Endpoint:** `POST /events`
```json
{ "mediaId": "media-uuid-1", "eventType": "download" }
```
`eventType`: `download` | `share` | `view`. `mediaId` is optional — omit it to just record an
app-open (bumps `lastAppOpenedAt`); include it and the server verifies the media belongs to the
caller's business first (`404 not_found` if not).
**Response (200):** `{ "data": { "recorded": true } }`

---

## Admin Panel API

All endpoints require `Authorization: Bearer <accessToken>` from a **super_admin** login
(`POST /auth/admin/login`, see [Authentication](#authentication)).

### Subscription Plans

#### List Plans
**Endpoint:** `GET /admin/plans` (no filters — returns all plans, ordered by price ascending)
```json
{ "data": [ { "id": "plan-uuid-1", "name": "Starter", "price": "999.00", "currency": "INR", "billingPeriod": "monthly", "maxUsers": 25, "maxStorageMb": 5120, "maxImages": -1, "maxVideos": -1, "features": {}, "isActive": true, "createdAt": "..." } ] }
```
**Limit convention:** `-1` = unlimited, `0` = none allowed, positive integer = hard cap.

#### Create Plan
**Endpoint:** `POST /admin/plans`
```json
{ "name": "Premium", "price": 2999, "currency": "INR", "billingPeriod": "monthly", "maxUsers": 100, "maxStorageMb": 51200, "maxImages": -1, "maxVideos": -1, "isActive": true }
```
**Response (201):** the created plan.

#### Update Plan
**Endpoint:** `PUT /admin/plans/:id` — all fields optional (partial update). **Response (200):** the updated plan. `404 not_found`.

#### Deactivate Plan
**Endpoint:** `DELETE /admin/plans/:id` — soft delete (`isActive: false`). **Response (200):** `{ "message": "Plan deactivated" }`.

### Businesses

#### List Businesses
**Endpoint:** `GET /admin/businesses` (no query params — returns every business)
```json
{
  "data": [
    {
      "id": "business-uuid-1", "name": "Kumar Enterprises", "agencyName": "Kumar Media", "city": "Madurai",
      "website": "https://kumar.in", "logoUrl": null, "planId": "plan-uuid-1",
      "subscriptionStatus": "active", "subscriptionStart": "2026-01-01T00:00:00Z", "subscriptionEnd": "2026-12-31T23:59:59Z",
      "isActive": true, "createdAt": "2026-01-01T00:00:00Z",
      "plan": { "name": "Starter", "price": "999.00" },
      "_count": { "users": 5, "media": 28 }
    }
  ]
}
```

#### Get Business
**Endpoint:** `GET /admin/businesses/:id`
```json
{
  "data": {
    "id": "business-uuid-1", "name": "Kumar Enterprises", "...": "... (all business columns)",
    "plan": { "id": "plan-uuid-1", "name": "Starter", "...": "full plan object" },
    "users": [ { "id": "user-uuid-1", "name": "Ramesh Kumar", "mobileNo": "9876543210", "role": "business_admin", "isActive": true, "createdAt": "..." } ],
    "_count": { "media": 28, "mediaEvents": 340, "users": 5 }
  }
}
```
**Errors:** `404 not_found`.

#### Create Business
**Endpoint:** `POST /admin/businesses` — creates the business **and** its first `business_admin` in one transaction.
```json
{
  "name": "Kumar Enterprises", "agencyName": "Kumar Media", "city": "Madurai", "website": "https://kumar.in",
  "planId": "plan-uuid-1", "subscriptionStatus": "active",
  "subscriptionStart": "2026-01-01T00:00:00Z", "subscriptionEnd": "2026-12-31T23:59:59Z",
  "adminName": "Ramesh Kumar", "adminMobileNo": "9876543210", "adminPassword": "securepass123"
}
```
`subscriptionStatus` defaults to `active` if omitted. **Response (201):** the created business row.
**Errors:** `409 mobile_taken` (admin mobile already registered).

#### Update Business
**Endpoint:** `PUT /admin/businesses/:id` — all fields optional: `name`, `agencyName`, `city`, `website`,
`planId`, `subscriptionStatus`, `subscriptionStart`, `subscriptionEnd`, `isActive`.
**Response (200):** the updated business row. `404 not_found`.

#### Deactivate Business
**Endpoint:** `DELETE /admin/businesses/:id` — soft delete (`isActive: false`, `subscriptionStatus: 'suspended'`).
**Response (200):** `{ "message": "Business deactivated" }`.

### Admin Users

Full CRUD, cross-tenant. Super_admin may assign **any** role (no privilege-escalation guard —
it's already the top of the role hierarchy).

#### List All Users
**Endpoint:** `GET /admin/users?search=&businessId=`
- `search` (optional): matches name, mobile, or city (case-insensitive)
- `businessId` (optional): filter to one business
```json
{
  "data": [
    {
      "id": "user-uuid-1", "name": "Ramesh Kumar", "mobileNo": "9876543210", "role": "business_admin",
      "city": "Madurai", "agencyName": "Kumar Enterprises", "isActive": true, "expiresAt": null,
      "lastAppOpenedAt": "2026-07-09T12:30:00Z", "createdAt": "2026-01-01T00:00:00Z",
      "status": "active", "expired": false,
      "business": { "id": "business-uuid-1", "name": "Kumar Enterprises", "subscriptionStatus": "active", "subscriptionEnd": "2026-12-31T23:59:59Z", "isActive": true }
    }
  ]
}
```
`status`/`expired` are computed: `"inactive"` if the user is disabled, expired, or the business
is inactive/expired/suspended.

#### Get User Details
**Endpoint:** `GET /admin/users/:id` — same shape as one list row (without `status`/`expired`). `404 not_found`.

#### Create User
**Endpoint:** `POST /admin/users`
```json
{ "businessId": "business-uuid-1", "name": "Priya S", "mobileNo": "9876543211", "password": "welcome123", "role": "staff", "city": "Chennai", "agencyName": "Priya Designs", "expiresAt": null }
```
**Response (201):** the created user. **Errors:** `404 not_found` (bad businessId), `409 mobile_taken`,
`403 plan_limit` (business's plan `maxUsers`).

#### Update User (Full Edit)
**Endpoint:** `PUT /admin/users/:id` — all fields optional: `name`, `mobileNo`, `password`
(re-hashed if present, otherwise unchanged), `role`, `city`, `agencyName`, `isActive`, `expiresAt`.
**Response (200):** the updated user. **Errors:** `404 not_found`, `409 conflict`.

#### Set User Expiry (Quick Action)
**Endpoint:** `PATCH /admin/users/:id` — `{ "expiresAt": "...", "isActive": true }`, both optional.
Lighter-weight than `PUT`, used by the admin UI's quick "Set Expiry" popup.
**Response (200):** `{ "id", "name", "expiresAt", "isActive" }`.

#### Delete User
**Endpoint:** `DELETE /admin/users/:id` → `{ "message": "User deleted" }`. `404 not_found`.

### Admin Overview

**Endpoint:** `GET /admin/overview`
```json
{
  "data": {
    "stats": { "totalBusinesses": 15, "activeBusinesses": 14, "totalUsers": 87, "totalMedia": 342 },
    "recentBusinesses": [
      { "id": "business-uuid-1", "name": "Kumar Enterprises", "createdAt": "2026-07-08T10:00:00Z",
        "plan": { "name": "Starter" }, "_count": { "users": 5, "media": 28 } }
    ]
  }
}
```
`recentBusinesses` is the 10 most-recently-created businesses.

---

## Legacy Mobile API

**Audience:** the Flutter app (`techtogrowindia/pixsignpro_new`). Serves the PHP-era contract
(response shapes + integer ids) the app already expects, but with **modern token auth** —
not the old static-API-key model. Full endpoint-by-endpoint detail with worked examples used
during implementation: see `MOBILE_API_PLAN.md` (original contract mapping) and
`MOBILE_SECURITY_PLAN.md` (the auth hardening design implemented below).

**Base URL:** `https://portal.pixsignpro.in/pro/api`

### Auth model
- **Login** (`POST /login.php`) returns an **`access_token`** (JWT, 15 min) and an opaque
  **`refresh_token`** (DB-backed, SHA-256 hashed at rest, 30 days).
- Every other endpoint requires:
  ```
  Authorization: Bearer <access_token>
  ```
- The server derives `business_id`, `user_id`, and `role` **from the token**. Client-sent ids in
  the request are ignored — this closes the old IDOR-prone trust model.
- On `401`, call `POST /refresh.php` once to get a new pair (refresh tokens **rotate** — the old
  one is revoked); if refresh also fails, clear tokens and return to login.
- There is **no `api-key` parameter** — it was removed with the auth hardening.
- Password changes and `delete-user.php` revoke **all** of that user's refresh tokens
  (force logout on every device).

### Response envelope
Every legacy response is **HTTP 200** with the body carrying the real status:
```json
{ "status_code": 200, "Status": "success", "message": "...", "...": "..." }
```
`Status` is capital-S (differs from the portal's `{data}`/`{error}` envelope). Error example:
```json
{ "status_code": 401, "Status": "error", "message": "Token expired or invalid" }
```

### Integer ids
The app parses ids as `int`. Businesses/users/media each carry a `legacy_id` surrogate;
internal UUIDs are never exposed to the app.

### Shared object: `user_details`
Returned by login, `user_profile.php`, `update-profile.php`.
```json
{
  "id": 12, "business_id": 3, "name": "Ramesh Kumar", "mobile": "9876543210",
  "agency_name": "Bright Studio", "city": "Madurai", "role": "bizadmin",
  "expiry_date": "2026-12-31T00:00:00.000Z", "status": "active",
  "profile_pic": "https://portal.pixsignpro.in/uploads/<biz-uuid>/<file>.jpg?exp=1767200000&sig=ab12…",
  "logo": "https://portal.pixsignpro.in/uploads/<biz-uuid>/<file>.png?exp=1767200000&sig=cd34…",
  "youtube": null, "website": null, "instagram": null,
  "optional_field_1": null, "optional_field_2": null,
  "share_message": "Check out our latest products!",
  "created_at": "2026-07-02T17:04:38.234Z", "updated_at": "2026-07-02T17:05:03.517Z"
}
```
- `role`: `"bizadmin"` (business_admin/media_admin — sees the upload button) or `"staff"`
  (staff, user_full_admin, user_creation_admin — download only).
- `status`: `"active"` or `"inactive"` (user disabled/expired, or business inactive/expired/suspended).
- `expiry_date`: the user's own expiry if set, else the business's `subscription_end`.
- `profile_pic` / `logo`: **signed URLs** (~1 hour validity) or `null`.
- `share_message`: the user's default share caption, used as the share-dialog fallback when a
  media item has no per-item caption.

### Shared object: media item
Returned inside `view-images.php` / `view-videos.php`.
```json
{
  "id": 45,
  "image_url": "https://portal.pixsignpro.in/uploads/<biz-uuid>/<file>.jpg?exp=1767200000&sig=ef56…",
  "video_url": null, "width": null, "height": null, "thumbnail_url": null,
  "share_message": "Beautiful summer collection",
  "created_at": "2026-07-02T14:03:25.693Z"
}
```
Videos: `video_url` is set (+ `thumbnail_url` when available), `image_url` is `null`.
`share_message` is the per-item caption set at upload; `null` → app falls back to the profile's `share_message`.

### Signed media URLs
```
GET /uploads/<businessId>/<filename>?exp=<unix>&sig=<hmac>
```
HMAC-SHA256 signed, ~1 hour validity. No auth header needed — the signature *is* the capability.
Expired/forged → `403`; not found → `404`. Cache for the session; re-fetch the list when links stop loading.

### Endpoints

| # | Endpoint | Method | Auth |
|---|----------|--------|------|
| 1 | `/login.php` | POST | none (rate-limited: 10/15min) |
| 2 | `/refresh.php` | POST | refresh token in body |
| 3 | `/logout.php` | POST | Bearer |
| 4 | `/register.php` | POST | none |
| 5 | `/user_profile.php` | GET | Bearer |
| 6 | `/delete-user.php` | POST | Bearer |
| 7 | `/update-profile.php` | POST | Bearer |
| 8 | `/update-password.php` | POST | Bearer |
| 9 | `/view-images.php` | GET | Bearer |
| 10 | `/view-videos.php` | GET | Bearer |
| 11 | `/upload-image.php` | POST | Bearer (business_admin/media_admin only) |
| 12 | `/upload-video.php` | POST | Bearer (business_admin/media_admin only) |
| 13 | `/analytics.php` | POST | Bearer |
| 14 | `/user-fcm-store.php` | POST | Bearer |
| — | `/uploads/:businessId/:filename` | GET | signed URL (no Bearer) |

#### 1. Login
`POST /login.php` · body (JSON or form) `{ "username": "<mobile>", "password": "<pass>" }`
```json
{ "status_code": 200, "Status": "success", "message": "Login successful", "access_token": "...", "refresh_token": "...", "user_details": { } }
```
Failure: `401` invalid credentials, `403` account disabled/expired, `429` too many attempts.

#### 2. Refresh
`POST /refresh.php` · body `{ "refresh_token": "<token>" }` → new rotated pair.
Failure: `401` invalid/expired/already-rotated → app must force re-login.

#### 3. Logout
`POST /logout.php` (Bearer) → revokes all refresh tokens for the user.

#### 4. Register
`POST /register.php` (public, multipart/form) — `name`, `mobile`, `password` (min 6), `business_id`
(integer legacy id the app targets). Creates a `staff` user under that business.
Success → `201`. Failure: `409` mobile already registered, `400` validation, `404` business not found.

#### 5. Get my profile
`GET /user_profile.php` (Bearer, no params — identity from token) → `{ user_details }`.

#### 6. Delete my account
`POST /delete-user.php` (Bearer) — soft-deletes (deactivates) the caller, revokes their refresh tokens.

#### 7. Update profile
`POST /update-profile.php` (Bearer, multipart) — all fields optional, send only what changed:
`name`, `mobile`, `agency_name`, `city`, `youtube`, `website`, `instagram`, `optional_field_1`,
`optional_field_2`, `share_message`, `profile_pic` (file), `logo` (file). Returns updated `user_details`.
Failure: `409` mobile already in use.

#### 8. Update password
`POST /update-password.php` (Bearer) — `old_password`, `new_password` (min 6). Revokes all
refresh tokens on success (forces re-login on other devices). Failure: `401` wrong current password.

#### 9 & 10. List images / videos
`GET /view-images.php` / `GET /view-videos.php` (Bearer, no params) → `{ data: [media items] }`.
Only published (or past `scheduled_publish_at`) items are returned.

#### 11 & 12. Upload image / video
`POST /upload-image.php` (field `image`) / `POST /upload-video.php` (field `video`) — Bearer,
multipart. Optional `caption` field (per-item share text).
Failure: `400` no file, `403` role not allowed to upload or plan media/storage limit reached.
Uploads publish immediately and trigger an FCM push to the business's devices.

#### 13. Record analytics event
`POST /analytics.php` (Bearer) — `type` (`APP_OPENED` | `IMAGE_DOWNLOADED` | `IMAGE_SHARED` |
`VIDEO_DOWNLOADED` | `VIDEO_SHARED`), `platform` (optional), `image_id` / `video_id` (when
applicable — integer legacy id). `user_id` is never sent; identity is the token.

#### 14. Store FCM token
`POST /user-fcm-store.php` (Bearer) — `token` (required), `device_type` (optional). Registers
the device for new-media push notifications.

---

## Error Codes

```json
{ "error": { "code": "error_code", "message": "Human-readable description" } }
```

| Code | Status | Description |
|------|--------|-------------|
| `validation_error` | 400 | Request validation failed (missing/invalid fields) |
| `bad_request` | 400 | Semantically invalid request (e.g. deleting your own account) |
| `invalid_credentials` | 401 | Login failed — wrong mobile or password |
| `invalid_password` | 401 | Current password incorrect (change-password) |
| `unauthorized` | 401 | Missing/invalid JWT, or refresh token invalid/expired |
| `account_disabled` | 403 | User account has been disabled |
| `account_expired` | 403 | User's own `expiresAt` has passed |
| `subscription_inactive` | 403 | Business subscription is inactive |
| `subscription_expired` | 403 | Business subscription end date has passed |
| `forbidden` | 403 | Role not permitted for this action (incl. privilege-escalation guard) |
| `plan_limit` | 403 | Plan user/media-count limit reached |
| `storage_limit` | 403 | Plan storage limit reached |
| `not_found` | 404 | Resource not found |
| `mobile_taken` | 409 | Mobile number already registered (create) |
| `conflict` | 409 | Mobile number already in use by another user (update) |
| `server_error` | 500 | Unexpected server error |

---

## Roles & Permissions

### Business Roles

| Role | Users | Media | Analytics | Profile |
|------|-------|-------|-----------|---------|
| **staff** | Download only | Download only | ❌ | Edit own |
| **media_admin** | ❌ | Upload, delete, schedule | ✅ | Edit own |
| **user_creation_admin** | Create staff only | Download only | ❌ | Edit own |
| **user_full_admin** | List/create/edit/delete staff | Download only | ❌ | Edit own |
| **business_admin** | Full CRUD, any role | Upload, delete, schedule | ✅ | Edit own |

Only `business_admin` may assign roles other than `staff`. See `apps/api/src/lib/roles.ts`.

### Platform Role

| Role | Businesses | Plans | Users (any tenant) |
|------|------------|-------|---------------------|
| **super_admin** | Full CRUD | Full CRUD | Full CRUD, any role |

---

## Rate Limiting & Quotas

- **`/api/auth/*`**: 20 requests / 15 min per IP.
- **All other `/api/*`**: 500 requests / 15 min per IP.
- **`/pro/api/*`** (legacy mobile): 500 requests / 15 min per IP, plus `/login.php` specifically:
  10 attempts / 15 min.
- **JSON body size**: 1 MB (`express.json({ limit: '1mb' })`) — applies to non-multipart requests.
- **Media upload**: max 20 files per `/media/upload` request; max file size 500 MB (env-configurable).
- **Bulk user import**: max 500 rows per `/users/bulk` request.
- **Plan limits**: `maxUsers`, `maxImages`, `maxVideos`, `maxStorageMb` — `-1` = unlimited, `0` = none allowed, enforced per-business on create/upload.

---

## Appendix: Example Workflows

### Workflow 1: Business User Uploads an Image
1. `POST /auth/login` with mobile + password.
2. `POST /media/upload` with the image file (+ optional title/caption/schedule).
3. Staff later hits `GET /media/:id/download` (records a `download` event).

### Workflow 2: Admin Creates a Business & First User
1. `POST /auth/admin/login`.
2. `POST /admin/businesses` with business info, plan, and the first `business_admin`'s credentials.
3. That admin logs in via `POST /auth/login`.
4. `POST /users` or `POST /users/bulk` to add team members.

### Workflow 3: Mobile App Tracks a Download
1. `POST /pro/api/login.php` → store `access_token` + `refresh_token`.
2. `GET /pro/api/view-images.php` (Bearer) → render `image_url` (signed, ~1h).
3. User taps download/share → save the file, then `POST /pro/api/analytics.php` with
   `type: "IMAGE_DOWNLOADED"` (or `IMAGE_SHARED`) + `image_id`.
4. On `401` anywhere: `POST /pro/api/refresh.php` once, retry; if that also fails, clear tokens
   and return to login.

---

**For questions or integration support, contact the development team.**

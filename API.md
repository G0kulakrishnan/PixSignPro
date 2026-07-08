# PixSign Pro API Documentation

**Base URL:** `https://portal.pixsignpro.in/api`

**Last Updated:** 2026-07-09

---

## Table of Contents

1. [Authentication](#authentication)
2. [Response Format](#response-format)
3. [Business Portal API](#business-portal-api)
4. [Admin Panel API](#admin-panel-api)
5. [Legacy Mobile API](#legacy-mobile-api)
6. [Error Codes](#error-codes)
7. [Roles & Permissions](#roles--permissions)

---

## Authentication

### Header Format
All requests (except login) require an `Authorization` header:
```
Authorization: Bearer <accessToken>
```

### Login (Business User)
**Endpoint:** `POST /auth/login`

**Request:**
```json
{
  "mobileNo": "9876543210",
  "password": "yourpassword"
}
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

**Errors:**
- `401 invalid_credentials` — Invalid mobile number or password
- `403 account_disabled` — Account has been disabled
- `403 account_expired` — User account has expired
- `403 subscription_inactive` — Business subscription is inactive
- `403 subscription_expired` — Business subscription has expired

### Refresh Token
**Endpoint:** `POST /auth/refresh`

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**
```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Get Current User
**Endpoint:** `GET /auth/me`

**Response (200):**
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Ramesh Kumar",
    "mobileNo": "9876543210",
    "role": "business_admin",
    "businessId": "550e8400-e29b-41d4-a716-446655440001",
    "profilePicUrl": "/uploads/550e8400.../profile.jpg",
    "companyLogoUrl": "/uploads/550e8400.../logo.png",
    "agencyName": "Kumar Enterprises",
    "city": "Madurai",
    "youtube": "",
    "website": "https://kumar.in",
    "instagram": "@kumar_enterprises",
    "optional1": null,
    "optional2": null,
    "lastAppOpenedAt": "2026-07-09T12:30:00Z",
    "business": {
      "name": "Kumar Enterprises",
      "website": "https://kumar.in"
    }
  }
}
```

### Logout
**Endpoint:** `POST /auth/logout`

**Response (200):**
```json
{
  "data": {
    "message": "Logged out successfully"
  }
}
```

---

## Response Format

All API responses follow a consistent envelope format:

### Success Response
```json
{
  "data": { /* response payload */ }
}
```

**HTTP Status:** 200 (or 201 for POST/PATCH that creates/modifies)

### Error Response
```json
{
  "error": {
    "code": "validation_error",
    "message": "User limit reached (max 50)"
  }
}
```

**HTTP Status:** 400, 401, 403, 404, 500, etc.

---

## Business Portal API

All endpoints require a valid `Authorization` header with a **business user** JWT.

### Media

#### List Media
**Endpoint:** `GET /media?type=image|video`

**Query Parameters:**
- `type` (optional): `image` or `video` — filter by media type

**Response (200):**
```json
{
  "data": [
    {
      "id": "media-uuid-1",
      "type": "image",
      "title": "Product Shot",
      "caption": "Beautiful summer collection",
      "mimeType": "image/jpeg",
      "fileSize": 1048576,
      "scheduledPublishAt": null,
      "published": true,
      "createdAt": "2026-07-09T10:00:00Z",
      "uploadedById": "user-uuid-1"
    },
    {
      "id": "media-uuid-2",
      "type": "video",
      "title": "Promotional Video",
      "caption": null,
      "mimeType": "video/mp4",
      "fileSize": 52428800,
      "scheduledPublishAt": "2026-07-10T14:00:00Z",
      "published": false,
      "createdAt": "2026-07-09T09:00:00Z",
      "uploadedById": "user-uuid-1"
    }
  ]
}
```

**Role Restrictions:**
- `staff` — downloads only
- `media_admin`, `business_admin` — full access (upload, delete, schedule)
- `user_full_admin`, `user_creation_admin` — downloads only
- Download-only roles cannot see scheduled media before publish time

#### Upload Media
**Endpoint:** `POST /media/upload`

**Required Role:** `media_admin` or `business_admin`

**Request (multipart/form-data):**
```
files: [file1.jpg, file2.mp4, ...]   (up to 20 files)
titles: ["Title 1", "Title 2"]        (optional, JSON array)
captions: ["Caption 1", null]         (optional, JSON array)
caption: "Shared caption"              (optional, applies to all files)
scheduledPublishAt: "2026-07-10T14:00:00Z"  (optional, ISO datetime; null = publish immediately)
```

**Response (201):**
```json
{
  "data": [
    {
      "id": "media-uuid-1",
      "type": "image",
      "title": "Product Shot",
      "caption": "Beautiful summer collection",
      "scheduledPublishAt": null,
      "published": true
    }
  ]
}
```

**Errors:**
- `400 validation_error` — No files uploaded
- `403 plan_limit` — Media count or storage limit reached
- `413 payload_too_large` — File too large

#### Get Media Details
**Endpoint:** `GET /media/:id`

**Response (200):**
```json
{
  "data": {
    "id": "media-uuid-1",
    "type": "image",
    "title": "Product Shot",
    "caption": "Beautiful summer collection",
    "mimeType": "image/jpeg",
    "fileSize": 1048576,
    "scheduledPublishAt": null,
    "published": true,
    "createdAt": "2026-07-09T10:00:00Z",
    "uploadedById": "user-uuid-1"
  }
}
```

#### Download Media
**Endpoint:** `GET /media/:id/download`

**Description:** Streams the file and records a `download` event for analytics.

**Response:** Binary file stream (e.g., JPEG, MP4)

**Headers:**
```
Content-Type: image/jpeg (or video/mp4, etc.)
Content-Disposition: attachment; filename="ProductShot.jpg"
```

#### Preview Media
**Endpoint:** `GET /media/:id/preview`

**Description:** Display the file without recording an event. Useful for thumbnail previews.

**Response:** Binary file stream

#### Update Media (Title / Caption / Scheduled Publish)
**Endpoint:** `PATCH /media/:id`

**Required Role:** `media_admin` or `business_admin`

**Request:**
```json
{
  "title": "Updated Title",
  "caption": "New caption or null to clear",
  "scheduledPublishAt": "2026-07-10T14:00:00Z"
}
```

**Response (200):**
```json
{
  "data": {
    "id": "media-uuid-1",
    "title": "Updated Title",
    "caption": "New caption or null to clear",
    "scheduledPublishAt": "2026-07-10T14:00:00Z",
    "published": false
  }
}
```

#### Delete Media
**Endpoint:** `DELETE /media/:id`

**Required Role:** `media_admin` or `business_admin`

**Response (200):**
```json
{
  "data": {
    "message": "Media deleted"
  }
}
```

#### Get Media Analytics
**Endpoint:** `GET /media/:id/analytics`

**Required Role:** `media_admin` or `business_admin`

**Response (200):**
```json
{
  "data": {
    "downloads": 42,
    "shares": 15,
    "views": 128
  }
}
```

#### Get Scheduled Media Summary
**Endpoint:** `GET /media/scheduled/summary`

**Required Role:** `media_admin` or `business_admin`

**Response (200):**
```json
{
  "data": {
    "total": 5,
    "images": 3,
    "videos": 2,
    "byDay": [
      {
        "date": "2026-07-10",
        "total": 3,
        "images": 2,
        "videos": 1,
        "items": [
          {
            "id": "media-uuid-1",
            "title": "Product Shot",
            "type": "image",
            "scheduledPublishAt": "2026-07-10T14:00:00Z"
          }
        ]
      }
    ]
  }
}
```

### Users

#### List Users
**Endpoint:** `GET /users`

**Required Role:** `business_admin`, `user_full_admin` (staff users only)

**Response (200):**
```json
{
  "data": [
    {
      "id": "user-uuid-1",
      "name": "Ramesh Kumar",
      "mobileNo": "9876543210",
      "role": "staff",
      "isActive": true,
      "expiresAt": null,
      "city": "Madurai"
    },
    {
      "id": "user-uuid-2",
      "name": "Priya S",
      "mobileNo": "9876543211",
      "role": "staff",
      "isActive": true,
      "expiresAt": "2026-12-31T23:59:59Z",
      "city": "Chennai"
    }
  ]
}
```

#### Create User
**Endpoint:** `POST /users`

**Required Role:** `business_admin`, `user_full_admin`, `user_creation_admin`

**Request:**
```json
{
  "name": "Priya S",
  "mobileNo": "9876543211",
  "password": "welcome123",
  "role": "staff",
  "city": "Chennai",
  "agencyName": "Priya Designs",
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

**Response (201):**
```json
{
  "data": {
    "id": "user-uuid-2",
    "name": "Priya S",
    "mobileNo": "9876543211",
    "role": "staff",
    "isActive": true,
    "expiresAt": "2026-12-31T23:59:59Z"
  }
}
```

**Errors:**
- `400 validation_error` — Missing required fields or invalid format
- `403 plan_limit` — User count limit reached for the plan
- `403 privilege_escalation` — Role escalation not allowed for your role

#### Bulk Import Staff
**Endpoint:** `POST /users/bulk`

**Required Role:** `business_admin`, `user_full_admin`, `user_creation_admin`

**Request:**
```json
{
  "users": [
    {
      "name": "Ramesh Kumar",
      "mobileNo": "9876543210",
      "password": "staff123",
      "city": "Madurai",
      "expiresAt": null
    },
    {
      "name": "Priya S",
      "mobileNo": "9876543211",
      "password": "welcome1",
      "city": "Chennai",
      "expiresAt": "2026-12-31T23:59:59Z"
    }
  ]
}
```

**Response (201):**
```json
{
  "data": {
    "created": 2,
    "skippedCount": 0,
    "skipped": []
  }
}
```

**Response with skips (201):**
```json
{
  "data": {
    "created": 1,
    "skippedCount": 1,
    "skipped": [
      {
        "row": 2,
        "mobileNo": "9876543211",
        "reason": "Mobile number already registered"
      }
    ]
  }
}
```

**Notes:**
- Role is always `staff` (no privilege escalation)
- Duplicates within the file and already-registered mobiles are skipped
- Plan user limit is enforced; overflow rows are skipped
- Max 500 rows per import

#### Get User
**Endpoint:** `GET /users/:id`

**Required Role:** `business_admin`, `user_full_admin` (for staff users)

**Response (200):**
```json
{
  "data": {
    "id": "user-uuid-1",
    "name": "Ramesh Kumar",
    "mobileNo": "9876543210",
    "role": "staff",
    "isActive": true,
    "expiresAt": null,
    "city": "Madurai",
    "agencyName": "Kumar Enterprises",
    "profilePicUrl": "/uploads/user-uuid-1/profile.jpg",
    "companyLogoUrl": "/uploads/user-uuid-1/logo.png",
    "youtube": "",
    "website": "https://ramesh.in",
    "instagram": "@ramesh_kumar",
    "optional1": null,
    "optional2": null
  }
}
```

#### Update User
**Endpoint:** `PUT /users/:id`

**Required Role:** `business_admin`, `user_full_admin` (for staff users)

**Request:**
```json
{
  "name": "Ramesh Kumar Updated",
  "city": "Chennai",
  "agencyName": "Kumar Enterprises",
  "youtube": "https://youtube.com/@ramesh",
  "website": "https://ramesh.in",
  "instagram": "@ramesh_kumar",
  "optional1": "value1",
  "optional2": "value2",
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

**Response (200):**
```json
{
  "data": {
    "id": "user-uuid-1",
    "name": "Ramesh Kumar Updated",
    "role": "staff",
    "isActive": true,
    "city": "Chennai"
  }
}
```

#### Reset User Password
**Endpoint:** `POST /users/:id/reset-password`

**Required Role:** `business_admin`, `user_full_admin` (for staff users)

**Request:**
```json
{
  "newPassword": "newpassword123"
}
```

**Response (200):**
```json
{
  "data": {
    "message": "Password reset successfully"
  }
}
```

#### Delete User
**Endpoint:** `DELETE /users/:id`

**Required Role:** `business_admin`, `user_full_admin` (for staff users only)

**Response (200):**
```json
{
  "data": {
    "message": "User deleted"
  }
}
```

### Profile

#### Get Business Profile
**Endpoint:** `GET /profile`

**Response (200):**
```json
{
  "data": {
    "name": "Kumar Enterprises",
    "agencyName": "Kumar Media",
    "city": "Madurai",
    "website": "https://kumar.in",
    "logoUrl": "/uploads/business-uuid/logo.png",
    "shareMessage": "Check out our latest collection!"
  }
}
```

#### Update Business Profile
**Endpoint:** `PATCH /profile`

**Required Role:** `business_admin`

**Request:**
```json
{
  "name": "Kumar Enterprises Updated",
  "agencyName": "Kumar Media",
  "city": "Chennai",
  "website": "https://kumar-updated.in",
  "shareMessage": "Check out our latest products!"
}
```

**Response (200):**
```json
{
  "data": {
    "name": "Kumar Enterprises Updated",
    "agencyName": "Kumar Media",
    "city": "Chennai",
    "website": "https://kumar-updated.in",
    "logoUrl": "/uploads/business-uuid/logo.png",
    "shareMessage": "Check out our latest products!"
  }
}
```

#### Update User Profile Picture & Logo
**Endpoint:** `POST /profile/upload`

**Request (multipart/form-data):**
```
profilePic: <file>    (optional, JPEG/PNG)
companyLogo: <file>   (optional, JPEG/PNG)
```

**Response (200):**
```json
{
  "data": {
    "profilePicUrl": "/uploads/user-uuid/profile.jpg",
    "companyLogoUrl": "/uploads/business-uuid/logo.png"
  }
}
```

#### Change Own Password
**Endpoint:** `POST /profile/change-password`

**Request:**
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword123"
}
```

**Response (200):**
```json
{
  "data": {
    "message": "Password changed successfully"
  }
}
```

### Analytics

#### Get Business Analytics
**Endpoint:** `GET /analytics`

**Required Role:** `business_admin`, `media_admin`

**Query Parameters:**
- `limit` (optional, default 100): max rows to return
- `offset` (optional, default 0): pagination offset

**Response (200):**
```json
{
  "data": [
    {
      "username": "Ramesh Kumar",
      "mobileNo": "9876543210",
      "city": "Madurai",
      "mediaName": "Product Shot",
      "uploadedDate": "2026-07-08T10:00:00Z",
      "imageShared": 5,
      "imageDownloaded": 12,
      "videoShared": 0,
      "videoDownloaded": 0,
      "appOpenedDate": "2026-07-09T14:30:00Z"
    }
  ]
}
```

### Events

#### Track Event
**Endpoint:** `POST /events`

**Request:**
```json
{
  "mediaId": "media-uuid-1",
  "eventType": "download | share | view | app_open"
}
```

**Response (201):**
```json
{
  "data": {
    "id": "event-uuid-1",
    "eventType": "download",
    "createdAt": "2026-07-09T12:30:00Z"
  }
}
```

---

## Admin Panel API

All endpoints require a valid `Authorization` header with a **super_admin** JWT.

### Authentication

#### Admin Login
**Endpoint:** `POST /auth/admin/login`

**Request:**
```json
{
  "mobileNo": "9876543210",
  "password": "adminpassword"
}
```

**Response (200):**
```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "admin": {
      "id": "admin-uuid-1",
      "name": "Admin User"
    }
  }
}
```

### Subscription Plans

#### List Plans
**Endpoint:** `GET /admin/plans`

**Response (200):**
```json
{
  "data": [
    {
      "id": "plan-uuid-1",
      "name": "Starter",
      "price": "999.00",
      "currency": "INR",
      "billingPeriod": "monthly",
      "maxUsers": 25,
      "maxStorageMb": 5120,
      "maxImages": -1,
      "maxVideos": -1,
      "isActive": true,
      "features": {}
    }
  ]
}
```

**Plan Limit Notes:**
- `-1` = unlimited
- `0` = none allowed
- Positive integer = hard limit

#### Create Plan
**Endpoint:** `POST /admin/plans`

**Request:**
```json
{
  "name": "Premium",
  "price": "2999.00",
  "currency": "INR",
  "billingPeriod": "monthly",
  "maxUsers": 100,
  "maxStorageMb": 51200,
  "maxImages": -1,
  "maxVideos": -1,
  "isActive": true
}
```

**Response (201):**
```json
{
  "data": {
    "id": "plan-uuid-2",
    "name": "Premium",
    "price": "2999.00",
    "currency": "INR",
    "billingPeriod": "monthly",
    "maxUsers": 100,
    "maxStorageMb": 51200,
    "maxImages": -1,
    "maxVideos": -1,
    "isActive": true,
    "features": {}
  }
}
```

#### Update Plan
**Endpoint:** `PUT /admin/plans/:id`

**Request:** (same fields as Create Plan)

**Response (200):**
```json
{
  "data": {
    "id": "plan-uuid-1",
    "name": "Starter Updated",
    "price": "1099.00",
    "currency": "INR",
    "billingPeriod": "monthly",
    "maxUsers": 25,
    "maxStorageMb": 5120,
    "maxImages": -1,
    "maxVideos": -1,
    "isActive": true,
    "features": {}
  }
}
```

#### Deactivate Plan
**Endpoint:** `DELETE /admin/plans/:id`

**Response (200):**
```json
{
  "data": {
    "message": "Plan deactivated"
  }
}
```

### Businesses

#### List Businesses
**Endpoint:** `GET /admin/businesses`

**Query Parameters:**
- `limit` (optional, default 50): max rows
- `offset` (optional, default 0): pagination offset
- `search` (optional): search by name

**Response (200):**
```json
{
  "data": [
    {
      "id": "business-uuid-1",
      "name": "Kumar Enterprises",
      "agencyName": "Kumar Media",
      "city": "Madurai",
      "website": "https://kumar.in",
      "logoUrl": "/uploads/business-uuid-1/logo.png",
      "planId": "plan-uuid-1",
      "planName": "Starter",
      "subscriptionStatus": "active",
      "subscriptionStart": "2026-01-01T00:00:00Z",
      "subscriptionEnd": "2026-12-31T23:59:59Z",
      "isActive": true,
      "userCount": 5,
      "mediaCount": 28,
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

#### Get Business
**Endpoint:** `GET /admin/businesses/:id`

**Response (200):**
```json
{
  "data": {
    "id": "business-uuid-1",
    "name": "Kumar Enterprises",
    "agencyName": "Kumar Media",
    "city": "Madurai",
    "website": "https://kumar.in",
    "logoUrl": "/uploads/business-uuid-1/logo.png",
    "planId": "plan-uuid-1",
    "subscriptionStatus": "active",
    "subscriptionStart": "2026-01-01T00:00:00Z",
    "subscriptionEnd": "2026-12-31T23:59:59Z",
    "isActive": true,
    "users": [
      {
        "id": "user-uuid-1",
        "name": "Ramesh Kumar",
        "mobileNo": "9876543210",
        "role": "business_admin",
        "expiresAt": null
      }
    ]
  }
}
```

#### Create Business
**Endpoint:** `POST /admin/businesses`

**Request:**
```json
{
  "name": "Kumar Enterprises",
  "agencyName": "Kumar Media",
  "city": "Madurai",
  "website": "https://kumar.in",
  "planId": "plan-uuid-1",
  "subscriptionStart": "2026-01-01T00:00:00Z",
  "subscriptionEnd": "2026-12-31T23:59:59Z",
  "subscriptionStatus": "active",
  "businessAdminName": "Ramesh Kumar",
  "businessAdminMobileNo": "9876543210",
  "businessAdminPassword": "securepassword123"
}
```

**Response (201):**
```json
{
  "data": {
    "id": "business-uuid-1",
    "name": "Kumar Enterprises",
    "planId": "plan-uuid-1",
    "subscriptionStatus": "active"
  }
}
```

#### Update Business
**Endpoint:** `PUT /admin/businesses/:id`

**Request:**
```json
{
  "name": "Kumar Enterprises Updated",
  "planId": "plan-uuid-2",
  "subscriptionStatus": "suspended",
  "subscriptionEnd": "2026-12-31T23:59:59Z",
  "isActive": true
}
```

**Response (200):**
```json
{
  "data": {
    "id": "business-uuid-1",
    "name": "Kumar Enterprises Updated",
    "planId": "plan-uuid-2"
  }
}
```

#### Deactivate Business
**Endpoint:** `DELETE /admin/businesses/:id`

**Response (200):**
```json
{
  "data": {
    "message": "Business deactivated"
  }
}
```

### Admin Users

#### List All Users (Across Businesses)
**Endpoint:** `GET /admin/users`

**Query Parameters:**
- `businessId` (optional): filter by business
- `limit` (optional, default 50): max rows
- `offset` (optional, default 0): pagination offset

**Response (200):**
```json
{
  "data": [
    {
      "id": "user-uuid-1",
      "name": "Ramesh Kumar",
      "mobileNo": "9876543210",
      "role": "business_admin",
      "businessId": "business-uuid-1",
      "businessName": "Kumar Enterprises",
      "expiresAt": null,
      "isActive": true
    }
  ]
}
```

#### Get User Details
**Endpoint:** `GET /admin/users/:id`

**Response (200):**
```json
{
  "data": {
    "id": "user-uuid-1",
    "name": "Ramesh Kumar",
    "mobileNo": "9876543210",
    "role": "business_admin",
    "businessId": "business-uuid-1",
    "city": "Madurai",
    "expiresAt": null,
    "isActive": true,
    "createdAt": "2026-01-01T00:00:00Z"
  }
}
```

#### Set User Expiry
**Endpoint:** `PATCH /admin/users/:id/expiry`

**Request:**
```json
{
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

**Response (200):**
```json
{
  "data": {
    "id": "user-uuid-1",
    "expiresAt": "2026-12-31T23:59:59Z"
  }
}
```

### Admin Overview

#### Get Platform Overview
**Endpoint:** `GET /admin/overview`

**Response (200):**
```json
{
  "data": {
    "totalBusinesses": 15,
    "activeBusinesses": 14,
    "totalUsers": 87,
    "totalMediaItems": 342,
    "storageUsedMb": 12548,
    "recentBusinesses": [
      {
        "id": "business-uuid-1",
        "name": "Kumar Enterprises",
        "createdAt": "2026-07-08T10:00:00Z"
      }
    ]
  }
}
```

---

## Legacy Mobile API

**Base URL:** `https://portal.pixsignpro.in/pro/api`

All legacy endpoints use query parameter authentication:
```
GET /pro/api/endpoint.php?api_key=<LEGACY_API_KEY>&business_id=<int>&user_id=<int>
```

All responses are HTTP 200 with body:
```json
{
  "status_code": 0,
  "Status": "success",
  "message": "...",
  ...
}
```

**Note:** `Status` is capital-S (different from portal API). Integer IDs are used (surrogate `legacy_id` field); UUIDs are never exposed.

### Mobile Login
**Endpoint:** `POST /pro/api/login.php`

**Request:**
```json
{
  "mobile_no": "9876543210",
  "password": "yourpassword"
}
```

**Response (200):**
```json
{
  "status_code": 0,
  "Status": "success",
  "business_id": 1,
  "user_id": 5,
  "name": "Ramesh Kumar",
  "role": "bizadmin",
  "profile_pic": "https://portal.pixsignpro.in/uploads/550e8400.../profile.jpg",
  "company_logo": "https://portal.pixsignpro.in/uploads/550e8400.../logo.png",
  "share_message": "Check out our latest products!"
}
```

### View Images / Videos
**Endpoint:** `GET /pro/api/view-images.php` or `view-videos.php`

**Query Parameters:**
- `api_key`: Static API key
- `business_id`: Business integer ID
- `user_id`: User integer ID

**Response (200):**
```json
{
  "status_code": 0,
  "Status": "success",
  "data": [
    {
      "id": 1,
      "title": "Product Shot",
      "image_url": "https://portal.pixsignpro.in/uploads/550e8400.../image.jpg",
      "share_message": "Beautiful summer collection",
      "uploaded_date": "2026-07-09",
      "uploaded_by": "Ramesh Kumar"
    }
  ]
}
```

### Upload Image / Video
**Endpoint:** `POST /pro/api/upload-image.php` or `upload-video.php`

**Request (multipart/form-data):**
```
api_key: <static_key>
business_id: 1
user_id: 5
image/video: <file>
title: "Product Shot"
share_message: "Beautiful summer collection"
```

**Response (200):**
```json
{
  "status_code": 0,
  "Status": "success",
  "id": 1,
  "title": "Product Shot",
  "image_url": "https://portal.pixsignpro.in/uploads/550e8400.../image.jpg"
}
```

### User Profile
**Endpoint:** `GET /pro/api/user_profile.php`

**Query Parameters:**
- `api_key`: Static API key
- `business_id`: Business integer ID
- `user_id`: User integer ID

**Response (200):**
```json
{
  "status_code": 0,
  "Status": "success",
  "name": "Ramesh Kumar",
  "mobile_no": "9876543210",
  "agency_name": "Kumar Enterprises",
  "city": "Madurai",
  "profile_pic": "https://portal.pixsignpro.in/uploads/550e8400.../profile.jpg",
  "company_logo": "https://portal.pixsignpro.in/uploads/550e8400.../logo.png",
  "youtube": "https://youtube.com/@ramesh",
  "website": "https://ramesh.in",
  "instagram": "@ramesh_kumar",
  "share_message": "Check out our latest products!"
}
```

### Analytics
**Endpoint:** `GET /pro/api/analytics.php`

**Query Parameters:**
- `api_key`: Static API key
- `business_id`: Business integer ID
- `user_id`: User integer ID (optional; admin sees all)

**Response (200):**
```json
{
  "status_code": 0,
  "Status": "success",
  "data": [
    {
      "username": "Ramesh Kumar",
      "mobile_no": "9876543210",
      "city": "Madurai",
      "media_name": "Product Shot",
      "uploaded_date": "2026-07-08",
      "image_shared": 5,
      "image_downloaded": 12,
      "video_shared": 0,
      "video_downloaded": 0,
      "app_opened_date": "2026-07-09",
      "date": "2026-07-09"
    }
  ]
}
```

---

## Error Codes

All errors follow the format:
```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable description"
  }
}
```

| Code | Status | Description |
|------|--------|-------------|
| `validation_error` | 400 | Request validation failed (missing/invalid fields) |
| `invalid_credentials` | 401 | Login failed — wrong mobile or password |
| `unauthorized` | 401 | Missing or invalid JWT token |
| `account_disabled` | 403 | User account has been disabled |
| `account_expired` | 403 | User account has expired |
| `subscription_inactive` | 403 | Business subscription is inactive |
| `subscription_expired` | 403 | Business subscription has expired |
| `privilege_escalation` | 403 | Role assignment not allowed for your role |
| `plan_limit` | 403 | Plan user/storage/media limit reached |
| `not_found` | 404 | Resource not found |
| `storage_limit` | 403 | Storage limit exceeded |
| `server_error` | 500 | Unexpected server error |

---

## Roles & Permissions

### Business Roles

| Role | Users | Media | Analytics | Profile |
|------|-------|-------|-----------|---------|
| **staff** | Download only | Download only | ❌ | View own |
| **media_admin** | ❌ | Upload, delete, schedule | ✅ | Edit own |
| **user_creation_admin** | Create staff only | Download only | ❌ | Edit own |
| **user_full_admin** | List/manage staff | Download only | ❌ | Edit own |
| **business_admin** | Full CRUD | Upload, delete, schedule | ✅ | Edit all |

### Platform Roles

| Role | Businesses | Plans | Users | Analytics |
|------|------------|-------|-------|-----------|
| **super_admin** | Full CRUD | Full CRUD | List/manage all | ✅ |

---

## Rate Limiting & Quotas

- **Media upload**: Max 20 files per request, 550 MB total
- **Bulk user import**: Max 500 rows per request
- **Plan limits**: Enforced on a per-business basis (configurable via admin panel)

---

## Appendix: Example Workflows

### Workflow 1: Business User Uploads an Image

1. **Authenticate:** `POST /auth/login` with mobile + password
2. **Upload:** `POST /media/upload` with image file + optional title/caption
3. **Check quota:** See storage used in next upload attempt or via scheduled summary
4. **Download:** Staff user hits `GET /media/:id/download` (records event)

### Workflow 2: Admin Creates a Business & First User

1. **Admin login:** `POST /auth/admin/login`
2. **Create business:** `POST /admin/businesses` with business info, plan, and first admin's details
3. **Business admin login:** `POST /auth/login` with the created admin's mobile + password
4. **Create staff:** `POST /users` or `POST /users/bulk` to add team members

### Workflow 3: Mobile App Tracks Downloads

1. **Mobile login:** `POST /pro/api/login.php`
2. **Download file:** `GET /pro/api/view-images.php` (list) → fetch from image_url
3. **Track event:** `POST /events` with `eventType: "download"` and mediaId

---

**For questions or integration support, contact the development team.**

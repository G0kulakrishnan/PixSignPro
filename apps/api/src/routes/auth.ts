import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { withSystem, withTenant } from '@pixsignpro/db';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { requireAuth } from '../middleware/auth';
import { ok, err } from '../lib/response';
import { config } from '../config';

export const authRouter = Router();

const loginSchema = z.object({
  mobileNo: z.string().min(1),
  password: z.string().min(1),
});

/**
 * POST /auth/login
 * Login by mobile number + password (globally unique mobile).
 * Enforces subscription lock: expired/suspended businesses are denied access.
 */
authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', 'mobileNo and password are required');
    return;
  }

  const { mobileNo, password } = parsed.data;

  try {
    // mobile_no is globally unique — look up the user across all tenants via bypass path.
    const user = await withSystem((tx) =>
      tx.user.findUnique({
        where: { mobileNo },
        include: { business: true },
      }),
    );

    // Use constant-time compare even when user not found to prevent timing attacks.
    const dummyHash = '$2a$12$invalidhashfortimingatk';
    const passwordMatch = await bcrypt.compare(
      password,
      user?.passwordHash ?? dummyHash,
    );

    if (!user || !passwordMatch) {
      err(res, 401, 'invalid_credentials', 'Invalid mobile number or password');
      return;
    }

    if (!user.isActive) {
      err(res, 403, 'account_disabled', 'Your account has been disabled');
      return;
    }

    // Subscription lock — expired or suspended businesses cannot log in.
    const { business } = user;
    if (!business.isActive || business.subscriptionStatus !== 'active') {
      err(res, 403, 'subscription_inactive', 'Business subscription is inactive or expired');
      return;
    }
    if (business.subscriptionEnd && business.subscriptionEnd < new Date()) {
      err(res, 403, 'subscription_expired', 'Business subscription has expired');
      return;
    }

    // Update last app opened timestamp (scoped to tenant).
    await withTenant(user.businessId, (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { lastAppOpenedAt: new Date() },
      }),
    );

    const accessToken = signAccessToken({
      sub: user.id,
      businessId: user.businessId,
      role: user.role,
    });
    const refreshToken = signRefreshToken(user.id);

    ok(res, {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        businessId: user.businessId,
        businessName: business.name,
      },
    });
  } catch (e) {
    console.error('[auth/login]', e);
    err(res, 500, 'server_error', 'An unexpected error occurred');
  }
});

/**
 * POST /auth/refresh
 * Exchange a valid refresh token for a new access token.
 */
authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    err(res, 400, 'validation_error', 'refreshToken is required');
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    if (payload.type !== 'refresh') throw new Error('wrong type');

    const user = await withSystem((tx) =>
      tx.user.findUnique({
        where: { id: payload.sub },
        include: { business: true },
      }),
    );

    if (!user || !user.isActive) {
      err(res, 401, 'unauthorized', 'User not found or disabled');
      return;
    }

    if (!user.business.isActive || user.business.subscriptionStatus !== 'active') {
      err(res, 403, 'subscription_inactive', 'Business subscription is inactive or expired');
      return;
    }

    const accessToken = signAccessToken({
      sub: user.id,
      businessId: user.businessId,
      role: user.role,
    });

    ok(res, { accessToken });
  } catch {
    err(res, 401, 'unauthorized', 'Invalid or expired refresh token');
  }
});

/**
 * POST /auth/logout
 * Client-side token discard. Stateless JWT — just acknowledge.
 * (Token blocklist can be added in Phase 7 if needed.)
 */
authRouter.post('/logout', requireAuth, (_req, res) => {
  ok(res, { message: 'Logged out successfully' });
});

/**
 * GET /auth/me
 * Returns the authenticated user's profile.
 */
authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await withTenant(req.user!.businessId, (tx) =>
      tx.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          name: true,
          mobileNo: true,
          role: true,
          businessId: true,
          profilePicUrl: true,
          companyLogoUrl: true,
          agencyName: true,
          city: true,
          youtube: true,
          website: true,
          instagram: true,
          optional1: true,
          optional2: true,
          lastAppOpenedAt: true,
          business: { select: { name: true, website: true } },
        },
      }),
    );

    if (!user) {
      err(res, 404, 'not_found', 'User not found');
      return;
    }

    ok(res, user);
  } catch (e) {
    console.error('[auth/me]', e);
    err(res, 500, 'server_error', 'An unexpected error occurred');
  }
});

/**
 * POST /auth/admin/login
 * Super admin login — issues a super_admin-typed JWT.
 */
authRouter.post('/admin/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    err(res, 400, 'validation_error', 'mobileNo and password are required');
    return;
  }

  const { mobileNo, password } = parsed.data;

  try {
    const admin = await withSystem((tx) =>
      tx.superAdmin.findUnique({ where: { mobileNo } }),
    );

    const dummyHash = '$2a$12$invalidhashfortimingatk';
    const passwordMatch = await bcrypt.compare(password, admin?.passwordHash ?? dummyHash);

    if (!admin || !passwordMatch || !admin.isActive) {
      err(res, 401, 'invalid_credentials', 'Invalid credentials');
      return;
    }

    const token = jwt.sign(
      { sub: admin.id, type: 'super_admin' },
      config.jwt.accessSecret,
      { expiresIn: '8h' },
    );

    ok(res, { accessToken: token, admin: { id: admin.id, name: admin.name } });
  } catch (e) {
    console.error('[auth/admin/login]', e);
    err(res, 500, 'server_error', 'An unexpected error occurred');
  }
});

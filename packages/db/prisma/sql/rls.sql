-- PixSign Pro — Row-Level Security policies
-- Run AFTER `prisma migrate` creates/updates the tables (idempotent).
--
-- Per-request context (set inside the request transaction by the app):
--   SET LOCAL app.current_business_id = '<uuid>';   -- normal tenant path
--   SET LOCAL app.bypass_rls          = 'on';        -- super_admin / system path ONLY
--
-- Design notes:
--   * FORCE ROW LEVEL SECURITY makes policies apply even to the table owner
--     (the `pixsignpro` role owns these tables), so ownership can't leak data.
--   * current_setting(..., true) returns NULL when unset  => "= NULL" is never true
--     => DEFAULT DENY when no tenant context is established.
--   * The app connects as a NON-superuser role; superusers would bypass RLS.

-- ============================================================================
-- Tenant table: businesses  (row is the tenant itself)
-- ============================================================================
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS businesses_isolation ON businesses;
CREATE POLICY businesses_isolation ON businesses
  USING (
    id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );

-- ============================================================================
-- Tenant table: users
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_isolation ON users;
CREATE POLICY users_isolation ON users
  USING (
    business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );

-- ============================================================================
-- Tenant table: media
-- ============================================================================
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE media FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS media_isolation ON media;
CREATE POLICY media_isolation ON media
  USING (
    business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );

-- ============================================================================
-- Tenant table: media_events
-- ============================================================================
ALTER TABLE media_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS media_events_isolation ON media_events;
CREATE POLICY media_events_isolation ON media_events
  USING (
    business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );

-- ============================================================================
-- Tenant table: fcm_tokens
-- ============================================================================
ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE fcm_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fcm_tokens_isolation ON fcm_tokens;
CREATE POLICY fcm_tokens_isolation ON fcm_tokens
  USING (
    business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );

-- ============================================================================
-- Platform table: subscription_plans
--   Readable by any authenticated tenant (plan catalog); writable only via bypass.
-- ============================================================================
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plans_read ON subscription_plans;
CREATE POLICY plans_read ON subscription_plans
  FOR SELECT USING (true);
DROP POLICY IF EXISTS plans_write ON subscription_plans;
CREATE POLICY plans_write ON subscription_plans
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- ============================================================================
-- Platform table: super_admins
--   Never visible to tenants; only the bypass (super_admin/system) path.
-- ============================================================================
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_admins_bypass_only ON super_admins;
CREATE POLICY super_admins_bypass_only ON super_admins
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

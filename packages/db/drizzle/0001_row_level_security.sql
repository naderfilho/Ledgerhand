-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Tenant isolation is enforced by Postgres, not by the application. Every
-- business table gets a policy comparing its `tenant_id` against
-- `app.tenant_id`, a setting the unit of work writes at the start of each
-- transaction with `set_config(..., true)` so it dies with the transaction and
-- cannot leak through a pooled connection.
--
-- Three details matter, and each is the reason a real system fails this:
--
--   1. The application connects as `ledgerhand_app`, which is NOT the owner of
--      these tables and does NOT have BYPASSRLS. A table owner ignores its own
--      policies, so an application running as the owner would be unprotected
--      while looking protected.
--
--   2. FORCE ROW LEVEL SECURITY is applied as well, so even the owner is
--      subject to the policies. This is what stops a migration script or a
--      careless psql session from being the exception.
--
--   3. `nullif(current_setting('app.tenant_id', true), '')` and not just
--      `current_setting(..., true)`. The missing_ok form returns NULL only
--      until the setting has been assigned once on that connection; after a
--      transaction that used SET LOCAL ends, Postgres resets it to the EMPTY
--      STRING, and `''::uuid` raises 22P02 instead of comparing to NULL. On a
--      pooled connection that turns the second unscoped query into a 500
--      rather than an empty result. Wrapping it in nullif keeps the failure
--      closed AND quiet: the predicate is NULL, so no rows come back.
--
-- One consequence to be aware of: signing in cannot know the tenant yet, so
-- the credential lookup in `apps/web` runs on a separate, narrowly scoped
-- connection rather than on the application pool. That is deliberate -- adding
-- an "anyone may read users" policy here would undo the isolation for the one
-- table that holds password hashes.
--
-- See docs/adr/0004-tenant-isolation.md.

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerhand_app') THEN
    CREATE ROLE ledgerhand_app LOGIN PASSWORD 'ledgerhand_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO ledgerhand_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ledgerhand_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledgerhand_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ledgerhand_app;
--> statement-breakpoint

-- The application must never be able to rewrite history. Domain events, stock
-- movements and settlements are append-only; a correction is a new row.
REVOKE UPDATE, DELETE ON domain_events FROM ledgerhand_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON stock_movements FROM ledgerhand_app;
--> statement-breakpoint
REVOKE DELETE ON settlements FROM ledgerhand_app;
--> statement-breakpoint

DO $$
DECLARE
  target text;
  tables text[] := ARRAY[
    'users',
    'products',
    'customers',
    'suppliers',
    'stock_balances',
    'stock_movements',
    'sales_orders',
    'sales_order_items',
    'purchase_orders',
    'purchase_order_items',
    'fiscal_documents',
    'receivables',
    'payables',
    'settlements',
    'cash_sessions',
    'number_sequences',
    'domain_events',
    'idempotency_records'
  ];
BEGIN
  FOREACH target IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', target);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      target
    );
  END LOOP;
END
$$;
--> statement-breakpoint

-- `tenants` is keyed by `id` rather than `tenant_id`, so it gets its own policy.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON tenants;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenants
  USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.tenant_id', true), '')::uuid);

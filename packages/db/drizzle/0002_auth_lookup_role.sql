-- ---------------------------------------------------------------------------
-- The sign-in lookup
-- ---------------------------------------------------------------------------
-- Authentication has a bootstrapping problem: the tenant is not known until
-- the user has been identified, so the credential lookup cannot run under
-- `app.tenant_id`. Under the policy from migration 0001, that query returns
-- nothing and nobody can ever sign in.
--
-- The wrong fixes are tempting and both weaken the system:
--
--   * run the lookup as the owner -- which switches row level security off
--     entirely for a connection the web process holds open;
--   * add "or the tenant is unset" to the policy on `users` -- which makes the
--     one table holding password hashes readable from any unscoped query.
--
-- Instead: a third role that can do exactly one thing. Policies are permissive
-- and OR together, and `TO ledgerhand_auth` scopes this one to that role, so
-- `ledgerhand_app` still sees only its own tenant's users.

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerhand_auth') THEN
    CREATE ROLE ledgerhand_auth LOGIN PASSWORD 'ledgerhand_auth' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO ledgerhand_auth;
--> statement-breakpoint

-- Read-only, and only this table. No INSERT, no UPDATE, no other relation.
GRANT SELECT ON users TO ledgerhand_auth;
--> statement-breakpoint
GRANT SELECT ON tenants TO ledgerhand_auth;
--> statement-breakpoint

DROP POLICY IF EXISTS auth_lookup_users ON users;
--> statement-breakpoint
CREATE POLICY auth_lookup_users ON users FOR SELECT TO ledgerhand_auth USING (true);
--> statement-breakpoint
DROP POLICY IF EXISTS auth_lookup_tenants ON tenants;
--> statement-breakpoint
CREATE POLICY auth_lookup_tenants ON tenants FOR SELECT TO ledgerhand_auth USING (true);

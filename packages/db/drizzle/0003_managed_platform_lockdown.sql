-- ---------------------------------------------------------------------------
-- Locking the schema away from the platform's own HTTP API
-- ---------------------------------------------------------------------------
-- Running on a managed Postgres (Supabase and its equivalents) adds a party
-- this schema was never designed for: a PostgREST instance on the public
-- internet that serves the `public` schema to two built-in roles, `anon` and
-- `authenticated`, using a key that is meant to be published in a browser.
--
-- Those roles are granted on new tables by the platform's own default
-- privileges, so every table in migration 0000 is exposed the moment it is
-- created. Row level security still holds -- no policy names those roles, so
-- they select nothing -- but that is one mechanism deep, and the whole point
-- of migration 0001 is that isolation should not rest on a single check.
--
-- `service_role` matters more: on that platform it carries BYPASSRLS, which is
-- exactly the thing migration 0001 exists to deny. Nothing here ever speaks to
-- PostgREST, so all three lose their access, and the default privileges lose
-- it for tables added later.
--
-- On a plain Postgres none of these roles exist and this migration does
-- nothing, which keeps the local and the deployed schema identical.

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RETURN;
  END IF;

  EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role';
  EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role';
  EXECUTE 'REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated, service_role';
  EXECUTE 'REVOKE USAGE ON SCHEMA public FROM anon, authenticated, service_role';

  -- Tables created after this migration must not reappear on the API.
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role';
END
$$;

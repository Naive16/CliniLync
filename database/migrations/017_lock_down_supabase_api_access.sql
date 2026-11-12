-- Migration: 017_lock_down_supabase_api_access.sql
-- Security boundary:
-- Clinilync authorizes users and organization membership in its server-side
-- middleware. Browser clients must never query public tables directly.
-- The dedicated API database role is the only non-owner application role and
-- intentionally BYPASSRLS so the established server-side tenant checks remain
-- authoritative. Never expose this role's credentials to browser code.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clinilync_app') THEN
    EXECUTE 'CREATE ROLE clinilync_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO clinilync_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO clinilync_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO clinilync_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO clinilync_app;

-- Remove direct Data API access. RLS remains enabled with no permissive
-- policies, so anon/authenticated have no route to clinical data.
REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', item.schemaname, item.tablename);
  END LOOP;
END
$$;

-- Keep future migrations created by the postgres migration owner safe by
-- default while granting the server-only API role the minimum CRUD access.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clinilync_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO clinilync_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO clinilync_app;

INSERT INTO public._schema_migrations (name)
VALUES ('017_lock_down_supabase_api_access.sql')
ON CONFLICT (name) DO NOTHING;

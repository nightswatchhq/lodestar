-- Give every object in `public` to the application role.
--
--   sudo -u postgres psql -p 5433 -d lodestar -f scripts/fix-ownership.sql
--
-- Two things create tables owned by `postgres` rather than by `lodestar`, and the application
-- connects as `lodestar`:
--
--   1. A migration run as the superuser. That is how `clickthrough_events` ended up owned by
--      `postgres` with INSERT and SELECT both denied, so every click was refused silently for as
--      long as the table existed and the table was still empty when it was found (#113).
--
--   2. **A restore.** `pg_restore --no-owner` gives every restored object to the user doing the
--      restore, and the documented recipe in README.md restores as `postgres`. So a recovery from
--      one of the nightly dumps does not reproduce that fault on one table, it reproduces it on all
--      of them, and the application comes back up unable to read or write anything. Run this
--      immediately after any restore, before pointing the app at the result.
--
-- Idempotent, and safe to run at any time. Objects already owned by `lodestar` are skipped, so the
-- output tells you what was actually wrong.

-- The role name is written out at each use rather than held in a psql variable, because psql does
-- not substitute inside the dollar-quoted body below and a variable that silently fails to apply in
-- half the file is worse than repeating a word.

DO $$
DECLARE
  target CONSTANT name := 'lodestar';
  r      record;
  n      integer := 0;
BEGIN
  -- Tables and sequences are what the application touches. Views are included because a view owned
  -- by the wrong role fails on read in exactly the same quiet way.
  FOR r IN
    SELECT 'TABLE'    AS kind, schemaname AS s, tablename    AS o FROM pg_tables    WHERE schemaname = 'public' AND tableowner <> target
    UNION ALL
    SELECT 'SEQUENCE',          schemaname,      sequencename       FROM pg_sequences WHERE schemaname = 'public' AND sequenceowner <> target
    UNION ALL
    SELECT 'VIEW',              schemaname,      viewname           FROM pg_views     WHERE schemaname = 'public' AND viewowner <> target
  LOOP
    EXECUTE format('ALTER %s %I.%I OWNER TO %I', r.kind, r.s, r.o, target);
    RAISE NOTICE 'gave % %.% to %', lower(r.kind), r.s, r.o, target;
    n := n + 1;
  END LOOP;

  IF n = 0 THEN
    RAISE NOTICE 'nothing to do: everything in public is already owned by %', target;
  ELSE
    RAISE NOTICE 'reassigned % object(s)', n;
  END IF;
END $$;

-- What the application can actually do, which is the question that matters rather than who owns
-- what. Anything false here is a table the app will fail on.
SELECT tablename,
       has_table_privilege('lodestar', 'public.' || quote_ident(tablename), 'INSERT') AS ins,
       has_table_privilege('lodestar', 'public.' || quote_ident(tablename), 'SELECT') AS sel
FROM pg_tables
WHERE schemaname = 'public'
  AND NOT (has_table_privilege('lodestar', 'public.' || quote_ident(tablename), 'INSERT')
       AND has_table_privilege('lodestar', 'public.' || quote_ident(tablename), 'SELECT'))
ORDER BY tablename;

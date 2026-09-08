-- Tier 1 Monitoring: cron_runs history table
-- Tracks every cron execution with timing, row counts, and errors.

CREATE TABLE IF NOT EXISTS cron_runs (
  id            SERIAL PRIMARY KEY,
  step          TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  duration_ms   INTEGER NOT NULL,
  rows_affected INTEGER,
  success       BOOLEAN NOT NULL,
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_step_started ON cron_runs (step, started_at DESC);

-- Ownership. The application connects as `lodestar`; a migration run as the superuser creates
-- tables owned by `postgres`, and every statement from the app then fails with 42501 - silently, in
-- the case of a fire-and-forget writer (#113). Idempotent, and a no-op when already correct.
ALTER TABLE cron_runs OWNER TO lodestar;

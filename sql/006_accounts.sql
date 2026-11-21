BEGIN;
CREATE TABLE IF NOT EXISTS cfo_users (
    id uuid PRIMARY KEY,
    email text NOT NULL UNIQUE,
    first_name text NOT NULL,
    last_name text NOT NULL,
    password_hash text NOT NULL,
    verified boolean NOT NULL DEFAULT false,
    workspace_id uuid UNIQUE REFERENCES web_workspaces(id)
);
CREATE TABLE IF NOT EXISTS cfo_sessions (
    digest text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES cfo_users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_owner ON cfo_sessions(user_id);
CREATE TABLE IF NOT EXISTS cfo_mail_codes (
    digest text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES cfo_users(id) ON DELETE CASCADE,
    purpose text NOT NULL CHECK (purpose IN ('activate','reset','email')),
    destination text NOT NULL,
    expires_at timestamptz NOT NULL,
    UNIQUE(user_id, purpose)
);
CREATE TABLE IF NOT EXISTS cfo_auth_limits (
    bucket text PRIMARY KEY,
    started_at timestamptz NOT NULL,
    attempts integer NOT NULL
);
COMMIT;

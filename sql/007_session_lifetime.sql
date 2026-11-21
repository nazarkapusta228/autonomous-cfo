BEGIN;
ALTER TABLE cfo_sessions ADD COLUMN IF NOT EXISTS issued_at timestamptz;
-- Previous sessions had exactly 30 days from sign-in and no sliding renewal.
UPDATE cfo_sessions
SET issued_at = expires_at - interval '30 days',
    expires_at = expires_at - interval '30 days' + interval '168 hours'
WHERE issued_at IS NULL;
ALTER TABLE cfo_sessions ALTER COLUMN issued_at SET DEFAULT now();
ALTER TABLE cfo_sessions ALTER COLUMN issued_at SET NOT NULL;
COMMIT;

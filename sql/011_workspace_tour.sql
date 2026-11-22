ALTER TABLE cfo_users ADD COLUMN IF NOT EXISTS tour_pending boolean NOT NULL DEFAULT false;

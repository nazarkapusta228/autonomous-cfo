ALTER TABLE web_workspaces ADD COLUMN IF NOT EXISTS planned_edits jsonb NOT NULL DEFAULT '{}';

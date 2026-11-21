CREATE TABLE IF NOT EXISTS web_data_files (
    workspace_id uuid NOT NULL REFERENCES web_workspaces(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('statement','plan','invoices')),
    filename text NOT NULL,
    original bytea NOT NULL,
    PRIMARY KEY (workspace_id, kind)
);

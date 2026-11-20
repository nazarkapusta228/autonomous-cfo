BEGIN;
ALTER TABLE statement_imports ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT '';
ALTER TABLE statement_imports DROP CONSTRAINT IF EXISTS statement_imports_content_sha256_key;
CREATE UNIQUE INDEX IF NOT EXISTS scoped_statement ON statement_imports(scope, content_sha256);
ALTER TABLE category_rules ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT '';
ALTER TABLE category_rules DROP CONSTRAINT IF EXISTS category_rules_pkey;
ALTER TABLE category_rules ADD PRIMARY KEY (scope, account, kind, effective_after);

CREATE TABLE IF NOT EXISTS web_workspaces (
    id uuid PRIMARY KEY,
    revision uuid NOT NULL,
    import_id bigint NOT NULL REFERENCES statement_imports(id),
    statement bytea NOT NULL,
    plan bytea NOT NULL,
    invoices bytea,
    settings jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS web_revisions (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL REFERENCES web_workspaces(id),
    liquidity_request uuid UNIQUE NOT NULL,
    investment_request uuid UNIQUE NOT NULL
);
CREATE INDEX IF NOT EXISTS web_revisions_workspace ON web_revisions(workspace_id);
CREATE TABLE IF NOT EXISTS web_simulations (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    revision uuid NOT NULL REFERENCES web_revisions(id),
    kind text NOT NULL,
    basis jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (revision,kind,basis)
);
COMMIT;

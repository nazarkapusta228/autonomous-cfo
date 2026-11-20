BEGIN;
CREATE TABLE IF NOT EXISTS category_overrides (
    import_id bigint NOT NULL,
    source_row integer NOT NULL,
    category text NOT NULL CHECK (length(trim(category)) > 0),
    PRIMARY KEY (import_id, source_row),
    FOREIGN KEY (import_id,source_row) REFERENCES transactions(import_id,source_row)
);
CREATE TABLE IF NOT EXISTS category_rules (
    account text NOT NULL,
    kind text NOT NULL,
    effective_after date NOT NULL,
    category text NOT NULL CHECK (length(trim(category)) > 0),
    PRIMARY KEY (account,kind,effective_after)
);
CREATE TABLE IF NOT EXISTS invoice_match_decisions (
    import_id bigint NOT NULL REFERENCES statement_imports(id),
    invoice_digest text NOT NULL,
    as_of date NOT NULL,
    invoice_id text NOT NULL,
    source_row integer,
    PRIMARY KEY (import_id,invoice_digest,as_of,invoice_id),
    UNIQUE (import_id,invoice_digest,as_of,source_row),
    FOREIGN KEY (import_id,source_row) REFERENCES transactions(import_id,source_row)
);
COMMIT;

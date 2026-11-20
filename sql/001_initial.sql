BEGIN;
CREATE TABLE IF NOT EXISTS statement_imports (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    content_sha256 text NOT NULL UNIQUE,
    imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS transactions (
    import_id bigint NOT NULL REFERENCES statement_imports(id),
    source_row integer NOT NULL,
    account text NOT NULL,
    booked_on date NOT NULL,
    value_on date NOT NULL,
    kind text NOT NULL,
    reference text NOT NULL,
    amount numeric(18,2) NOT NULL,
    currency text NOT NULL CHECK (currency IN ('EUR', 'CHF')),
    amount_eur numeric(18,2) NOT NULL,
    PRIMARY KEY (import_id, source_row)
);
CREATE INDEX IF NOT EXISTS transactions_value_date ON transactions(value_on);
CREATE TABLE IF NOT EXISTS recommendations (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL,
    scenario jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'simulated'))
);
CREATE TABLE IF NOT EXISTS audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recommendation_id bigint NOT NULL REFERENCES recommendations(id),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor text NOT NULL,
    event text NOT NULL,
    details jsonb NOT NULL
);
COMMIT;

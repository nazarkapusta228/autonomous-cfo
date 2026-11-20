BEGIN;

ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS agent text
    CHECK (agent IN ('liquidity', 'investment'));
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS recommendations_request_id ON recommendations(request_id);
ALTER TABLE recommendations DROP CONSTRAINT IF EXISTS recommendations_status_check;
ALTER TABLE recommendations ADD CONSTRAINT recommendations_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'simulated', 'no_action'));

CREATE OR REPLACE FUNCTION protect_recommendation_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
        RAISE EXCEPTION 'The forecast and recommendation snapshot is immutable';
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER recommendation_snapshot
    BEFORE UPDATE ON recommendations
    FOR EACH ROW EXECUTE FUNCTION protect_recommendation_snapshot();

CREATE TABLE IF NOT EXISTS simulated_applications (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recommendation_id bigint NOT NULL UNIQUE REFERENCES recommendations(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    action text NOT NULL CHECK (action IN ('propose_credit', 'propose_investment')),
    amount_eur numeric(18,2) NOT NULL CHECK (amount_eur > 0),
    planned_on date NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_by_recommendation ON audit_events(recommendation_id, id);
COMMIT;

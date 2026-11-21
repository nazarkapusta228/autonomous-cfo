BEGIN;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_currency_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_currency_check CHECK (currency ~ '^[A-Z]{3}$');
COMMIT;

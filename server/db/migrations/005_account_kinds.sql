-- Expand account kinds: bank, cash, credit, investment (migrate legacy regular → bank).

ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_kind_check;

ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_credit_fields_check;

UPDATE wallet_accounts
SET kind = 'bank'
WHERE kind = 'regular';

ALTER TABLE wallet_accounts
  ALTER COLUMN kind SET DEFAULT 'bank';

ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_kind_check
  CHECK (kind IN ('bank', 'credit', 'cash', 'investment'));

ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_credit_fields_check
  CHECK (
    (kind IN ('bank', 'cash', 'investment')
      AND credit_limit IS NULL
      AND linked_account_id IS NULL
      AND grace_months IS NULL)
    OR
    (kind = 'credit'
      AND credit_limit IS NOT NULL
      AND credit_limit > 0
      AND grace_months IS NOT NULL
      AND grace_months >= 1
      AND grace_months <= 12)
  );

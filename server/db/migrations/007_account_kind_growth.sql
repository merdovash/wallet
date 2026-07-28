-- Account kinds: operational, fund, deposit, investment, cash, credit.
-- Legacy bank → operational.

ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_kind_check;

ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_credit_fields_check;

UPDATE wallet_accounts
SET kind = 'operational'
WHERE kind IN ('bank', 'regular');

ALTER TABLE wallet_accounts
  ALTER COLUMN kind SET DEFAULT 'operational';

ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_kind_check
  CHECK (kind IN ('operational', 'fund', 'deposit', 'investment', 'cash', 'credit'));

ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_credit_fields_check
  CHECK (
    (kind IN ('operational', 'fund', 'deposit', 'investment', 'cash')
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

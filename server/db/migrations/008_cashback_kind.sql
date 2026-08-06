-- Cashback account kind (1 CBK = 1 RUB).

ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_kind_check;

ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_credit_fields_check;

ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_kind_check
  CHECK (kind IN ('operational', 'fund', 'deposit', 'investment', 'cash', 'credit', 'cashback'));

ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_credit_fields_check
  CHECK (
    (kind IN ('operational', 'fund', 'deposit', 'investment', 'cash', 'cashback')
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

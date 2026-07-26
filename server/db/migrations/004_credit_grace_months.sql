-- Per-card interest-free period length (calendar months after spend month).

ALTER TABLE wallet_accounts
  ADD COLUMN IF NOT EXISTS grace_months INT;

UPDATE wallet_accounts
SET grace_months = 3
WHERE kind = 'credit' AND grace_months IS NULL;

ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_credit_fields_check;

ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_credit_fields_check
  CHECK (
    (kind = 'regular'
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

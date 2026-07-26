-- Credit card accounts: available balance in check-ins, debt = limit - available.

ALTER TABLE wallet_accounts
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'regular';

ALTER TABLE wallet_accounts
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(20, 8);

ALTER TABLE wallet_accounts
  ADD COLUMN IF NOT EXISTS linked_account_id UUID REFERENCES wallet_accounts(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_accounts_kind_check'
  ) THEN
    ALTER TABLE wallet_accounts
      ADD CONSTRAINT wallet_accounts_kind_check
      CHECK (kind IN ('regular', 'credit'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_accounts_credit_fields_check'
  ) THEN
    ALTER TABLE wallet_accounts
      ADD CONSTRAINT wallet_accounts_credit_fields_check
      CHECK (
        (kind = 'regular' AND credit_limit IS NULL AND linked_account_id IS NULL)
        OR
        (kind = 'credit' AND credit_limit IS NOT NULL AND credit_limit > 0)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_accounts_linked_not_self'
  ) THEN
    ALTER TABLE wallet_accounts
      ADD CONSTRAINT wallet_accounts_linked_not_self
      CHECK (linked_account_id IS NULL OR linked_account_id <> id);
  END IF;
END $$;

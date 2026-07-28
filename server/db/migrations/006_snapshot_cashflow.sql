-- Daily external cashflows on check-ins (base currency) for return calculations.

ALTER TABLE wallet_snapshots
  ADD COLUMN IF NOT EXISTS income NUMERIC(20, 8) NOT NULL DEFAULT 0;

ALTER TABLE wallet_snapshots
  ADD COLUMN IF NOT EXISTS expense NUMERIC(20, 8) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_snapshots_income_nonneg'
  ) THEN
    ALTER TABLE wallet_snapshots
      ADD CONSTRAINT wallet_snapshots_income_nonneg CHECK (income >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_snapshots_expense_nonneg'
  ) THEN
    ALTER TABLE wallet_snapshots
      ADD CONSTRAINT wallet_snapshots_expense_nonneg CHECK (expense >= 0);
  END IF;
END $$;

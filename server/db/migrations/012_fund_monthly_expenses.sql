-- Monthly expense totals per envelope fund; optional auto monthly_target from their mean.

ALTER TABLE wallet_account_funds
  ADD COLUMN IF NOT EXISTS auto_target BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE wallet_account_funds
  DROP CONSTRAINT IF EXISTS wallet_account_funds_auto_target_check;

ALTER TABLE wallet_account_funds
  ADD CONSTRAINT wallet_account_funds_auto_target_check
  CHECK (system_key IS NULL OR auto_target = FALSE);

CREATE TABLE IF NOT EXISTS wallet_account_fund_expenses (
  fund_id UUID NOT NULL REFERENCES wallet_account_funds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  amount NUMERIC(20, 8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fund_id, year_month),
  CONSTRAINT wallet_account_fund_expenses_month_check
    CHECK (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT wallet_account_fund_expenses_amount_check
    CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS wallet_account_fund_expenses_user_idx
  ON wallet_account_fund_expenses (user_id);

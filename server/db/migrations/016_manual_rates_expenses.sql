-- Manual exchange rates for arbitrary currency pairs (current rate, one row per pair)
-- and standalone expenses (account spend with optional FX conversion + commission).

CREATE TABLE IF NOT EXISTS wallet_manual_rates (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_currency VARCHAR(8) NOT NULL,
  to_currency VARCHAR(8) NOT NULL,
  rate NUMERIC(20, 8) NOT NULL CHECK (rate > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, from_currency, to_currency),
  CONSTRAINT wallet_manual_rates_distinct_currencies CHECK (from_currency <> to_currency)
);

CREATE TABLE IF NOT EXISTS wallet_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  account_id UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  currency VARCHAR(8) NOT NULL,
  amount NUMERIC(20, 8) NOT NULL CHECK (amount > 0),
  -- Charged from the account, in the account currency (= amount for same currency).
  account_amount NUMERIC(20, 8) NOT NULL CHECK (account_amount > 0),
  -- Conversion commission in the account currency, frozen at creation time.
  commission NUMERIC(20, 8) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_expenses_user_date_idx
  ON wallet_expenses (user_id, expense_date DESC);

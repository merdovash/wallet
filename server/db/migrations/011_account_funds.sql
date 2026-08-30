-- Envelopes (фонды) inside an account. Balances are derived from check-ins and transfers.

CREATE TABLE IF NOT EXISTS wallet_account_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  monthly_target NUMERIC(20, 8) NOT NULL DEFAULT 0,
  priority INT NOT NULL DEFAULT 0,
  system_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_account_funds_system_key_check
    CHECK (system_key IS NULL OR system_key = 'free_money'),
  CONSTRAINT wallet_account_funds_target_check
    CHECK (
      (system_key = 'free_money' AND monthly_target = 0)
      OR (system_key IS NULL AND monthly_target > 0)
    )
);

CREATE INDEX IF NOT EXISTS wallet_account_funds_user_idx
  ON wallet_account_funds (user_id);

CREATE INDEX IF NOT EXISTS wallet_account_funds_account_idx
  ON wallet_account_funds (account_id, priority DESC);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_account_funds_one_free_money
  ON wallet_account_funds (account_id)
  WHERE system_key = 'free_money';

-- Wallet domain on shared finance DB (trip_budget + wallet).
-- Idempotent: users / sessions / cbr_rate_days may already exist from trip_budget.
-- All statements use IF NOT EXISTS so re-apply / shared deploy is safe.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS wallet_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  base_currency VARCHAR(8) NOT NULL DEFAULT 'RUB',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency VARCHAR(8) NOT NULL,
  color TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_accounts_user_sort_idx
  ON wallet_accounts (user_id, sort_order);

CREATE TABLE IF NOT EXISTS wallet_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS wallet_snapshots_user_date_idx
  ON wallet_snapshots (user_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS wallet_snapshot_lines (
  snapshot_id UUID NOT NULL REFERENCES wallet_snapshots(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  amount NUMERIC(20, 8) NOT NULL,
  PRIMARY KEY (snapshot_id, account_id)
);

CREATE INDEX IF NOT EXISTS wallet_snapshot_lines_account_idx
  ON wallet_snapshot_lines (account_id);

CREATE TABLE IF NOT EXISTS wallet_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transfer_date DATE NOT NULL,
  from_account_id UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  to_account_id UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  amount NUMERIC(20, 8) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_transfers_distinct_accounts CHECK (from_account_id <> to_account_id)
);

CREATE INDEX IF NOT EXISTS wallet_transfers_user_date_idx
  ON wallet_transfers (user_id, transfer_date DESC);

CREATE TABLE IF NOT EXISTS cbr_rate_days (
  rate_date DATE PRIMARY KEY,
  pivot jsonb NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cbr_rate_days_rate_date_idx ON cbr_rate_days (rate_date DESC);

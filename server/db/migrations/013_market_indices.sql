-- User-defined market indices and their dated observations.

CREATE TABLE IF NOT EXISTS wallet_market_indices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#2563eb',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_market_indices_name_check CHECK (length(trim(name)) > 0),
  CONSTRAINT wallet_market_indices_kind_check CHECK (kind IN ('amount', 'annual_rate')),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS wallet_market_indices_user_idx
  ON wallet_market_indices (user_id);

CREATE TABLE IF NOT EXISTS wallet_market_index_values (
  index_id UUID NOT NULL REFERENCES wallet_market_indices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value_date DATE NOT NULL,
  value NUMERIC(24, 10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (index_id, value_date)
);

CREATE INDEX IF NOT EXISTS wallet_market_index_values_user_date_idx
  ON wallet_market_index_values (user_id, value_date);

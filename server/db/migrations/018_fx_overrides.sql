CREATE TABLE IF NOT EXISTS wallet_fx_overrides (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rate_date DATE NOT NULL,
  currency VARCHAR(8) NOT NULL,
  buy_rate NUMERIC NOT NULL,
  sell_rate NUMERIC NOT NULL,
  comment TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rate_date, currency)
);

CREATE INDEX IF NOT EXISTS wallet_fx_overrides_user_date_idx
  ON wallet_fx_overrides (user_id, rate_date DESC);

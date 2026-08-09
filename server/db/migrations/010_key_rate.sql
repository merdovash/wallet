-- Key rate benchmark for return comparison (% stored as decimal, e.g. 0.16 = 16%).

ALTER TABLE wallet_settings
  ADD COLUMN IF NOT EXISTS key_rate_pct DOUBLE PRECISION;

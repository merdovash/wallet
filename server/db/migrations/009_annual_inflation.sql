-- Annual inflation assumption for real return (% stored as decimal, e.g. 0.08 = 8%).

ALTER TABLE wallet_settings
  ADD COLUMN IF NOT EXISTS annual_inflation_pct DOUBLE PRECISION;

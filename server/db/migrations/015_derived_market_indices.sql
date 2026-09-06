-- Derived rate indices: base percent index plus spread in percentage points.

ALTER TABLE wallet_market_indices
  ADD COLUMN IF NOT EXISTS base_index_id UUID NULL REFERENCES wallet_market_indices(id),
  ADD COLUMN IF NOT EXISTS rate_spread_pct NUMERIC(12, 8) NULL;

ALTER TABLE wallet_market_indices
  DROP CONSTRAINT IF EXISTS wallet_market_indices_kind_check;

ALTER TABLE wallet_market_indices
  ADD CONSTRAINT wallet_market_indices_kind_check
  CHECK (kind IN ('amount', 'annual_rate', 'derived_rate'));

ALTER TABLE wallet_market_indices
  DROP CONSTRAINT IF EXISTS wallet_market_indices_derived_rate_check;

ALTER TABLE wallet_market_indices
  ADD CONSTRAINT wallet_market_indices_derived_rate_check
  CHECK (
    (kind = 'derived_rate' AND base_index_id IS NOT NULL AND rate_spread_pct IS NOT NULL)
    OR
    (kind <> 'derived_rate' AND base_index_id IS NULL AND rate_spread_pct IS NULL)
  );

CREATE INDEX IF NOT EXISTS wallet_market_indices_base_index_idx
  ON wallet_market_indices (base_index_id);

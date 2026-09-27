-- Manual order of market indices in the registry.
ALTER TABLE wallet_market_indices
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

UPDATE wallet_market_indices AS i
SET sort_order = s.rn - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY name ASC) AS rn
  FROM wallet_market_indices
) AS s
WHERE i.id = s.id;

CREATE INDEX IF NOT EXISTS wallet_market_indices_user_sort_idx
  ON wallet_market_indices (user_id, sort_order);

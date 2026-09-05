-- Currency of an index quote / rate-bearing balance.

ALTER TABLE wallet_market_indices
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'RUB';

UPDATE wallet_market_indices AS idx
SET currency = settings.base_currency
FROM wallet_settings AS settings
WHERE settings.user_id = idx.user_id
  AND idx.currency = 'RUB';

ALTER TABLE wallet_market_indices
  DROP CONSTRAINT IF EXISTS wallet_market_indices_currency_check;

ALTER TABLE wallet_market_indices
  ADD CONSTRAINT wallet_market_indices_currency_check
  CHECK (currency ~ '^[A-Z]{3,8}$');

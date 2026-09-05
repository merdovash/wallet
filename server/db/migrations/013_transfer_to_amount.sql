-- Destination receipt for a transfer (fees / FX spread).
-- NULL = legacy: same currency → amount; different currencies → official conversion.

ALTER TABLE wallet_transfers
  ADD COLUMN IF NOT EXISTS to_amount NUMERIC(20, 8);

ALTER TABLE wallet_transfers
  DROP CONSTRAINT IF EXISTS wallet_transfers_to_amount_check;

ALTER TABLE wallet_transfers
  ADD CONSTRAINT wallet_transfers_to_amount_check
  CHECK (to_amount IS NULL OR to_amount > 0);

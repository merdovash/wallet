-- Which wallet the transfer's commission / FX spread belongs to (optional).
-- NULL = not specified: the commission is attributed to both accounts of the transfer.

ALTER TABLE wallet_transfers
  ADD COLUMN IF NOT EXISTS commission_account_id UUID REFERENCES wallet_accounts(id) ON DELETE SET NULL;

-- Snapshot origin: manual check-in vs transfer-generated (locked balances).

ALTER TABLE wallet_snapshots
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_snapshots_origin_check'
  ) THEN
    ALTER TABLE wallet_snapshots
      ADD CONSTRAINT wallet_snapshots_origin_check
      CHECK (origin IN ('manual', 'transfer'));
  END IF;
END $$;

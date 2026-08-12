ALTER TABLE weekly_history
  ADD COLUMN IF NOT EXISTS finalized boolean NOT NULL DEFAULT false;

ALTER TABLE weekly_history
  ADD COLUMN IF NOT EXISTS unrecoverable boolean NOT NULL DEFAULT false;

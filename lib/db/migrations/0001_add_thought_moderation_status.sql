ALTER TABLE thoughts
ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'active';

ALTER TABLE thoughts
ADD COLUMN IF NOT EXISTS moderation_reason text;

ALTER TABLE thoughts
ADD COLUMN IF NOT EXISTS moderation_updated_at timestamptz;

ALTER TABLE thoughts
DROP CONSTRAINT IF EXISTS thoughts_moderation_status_check;

ALTER TABLE thoughts
ADD CONSTRAINT thoughts_moderation_status_check
CHECK (moderation_status IN ('active', 'quarantined', 'rejected', 'deleted'));

CREATE INDEX IF NOT EXISTS thoughts_receive_eligibility_idx
ON thoughts (moderation_status, created_at);

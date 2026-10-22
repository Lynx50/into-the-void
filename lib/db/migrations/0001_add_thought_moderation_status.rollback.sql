DROP INDEX IF EXISTS thoughts_receive_eligibility_idx;

ALTER TABLE thoughts
DROP CONSTRAINT IF EXISTS thoughts_moderation_status_check;

ALTER TABLE thoughts
DROP COLUMN IF EXISTS moderation_updated_at;

ALTER TABLE thoughts
DROP COLUMN IF EXISTS moderation_reason;

ALTER TABLE thoughts
DROP COLUMN IF EXISTS moderation_status;

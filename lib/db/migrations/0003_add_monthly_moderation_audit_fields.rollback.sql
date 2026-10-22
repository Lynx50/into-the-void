DROP INDEX IF EXISTS thoughts_moderation_audit_id_idx;
DROP TRIGGER IF EXISTS thoughts_set_updated_at ON thoughts;
DROP FUNCTION IF EXISTS set_thought_updated_at();

ALTER TABLE thoughts
DROP COLUMN IF EXISTS updated_at;

ALTER TABLE thoughts
DROP COLUMN IF EXISTS moderation_audit_id;

ALTER TABLE thoughts
DROP COLUMN IF EXISTS moderation_rule_version;

ALTER TABLE thoughts
ADD COLUMN IF NOT EXISTS moderation_rule_version text;

ALTER TABLE thoughts
ADD COLUMN IF NOT EXISTS moderation_audit_id text;

ALTER TABLE thoughts
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION set_thought_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS thoughts_set_updated_at ON thoughts;

CREATE TRIGGER thoughts_set_updated_at
BEFORE UPDATE ON thoughts
FOR EACH ROW
EXECUTE FUNCTION set_thought_updated_at();

CREATE INDEX IF NOT EXISTS thoughts_moderation_audit_id_idx
ON thoughts (moderation_audit_id)
WHERE moderation_audit_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS daily_thought_selections (
  date_utc date PRIMARY KEY,
  thought_id integer NOT NULL UNIQUE,
  selected_at timestamptz NOT NULL DEFAULT now(),
  algorithm_version text NOT NULL,
  selection_mode text NOT NULL,
  requester_excluded boolean NOT NULL DEFAULT false,
  audit_metadata jsonb NOT NULL,
  CONSTRAINT daily_thought_selections_thought_fk
    FOREIGN KEY (thought_id)
    REFERENCES thoughts(id)
    ON DELETE RESTRICT,
  CONSTRAINT daily_thought_selections_mode_check
    CHECK (selection_mode IN ('standard', 'cooldown_relaxed')),
  CONSTRAINT daily_thought_selections_metadata_check
    CHECK (
      audit_metadata ? 'candidateCount'
      AND audit_metadata ? 'shortlistCount'
      AND audit_metadata ? 'authorCooldownApplied'
    )
);

CREATE INDEX IF NOT EXISTS daily_thought_selections_selected_at_idx
ON daily_thought_selections (selected_at DESC);

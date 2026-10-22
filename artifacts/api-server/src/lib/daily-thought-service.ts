import { pool } from "@workspace/db";
import {
  DAILY_THOUGHT_ALGORITHM_VERSION,
  getUtcDateKey,
  isDailyThoughtCandidateEligible,
  selectDailyThoughtCandidate,
  type DailyThoughtCandidate,
} from "./daily-thought-selection";

type DailyThoughtRow = {
  date_utc: string | Date;
  thought_id: number;
  user_id: string;
  content: string;
  moderation_status: string;
  created_at: Date;
  felt_this_count: number;
  made_think_count: number;
  report_count: string | number;
};

export type DailyThoughtResult = {
  dateUtc: string;
  text: string;
  authorUserId: string;
};

function rowToCandidate(row: DailyThoughtRow): DailyThoughtCandidate {
  return {
    id: Number(row.thought_id),
    userId: row.user_id,
    content: row.content,
    moderationStatus: row.moderation_status,
    createdAt: new Date(row.created_at),
    feltThisCount: Number(row.felt_this_count),
    madeThinkCount: Number(row.made_think_count),
    reportCount: Number(row.report_count),
    previouslySelected: false,
    authorLastSelectedAt: null,
  };
}

function publicResult(row: DailyThoughtRow): DailyThoughtResult {
  const dateUtc =
    row.date_utc instanceof Date
      ? getUtcDateKey(row.date_utc)
      : String(row.date_utc).slice(0, 10);

  return {
    dateUtc,
    text: row.content,
    authorUserId: row.user_id,
  };
}

export async function getOrCreateDailyThought(
  now = new Date(),
): Promise<DailyThoughtResult | null> {
  const dateUtc = getUtcDateKey(now);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `thought-of-day:${dateUtc}`,
    ]);

    const existing = await client.query<DailyThoughtRow>(
      `SELECT d.date_utc, d.thought_id, t.user_id, t.content,
              COALESCE(t.moderation_status, 'active') AS moderation_status,
              t.created_at, t.felt_this_count, t.made_think_count,
              (SELECT COUNT(*) FROM reactions r
               WHERE r.thought_id = t.id AND r.reaction_type LIKE 'report%') AS report_count
       FROM daily_thought_selections d
       JOIN thoughts t ON t.id = d.thought_id
       WHERE d.date_utc = $1`,
      [dateUtc],
    );

    if (existing.rows[0]) {
      const row = existing.rows[0];
      const candidate = rowToCandidate(row);
      await client.query("COMMIT");
      return isDailyThoughtCandidateEligible(candidate, now)
        ? publicResult(row)
        : null;
    }

    const candidates = await client.query<
      DailyThoughtRow & {
        previously_selected: boolean;
        author_last_selected_at: Date | null;
      }
    >(
      `SELECT $1::date AS date_utc, t.id AS thought_id, t.user_id, t.content,
              COALESCE(t.moderation_status, 'active') AS moderation_status,
              t.created_at, t.felt_this_count, t.made_think_count,
              (SELECT COUNT(*) FROM reactions r
               WHERE r.thought_id = t.id AND r.reaction_type LIKE 'report%') AS report_count,
              EXISTS (SELECT 1 FROM daily_thought_selections used
                      WHERE used.thought_id = t.id) AS previously_selected,
              (SELECT MAX(previous.selected_at)
               FROM daily_thought_selections previous
               JOIN thoughts previous_thought ON previous_thought.id = previous.thought_id
               WHERE previous_thought.user_id = t.user_id) AS author_last_selected_at
       FROM thoughts t
       WHERE t.user_id <> '__seed__'
         AND COALESCE(t.moderation_status, 'active') = 'active'
         AND t.created_at <= $2::timestamptz - INTERVAL '24 hours'`,
      [dateUtc, now.toISOString()],
    );

    const selection = selectDailyThoughtCandidate(
      candidates.rows.map((row) => ({
        ...rowToCandidate(row),
        previouslySelected: row.previously_selected,
        authorLastSelectedAt: row.author_last_selected_at
          ? new Date(row.author_last_selected_at)
          : null,
      })),
      { now },
    );

    if (!selection) {
      await client.query("COMMIT");
      return null;
    }

    await client.query(
      `INSERT INTO daily_thought_selections
         (date_utc, thought_id, selected_at, algorithm_version, selection_mode,
          requester_excluded, audit_metadata)
       VALUES ($1, $2, $3, $4, $5, false, $6::jsonb)`,
      [
        dateUtc,
        selection.candidate.id,
        now.toISOString(),
        DAILY_THOUGHT_ALGORITHM_VERSION,
        selection.selectionMode,
        JSON.stringify({
          candidateCount: selection.candidateCount,
          shortlistCount: selection.shortlistCount,
          authorCooldownApplied: selection.selectionMode === "standard",
        }),
      ],
    );
    await client.query("COMMIT");

    return {
      dateUtc,
      text: selection.candidate.content,
      authorUserId: selection.candidate.userId,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

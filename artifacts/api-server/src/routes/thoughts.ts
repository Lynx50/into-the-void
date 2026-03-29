import { Router, type IRouter } from "express";
import { db, thoughtsTable, receivesTable, reactionsTable } from "@workspace/db";
import {
  SubmitThoughtBody,
  ReceiveThoughtBody,
  GetMyThoughtsQueryParams,
  GetReceiveCountQueryParams,
  ReactToThoughtParams,
  ReactToThoughtBody,
} from "@workspace/api-zod";
import { eq, sql, ne, and, gte, count } from "drizzle-orm";

const router: IRouter = Router();

const DAILY_RECEIVE_LIMIT = 3;

// ─── Content moderation ────────────────────────────────────────────────────────
// Exact phrases / substrings that are always blocked.
// Emotional / sad / reflective language is intentionally NOT on this list.
const BLOCKED_PHRASES = [
  // Self-harm intent (allow "I feel sad", "I feel hopeless" etc — block explicit intent)
  "kill myself", "killing myself", "end my life", "end it all", "take my life",
  "want to die", "wanna die", "going to die", "gonna die", "ready to die",
  "hurt myself", "harm myself", "cut myself", "cutting myself",
  "overdose", "overdosing", "don't want to be here anymore",
  "can't go on", "cannot go on", "no point living", "no reason to live",
  "better off dead", "better off without me",
  // Threats
  "kill you", "kill her", "kill him", "kill them",
  "gonna hurt", "going to hurt", "i will hurt", "i'll hurt",
  "bomb", "shooting", "massacre", "attack",
  // Hate speech — slurs
  "nigger", "nigga", "faggot", " fag ", "chink", "spic", "kike",
  "wetback", "tranny", "raghead", "sandnigger", "gook", "zipperhead",
  // Explicit abuse
  "rape", "molest", "child porn", "pedophile",
];

function isBlocked(text: string): boolean {
  const t = " " + text.toLowerCase() + " ";
  return BLOCKED_PHRASES.some((phrase) => t.includes(phrase));
}

const REPORT_HIDE_THRESHOLD = 3;

router.post("/thoughts", async (req, res) => {
  const parsed = SubmitThoughtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { userId, content, mood } = parsed.data;

  if (!content || content.trim().length === 0) {
    res.status(400).json({ error: "Content cannot be empty" });
    return;
  }

  if (isBlocked(content)) {
    res.status(422).json({ error: "This thought can't be shared here." });
    return;
  }

  const [thought] = await db
    .insert(thoughtsTable)
    .values({ userId, content: content.trim(), mood: mood ?? null })
    .returning();

  res.status(201).json({
    id: thought.id,
    userId: thought.userId,
    content: thought.content,
    mood: thought.mood,
    feltThisCount: thought.feltThisCount,
    madeThinkCount: thought.madeThinkCount,
    createdAt: thought.createdAt.toISOString(),
  });
});

router.post("/thoughts/receive", async (req, res) => {
  const parsed = ReceiveThoughtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { userId } = parsed.data;

  // Require user to have submitted at least 1 thought
  const [userThoughtCount] = await db
    .select({ count: count() })
    .from(thoughtsTable)
    .where(eq(thoughtsTable.userId, userId));

  if ((userThoughtCount?.count ?? 0) === 0) {
    res.status(403).json({ error: "Release a thought first before you can receive one." });
    return;
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [todayCountResult] = await db
    .select({ count: count() })
    .from(receivesTable)
    .where(
      and(
        eq(receivesTable.userId, userId),
        gte(receivesTable.receivedAt, startOfDay)
      )
    );

  const todayCount = todayCountResult?.count ?? 0;

  if (todayCount >= DAILY_RECEIVE_LIMIT) {
    res.status(429).json({ error: "Daily receive limit reached. Come back tomorrow." });
    return;
  }

  // Use weighted random: popular thoughts surface more often.
  // Exclude thoughts that have been reported >= REPORT_HIDE_THRESHOLD times.
  const thoughts = await db
    .select()
    .from(thoughtsTable)
    .where(
      and(
        ne(thoughtsTable.userId, userId),
        sql`(
          SELECT COUNT(*) FROM reactions
          WHERE reactions.thought_id = ${thoughtsTable.id}
            AND reactions.reaction_type LIKE 'report%'
        ) < ${REPORT_HIDE_THRESHOLD}`,
      ),
    )
    .orderBy(sql`RANDOM() * (${thoughtsTable.feltThisCount} + ${thoughtsTable.madeThinkCount} + 1) DESC`)
    .limit(1);

  const thought = thoughts[0];

  if (!thought) {
    res.status(404).json({ error: "No thoughts available yet. Be the first to release one!" });
    return;
  }

  await db.insert(receivesTable).values({ userId, thoughtId: thought.id });

  res.json({
    id: thought.id,
    content: thought.content,
    mood: thought.mood,
    feltThisCount: thought.feltThisCount,
    madeThinkCount: thought.madeThinkCount,
  });
});

router.get("/thoughts/my", async (req, res) => {
  const parsed = GetMyThoughtsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing userId" });
    return;
  }

  const { userId } = parsed.data;

  const thoughts = await db
    .select()
    .from(thoughtsTable)
    .where(eq(thoughtsTable.userId, userId))
    .orderBy(sql`${thoughtsTable.createdAt} DESC`);

  res.json(
    thoughts.map((t) => ({
      id: t.id,
      userId: t.userId,
      content: t.content,
      mood: t.mood,
      feltThisCount: t.feltThisCount,
      madeThinkCount: t.madeThinkCount,
      createdAt: t.createdAt.toISOString(),
    }))
  );
});

router.get("/thoughts/receive-count", async (req, res) => {
  const parsed = GetReceiveCountQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing userId" });
    return;
  }

  const { userId } = parsed.data;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({ count: count() })
    .from(receivesTable)
    .where(
      and(
        eq(receivesTable.userId, userId),
        gte(receivesTable.receivedAt, startOfDay)
      )
    );

  const usedCount = result?.count ?? 0;

  res.json({
    count: usedCount,
    limit: DAILY_RECEIVE_LIMIT,
    remaining: Math.max(0, DAILY_RECEIVE_LIMIT - usedCount),
  });
});

router.post("/thoughts/:id/react", async (req, res) => {
  const paramsParsed = ReactToThoughtParams.safeParse({ id: req.params.id });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid thought id" });
    return;
  }

  const bodyParsed = ReactToThoughtBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid reaction" });
    return;
  }

  const { id } = paramsParsed.data;
  const { userId, reactionType } = bodyParsed.data;

  const [thought] = await db
    .select()
    .from(thoughtsTable)
    .where(eq(thoughtsTable.id, id));

  if (!thought) {
    res.status(404).json({ error: "Thought not found" });
    return;
  }

  const existing = await db
    .select()
    .from(reactionsTable)
    .where(
      and(
        eq(reactionsTable.userId, userId),
        eq(reactionsTable.thoughtId, id),
        eq(reactionsTable.reactionType, reactionType)
      )
    );

  if (existing.length > 0) {
    res.json({
      id: thought.id,
      userId: thought.userId,
      content: thought.content,
      mood: thought.mood,
      feltThisCount: thought.feltThisCount,
      madeThinkCount: thought.madeThinkCount,
      createdAt: thought.createdAt.toISOString(),
    });
    return;
  }

  await db.insert(reactionsTable).values({ userId, thoughtId: id, reactionType });

  const updates: { feltThisCount?: number; madeThinkCount?: number } = {};
  if (reactionType === "felt_this") {
    updates.feltThisCount = thought.feltThisCount + 1;
  } else if (reactionType === "made_think") {
    updates.madeThinkCount = thought.madeThinkCount + 1;
  }

  const [updated] = await db
    .update(thoughtsTable)
    .set(updates)
    .where(eq(thoughtsTable.id, id))
    .returning();

  res.json({
    id: updated.id,
    userId: updated.userId,
    content: updated.content,
    mood: updated.mood,
    feltThisCount: updated.feltThisCount,
    madeThinkCount: updated.madeThinkCount,
    createdAt: updated.createdAt.toISOString(),
  });
});

// ─── Report ────────────────────────────────────────────────────────────────────
const VALID_REPORT_CATEGORIES = ["harmful", "abusive", "inappropriate"] as const;
type ReportCategory = (typeof VALID_REPORT_CATEGORIES)[number];

router.post("/thoughts/:id/report", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid thought id" });
    return;
  }

  const userId = req.body?.userId;
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const rawCategory = req.body?.category;
  const category: ReportCategory = VALID_REPORT_CATEGORIES.includes(rawCategory)
    ? rawCategory
    : "inappropriate";
  const reactionType = `report:${category}`;

  // One report per user per thought (any category counts as dedup)
  const [existing] = await db
    .select()
    .from(reactionsTable)
    .where(
      and(
        eq(reactionsTable.thoughtId, id),
        eq(reactionsTable.userId, userId),
        sql`${reactionsTable.reactionType} LIKE 'report%'`,
      ),
    )
    .limit(1);

  if (existing) {
    res.status(200).json({ reported: true });
    return;
  }

  await db.insert(reactionsTable).values({ userId, thoughtId: id, reactionType });

  res.status(201).json({ reported: true });
});

export default router;

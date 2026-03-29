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

  const alreadyReceived = await db
    .select({ thoughtId: receivesTable.thoughtId })
    .from(receivesTable)
    .where(eq(receivesTable.userId, userId));

  const alreadyReceivedIds = alreadyReceived.map((r) => r.thoughtId);

  let thoughtQuery = db
    .select()
    .from(thoughtsTable)
    .where(ne(thoughtsTable.userId, userId))
    .orderBy(sql`RANDOM()`)
    .limit(1);

  const thoughts = await thoughtQuery;

  let thought = thoughts[0];

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

export default router;

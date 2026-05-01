import { Router, type IRouter, type Request, type RequestHandler } from "express";
import {
  db,
  thoughtsTable,
  receivesTable,
  reactionsTable,
  anonymousUsersTable,
} from "@workspace/db";
import {
  SubmitThoughtBody,
  ReceiveThoughtBody,
  GetMyThoughtsQueryParams,
  GetReceiveCountQueryParams,
  ReactToThoughtParams,
  ReactToThoughtBody,
} from "@workspace/api-zod";
import { eq, sql, ne, and, gte, count } from "drizzle-orm";
import {
  isValidAnonymousUserId,
  resolveSessionUserId,
} from "../lib/session";

const router: IRouter = Router();

const DAILY_RECEIVE_LIMIT = 3;
const REPORT_HIDE_THRESHOLD = 3;

type RateLimitRule = {
  windowMs: number;
  max: number;
  message: string;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
let lastBucketPruneAt = 0;

async function ensureAnonymousUser(userId: string): Promise<void> {
  const [existing] = await db
    .select({ id: anonymousUsersTable.id })
    .from(anonymousUsersTable)
    .where(eq(anonymousUsersTable.id, userId))
    .limit(1);

  if (!existing) {
    await db.insert(anonymousUsersTable).values({
      id: userId,
      lastSeenAt: new Date(),
    });
    return;
  }

  await db
    .update(anonymousUsersTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(anonymousUsersTable.id, userId));
}

function resolveAuthenticatedUserId(
  req: Request,
  suppliedUserId?: unknown,
): { ok: true; userId: string } | { ok: false; status: number; error: string } {
  const sessionUserId = resolveSessionUserId(req);
  const requestUserId =
    typeof suppliedUserId === "string" && suppliedUserId.trim()
      ? suppliedUserId.trim()
      : null;

  if (sessionUserId && requestUserId && sessionUserId !== requestUserId) {
    return {
      ok: false,
      status: 401,
      error: "Session does not match the supplied user.",
    };
  }

  const userId = sessionUserId ?? requestUserId;

  if (!userId || !isValidAnonymousUserId(userId)) {
    return {
      ok: false,
      status: 401,
      error: "Anonymous session required.",
    };
  }

  return { ok: true, userId };
}

function getStartOfUtcDay(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
}

function normalizeExcludedThoughtIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) {
    return [];
  }

  return [
    ...new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ].slice(0, 500);
}

async function findReceiveCandidate(
  userId: string,
  excludedThoughtIds: number[],
) {
  const { notReported, notReportedByUser, notAlreadySeen, notClientSeen } =
    buildEligibleThoughtPredicates(userId, excludedThoughtIds);

  const thoughts = await db
    .select({
      id: thoughtsTable.id,
      content: thoughtsTable.content,
      mood: thoughtsTable.mood,
      feltThisCount: thoughtsTable.feltThisCount,
      madeThinkCount: thoughtsTable.madeThinkCount,
    })
    .from(thoughtsTable)
    .where(
      and(
        ne(thoughtsTable.userId, userId),
        notReported,
        notReportedByUser,
        notAlreadySeen,
        notClientSeen,
      ),
    )
    .orderBy(
      sql`RANDOM() * (${thoughtsTable.feltThisCount} + ${thoughtsTable.madeThinkCount} + 1) DESC`,
    )
    .limit(1);

  return thoughts[0];
}

function buildEligibleThoughtPredicates(
  userId: string,
  excludedThoughtIds: number[] = [],
) {
  const notReported = sql`(
    SELECT COUNT(*) FROM reactions
    WHERE reactions.thought_id = ${thoughtsTable.id}
      AND reactions.reaction_type LIKE 'report%'
  ) < ${REPORT_HIDE_THRESHOLD}`;

  const notReportedByUser = sql`${thoughtsTable.id} NOT IN (
    SELECT thought_id FROM reactions
    WHERE reactions.user_id = ${userId}
      AND reactions.reaction_type LIKE 'report%'
  )`;

  const notAlreadySeen = sql`${thoughtsTable.id} NOT IN (
    SELECT thought_id FROM receives WHERE user_id = ${userId}
  )`;

  const notClientSeen =
    excludedThoughtIds.length > 0
      ? sql`${thoughtsTable.id} NOT IN (${sql.join(
          excludedThoughtIds.map((id) => sql`${id}`),
          sql`,`,
        )})`
      : sql`TRUE`;

  return {
    notReported,
    notReportedByUser,
    notAlreadySeen,
    notClientSeen,
  };
}

function pruneRateLimitBuckets(now = Date.now()): void {
  if (now - lastBucketPruneAt < 60_000) {
    return;
  }

  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }

  lastBucketPruneAt = now;
}

function getClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwarded =
    typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0]?.trim()
      : Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : undefined;

  return forwarded || req.ip || "unknown";
}

function createRateLimitMiddleware(
  prefix: string,
  rule: RateLimitRule,
  getUserId?: (req: Request) => string | undefined,
): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    pruneRateLimitBuckets(now);

    const userId = getUserId?.(req) ?? "anonymous";
    const key = `${prefix}:${getClientIp(req)}:${userId}`;

    const existing = rateLimitBuckets.get(key);
    if (!existing || existing.resetAt <= now) {
      rateLimitBuckets.set(key, {
        count: 1,
        resetAt: now + rule.windowMs,
      });
      next();
      return;
    }

    existing.count += 1;
    rateLimitBuckets.set(key, existing);

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000),
    );

    res.setHeader("Retry-After", String(retryAfterSeconds));

    if (existing.count > rule.max) {
      res.status(429).json({ error: rule.message });
      return;
    }

    next();
  };
}

const submitRateLimit = createRateLimitMiddleware(
  "submit-thought",
  {
    windowMs: 5 * 60_000,
    max: 12,
    message: "Too many thoughts released. Please wait a little and try again.",
  },
  (req) => (typeof req.body?.userId === "string" ? req.body.userId : undefined),
);

const receiveRateLimit = createRateLimitMiddleware(
  "receive-thought",
  {
    windowMs: 10 * 60_000,
    max: 30,
    message: "Too many receive attempts. Please slow down and try again soon.",
  },
  (req) => (typeof req.body?.userId === "string" ? req.body.userId : undefined),
);

const reactRateLimit = createRateLimitMiddleware(
  "react-thought",
  {
    windowMs: 10 * 60_000,
    max: 60,
    message: "Too many reactions in a short time. Please slow down.",
  },
  (req) => (typeof req.body?.userId === "string" ? req.body.userId : undefined),
);

const reportRateLimit = createRateLimitMiddleware(
  "report-thought",
  {
    windowMs: 15 * 60_000,
    max: 20,
    message: "Too many reports in a short time. Please slow down.",
  },
  (req) => (typeof req.body?.userId === "string" ? req.body.userId : undefined),
);

const BLOCKED_PHRASES = [
  "kill myself",
  "killing myself",
  "end my life",
  "end it all",
  "take my life",
  "want to die",
  "wanna die",
  "going to die",
  "gonna die",
  "ready to die",
  "hurt myself",
  "harm myself",
  "cut myself",
  "cutting myself",
  "overdose",
  "overdosing",
  "don't want to be here anymore",
  "can't go on",
  "cannot go on",
  "no point living",
  "no reason to live",
  "better off dead",
  "better off without me",

  "kill you",
  "kill her",
  "kill him",
  "kill them",
  "gonna hurt",
  "going to hurt",
  "i will hurt",
  "i'll hurt",
  "bomb",
  "shooting",
  "massacre",
  "attack",

  "nigger",
  "nigga",
  "faggot",
  " fag ",
  "chink",
  "spic",
  "kike",
  "wetback",
  "tranny",
  "raghead",
  "sandnigger",
  "gook",
  "zipperhead",

  "rape",
  "molest",
  "child porn",
  "pedophile",
];

function isBlocked(text: string): boolean {
  const t = " " + text.toLowerCase() + " ";
  return BLOCKED_PHRASES.some((phrase) => t.includes(phrase));
}

router.post("/thoughts", submitRateLimit, async (req, res) => {
  const parsed = SubmitThoughtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const auth = resolveAuthenticatedUserId(req, parsed.data.userId);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const { userId } = auth;
  const { content, mood } = parsed.data;

  if (!content || content.trim().length === 0) {
    res.status(400).json({ error: "Content cannot be empty" });
    return;
  }

  if (isBlocked(content)) {
    res.status(422).json({ error: "This thought can't be shared here." });
    return;
  }

  try {
    await ensureAnonymousUser(userId);

    const [thought] = await db
      .insert(thoughtsTable)
      .values({
        userId,
        content: content.trim(),
        mood: mood ?? null,
      })
      .returning({
        id: thoughtsTable.id,
        userId: thoughtsTable.userId,
        content: thoughtsTable.content,
        mood: thoughtsTable.mood,
        feltThisCount: thoughtsTable.feltThisCount,
        madeThinkCount: thoughtsTable.madeThinkCount,
        createdAt: thoughtsTable.createdAt,
      });

    res.status(201).json({
      id: thought.id,
      userId: thought.userId,
      content: thought.content,
      mood: thought.mood,
      feltThisCount: thought.feltThisCount,
      madeThinkCount: thought.madeThinkCount,
      createdAt: thought.createdAt.toISOString(),
    });
  } catch (err: any) {
    console.error("POST /thoughts INSERT ERROR:", err);
    res.status(500).json({ error: "Failed to save thought" });
  }
});

router.post("/thoughts/receive", receiveRateLimit, async (req, res) => {
  const parsed = ReceiveThoughtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const auth = resolveAuthenticatedUserId(req, parsed.data.userId);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const { userId } = auth;
  const excludedThoughtIds = normalizeExcludedThoughtIds(
    parsed.data.excludeThoughtIds,
  );

  try {
    await ensureAnonymousUser(userId);

    const [userThoughtCount] = await db
      .select({ count: count() })
      .from(thoughtsTable)
      .where(eq(thoughtsTable.userId, userId));

    if ((userThoughtCount?.count ?? 0) === 0) {
      res.status(403).json({
        error: "Release a thought first before you can receive one.",
      });
      return;
    }

    const startOfDay = getStartOfUtcDay();

    const [todayCountResult] = await db
      .select({ count: count() })
      .from(receivesTable)
      .where(
        and(
          eq(receivesTable.userId, userId),
          gte(receivesTable.receivedAt, startOfDay),
        ),
      );

    const todayCount = Number(todayCountResult?.count ?? 0);

    const isDev = process.env.NODE_ENV === "development";
    if (!isDev && todayCount >= DAILY_RECEIVE_LIMIT) {
      res.status(429).json({
        error: "Daily receive limit reached. Come back tomorrow.",
      });
      return;
    }

    const thought = await findReceiveCandidate(userId, excludedThoughtIds);

    if (!thought) {
      res.status(404).json({
        error: "No new thoughts right now. Release one and come back later.",
      });
      return;
    }

    const [existingReceive] = await db
      .select({ thoughtId: receivesTable.thoughtId })
      .from(receivesTable)
      .where(
        and(
          eq(receivesTable.userId, userId),
          eq(receivesTable.thoughtId, thought.id),
        ),
      )
      .limit(1);

    if (existingReceive) {
      res.status(404).json({
        error: "No new thoughts right now. Release one and come back later.",
      });
      return;
    }

    await db.insert(receivesTable).values({
      userId,
      thoughtId: thought.id,
      receivedAt: new Date(),
    });

    res.json({
      id: thought.id,
      content: thought.content,
      mood: thought.mood,
      feltThisCount: thought.feltThisCount,
      madeThinkCount: thought.madeThinkCount,
    });
  } catch (err: any) {
    console.error("POST /thoughts/receive ERROR:", err);
    res.status(500).json({ error: "Failed to receive thought" });
  }
});

router.post("/thoughts/receive-preview", receiveRateLimit, async (req, res) => {
  const parsed = ReceiveThoughtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const auth = resolveAuthenticatedUserId(req, parsed.data.userId);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const { userId } = auth;
  const excludedThoughtIds = normalizeExcludedThoughtIds(
    parsed.data.excludeThoughtIds,
  );

  try {
    await ensureAnonymousUser(userId);

    const [userThoughtCount] = await db
      .select({ count: count() })
      .from(thoughtsTable)
      .where(eq(thoughtsTable.userId, userId));

    if ((userThoughtCount?.count ?? 0) === 0) {
      res.status(403).json({
        error: "Release a thought first before you can receive one.",
      });
      return;
    }

    const startOfDay = getStartOfUtcDay();
    const [todayCountResult] = await db
      .select({ count: count() })
      .from(receivesTable)
      .where(
        and(
          eq(receivesTable.userId, userId),
          gte(receivesTable.receivedAt, startOfDay),
        ),
      );

    const todayCount = Number(todayCountResult?.count ?? 0);
    const isDev = process.env.NODE_ENV === "development";
    if (!isDev && todayCount >= DAILY_RECEIVE_LIMIT) {
      res.status(429).json({
        error: "Daily receive limit reached. Come back tomorrow.",
      });
      return;
    }

    const thought = await findReceiveCandidate(userId, excludedThoughtIds);

    if (!thought) {
      res.status(404).json({
        error: "No new thoughts right now. Release one and come back later.",
      });
      return;
    }

    res.json(thought);
  } catch (err: any) {
    console.error("POST /thoughts/receive-preview ERROR:", err);
    res.status(500).json({ error: "Failed to preview thought" });
  }
});

router.post("/thoughts/receive-claim", receiveRateLimit, async (req, res) => {
  const rawUserId = req.body?.userId;
  const thoughtId = Number(req.body?.thoughtId);

  if (
    typeof rawUserId !== "string" ||
    !rawUserId.trim() ||
    !Number.isInteger(thoughtId) ||
    thoughtId <= 0
  ) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const auth = resolveAuthenticatedUserId(req, rawUserId);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const { userId } = auth;

  try {
    await ensureAnonymousUser(userId);

    const [userThoughtCount] = await db
      .select({ count: count() })
      .from(thoughtsTable)
      .where(eq(thoughtsTable.userId, userId));

    if ((userThoughtCount?.count ?? 0) === 0) {
      res.status(403).json({
        error: "Release a thought first before you can receive one.",
      });
      return;
    }

    const startOfDay = getStartOfUtcDay();
    const [todayCountResult] = await db
      .select({ count: count() })
      .from(receivesTable)
      .where(
        and(
          eq(receivesTable.userId, userId),
          gte(receivesTable.receivedAt, startOfDay),
        ),
      );

    const todayCount = Number(todayCountResult?.count ?? 0);
    const isDev = process.env.NODE_ENV === "development";
    if (!isDev && todayCount >= DAILY_RECEIVE_LIMIT) {
      res.status(429).json({
        error: "Daily receive limit reached. Come back tomorrow.",
      });
      return;
    }

    const [existingReceive] = await db
      .select({ thoughtId: receivesTable.thoughtId })
      .from(receivesTable)
      .where(
        and(
          eq(receivesTable.userId, userId),
          eq(receivesTable.thoughtId, thoughtId),
        ),
      )
      .limit(1);

    if (existingReceive) {
      res.status(409).json({ error: "Thought already received." });
      return;
    }

    const {
      notReported,
      notReportedByUser,
      notAlreadySeen,
    } = buildEligibleThoughtPredicates(userId);

    const [thought] = await db
      .select({
        id: thoughtsTable.id,
        content: thoughtsTable.content,
        mood: thoughtsTable.mood,
        feltThisCount: thoughtsTable.feltThisCount,
        madeThinkCount: thoughtsTable.madeThinkCount,
      })
      .from(thoughtsTable)
      .where(
        and(
          eq(thoughtsTable.id, thoughtId),
          ne(thoughtsTable.userId, userId),
          notReported,
          notReportedByUser,
          notAlreadySeen,
        ),
      )
      .limit(1);

    if (!thought) {
      res.status(404).json({
        error: "That thought is no longer available.",
      });
      return;
    }

    await db.insert(receivesTable).values({
      userId,
      thoughtId: thought.id,
      receivedAt: new Date(),
    });

    res.json(thought);
  } catch (err: any) {
    console.error("POST /thoughts/receive-claim ERROR:", err);
    res.status(500).json({ error: "Failed to claim thought" });
  }
});

router.get("/thoughts/my", async (req, res) => {
  const parsed = GetMyThoughtsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing userId" });
    return;
  }

  const auth = resolveAuthenticatedUserId(req, parsed.data.userId);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const { userId } = auth;

  try {
    await ensureAnonymousUser(userId);

    const thoughts = await db
      .select({
        id: thoughtsTable.id,
        userId: thoughtsTable.userId,
        content: thoughtsTable.content,
        mood: thoughtsTable.mood,
        feltThisCount: thoughtsTable.feltThisCount,
        madeThinkCount: thoughtsTable.madeThinkCount,
        createdAt: thoughtsTable.createdAt,
      })
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
      })),
    );
  } catch (err: any) {
    console.error("GET /thoughts/my ERROR:", err);
    res.status(500).json({ error: "Failed to load thoughts" });
  }
});

router.get("/thoughts/receive-count", async (req, res) => {
  const parsed = GetReceiveCountQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing userId" });
    return;
  }

  const auth = resolveAuthenticatedUserId(req, parsed.data.userId);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const { userId } = auth;
  const startOfDay = getStartOfUtcDay();

  try {
    await ensureAnonymousUser(userId);

    const [result] = await db
      .select({ count: count() })
      .from(receivesTable)
      .where(
        and(
          eq(receivesTable.userId, userId),
          gte(receivesTable.receivedAt, startOfDay),
        ),
      );

    const usedCount = Number(result?.count ?? 0);

    res.json({
      count: usedCount,
      limit: DAILY_RECEIVE_LIMIT,
      remaining: Math.max(0, DAILY_RECEIVE_LIMIT - usedCount),
    });
  } catch (err: any) {
    console.error("GET /thoughts/receive-count ERROR:", err);
    res.status(500).json({ error: "Failed to load receive count" });
  }
});

router.post("/thoughts/:id/react", reactRateLimit, async (req, res) => {
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
  const auth = resolveAuthenticatedUserId(req, bodyParsed.data.userId);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const { userId } = auth;
  const { reactionType } = bodyParsed.data;

  try {
    await ensureAnonymousUser(userId);

    const [thought] = await db
      .select({
        id: thoughtsTable.id,
        userId: thoughtsTable.userId,
        content: thoughtsTable.content,
        mood: thoughtsTable.mood,
        feltThisCount: thoughtsTable.feltThisCount,
        madeThinkCount: thoughtsTable.madeThinkCount,
        createdAt: thoughtsTable.createdAt,
      })
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
          eq(reactionsTable.reactionType, reactionType),
        ),
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

    await db.insert(reactionsTable).values({
      userId,
      thoughtId: id,
      reactionType,
    });

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
      .returning({
        id: thoughtsTable.id,
        userId: thoughtsTable.userId,
        content: thoughtsTable.content,
        mood: thoughtsTable.mood,
        feltThisCount: thoughtsTable.feltThisCount,
        madeThinkCount: thoughtsTable.madeThinkCount,
        createdAt: thoughtsTable.createdAt,
      });

    res.json({
      id: updated.id,
      userId: updated.userId,
      content: updated.content,
      mood: updated.mood,
      feltThisCount: updated.feltThisCount,
      madeThinkCount: updated.madeThinkCount,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err: any) {
    console.error("POST /thoughts/:id/react ERROR:", err);
    res.status(500).json({ error: "Failed to react to thought" });
  }
});

const VALID_REPORT_CATEGORIES = ["harmful", "abusive", "inappropriate"] as const;
type ReportCategory = (typeof VALID_REPORT_CATEGORIES)[number];

router.post("/thoughts/:id/report", reportRateLimit, async (req, res) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid thought id" });
    return;
  }

  const auth = resolveAuthenticatedUserId(req, req.body?.userId);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }
  const { userId } = auth;

  const rawCategory = req.body?.category;
  const category: ReportCategory = VALID_REPORT_CATEGORIES.includes(rawCategory)
    ? rawCategory
    : "inappropriate";
  const reactionType = `report:${category}`;

  try {
    await ensureAnonymousUser(userId);

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

    await db.insert(reactionsTable).values({
      userId,
      thoughtId: id,
      reactionType,
    });

    res.status(201).json({ reported: true });
  } catch (err: any) {
    console.error("POST /thoughts/:id/report ERROR:", err);
    res.status(500).json({ error: "Failed to report thought" });
  }
});

export default router;

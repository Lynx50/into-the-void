import { Router, type IRouter } from "express";
import { db, anonymousUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createSessionToken,
  generateAnonymousUserId,
  isValidAnonymousUserId,
} from "../lib/session";

const router: IRouter = Router();

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

router.post("/session", async (req, res) => {
  const requestedUserId = req.body?.userId;
  const safeRequestedUserId =
    typeof requestedUserId === "string" && isValidAnonymousUserId(requestedUserId)
      ? requestedUserId
      : null;

  const userId = safeRequestedUserId ?? generateAnonymousUserId();

  try {
    await ensureAnonymousUser(userId);

    res.status(201).json({
      userId,
      sessionToken: createSessionToken(userId),
    });
  } catch (error) {
    console.error("POST /session ERROR:", error);
    res.status(500).json({ error: "Failed to create anonymous session" });
  }
});

export default router;

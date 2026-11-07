import { Router, type IRouter } from "express";
import { db, notificationDevicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveSessionUserId } from "../lib/session";

const router: IRouter = Router();

router.post("/notifications/device", async (req, res) => {
  const userId = resolveSessionUserId(req);
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const platform = req.body?.platform === "ios" ? "ios" : "android";
  if (!userId || token.length < 20 || token.length > 4096) {
    res.status(400).json({ error: "Invalid notification registration" });
    return;
  }

  try {
    await db
      .insert(notificationDevicesTable)
      .values({
        userId,
        token,
        platform,
        voidNotificationsEnabled: true,
      })
      .onConflictDoUpdate({
        target: notificationDevicesTable.token,
        set: {
          userId,
          platform,
          voidNotificationsEnabled: true,
          updatedAt: new Date(),
        },
      });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Could not register notifications" });
  }
});

router.post("/notifications/void-preference", async (req, res) => {
  const userId = resolveSessionUserId(req);
  const enabled = req.body?.enabled;
  if (!userId || typeof enabled !== "boolean") {
    res.status(400).json({ error: "Invalid notification preference" });
    return;
  }

  try {
    await db
      .update(notificationDevicesTable)
      .set({ voidNotificationsEnabled: enabled, updatedAt: new Date() })
      .where(eq(notificationDevicesTable.userId, userId));
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Could not update notification preference" });
  }
});

export default router;

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  notificationDevicesTable,
  reactionNotificationDeliveriesTable,
  thoughtDeliveryNotificationDeliveriesTable,
} from "@workspace/db";
import { logger } from "./logger";
import {
  reactionNotificationBody,
  isReactionNotificationEligible,
  isThoughtDeliveryNotificationEligible,
  THOUGHT_REACHED_NOTIFICATION_BODY,
  type PositiveReactionType,
} from "./reaction-notification-copy";

export type { PositiveReactionType } from "./reaction-notification-copy";

function firebaseCredential() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return cert({
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        });
      }
    } catch {
      return null;
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!projectId || !clientEmail || !privateKey) return null;
  return cert({ projectId, clientEmail, privateKey });
}

function messagingClient() {
  if (getApps().length === 0) {
    const credential = firebaseCredential();
    if (!credential) return null;
    initializeApp({ credential });
  }
  return getMessaging();
}

function isInvalidTokenError(code?: string): boolean {
  return (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token" ||
    code === "messaging/invalid-argument"
  );
}

async function sendAnonymousNotification(input: {
  thoughtOwnerId: string;
  body: string;
  category: "reaction" | "thought_reached";
}): Promise<"sent" | "failed" | "recipient_disabled" | "sender_unconfigured"> {
  const devices = await db
    .select({ token: notificationDevicesTable.token })
    .from(notificationDevicesTable)
    .where(
      and(
        eq(notificationDevicesTable.userId, input.thoughtOwnerId),
        eq(notificationDevicesTable.voidNotificationsEnabled, true),
      ),
    );

  const messaging = messagingClient();
  if (!messaging) return "sender_unconfigured";
  if (devices.length === 0) return "recipient_disabled";

  const result = await messaging.sendEachForMulticast({
    tokens: devices.map(({ token }) => token),
    notification: { title: "Into the Void", body: input.body },
    data: { category: input.category, destination: "orbit" },
    android: {
      priority: "normal",
      notification: { channelId: "void-connections", sound: "default" },
    },
  });

  const invalidTokens = result.responses.flatMap((response, index) =>
    !response.success && isInvalidTokenError(response.error?.code)
      ? [devices[index].token]
      : [],
  );
  if (invalidTokens.length > 0) {
    await db
      .delete(notificationDevicesTable)
      .where(inArray(notificationDevicesTable.token, invalidTokens));
  }

  return result.successCount > 0 ? "sent" : "failed";
}

export async function sendReactionNotification(input: {
  reactionId: number;
  reactionType: PositiveReactionType;
  thoughtOwnerId: string;
  reactorId: string;
}): Promise<void> {
  if (
    !isReactionNotificationEligible({
      isNewReaction: true,
      thoughtOwnerId: input.thoughtOwnerId,
      reactorId: input.reactorId,
    })
  ) {
    return;
  }

  const [delivery] = await db
    .insert(reactionNotificationDeliveriesTable)
    .values({ reactionId: input.reactionId })
    .onConflictDoNothing()
    .returning({ id: reactionNotificationDeliveriesTable.id });

  // A delivery record already exists for this reaction, so this is a replay.
  if (!delivery) return;

  try {
    const status = await sendAnonymousNotification({
      thoughtOwnerId: input.thoughtOwnerId,
      body: reactionNotificationBody(input.reactionType),
      category: "reaction",
    });
    await db
      .update(reactionNotificationDeliveriesTable)
      .set({
        status,
        sentAt: status === "sent" ? new Date() : null,
      })
      .where(eq(reactionNotificationDeliveriesTable.id, delivery.id));
  } catch {
    await db
      .update(reactionNotificationDeliveriesTable)
      .set({ status: "failed" })
      .where(eq(reactionNotificationDeliveriesTable.id, delivery.id));
    logger.warn("Reaction notification delivery failed");
  }
}

export async function sendThoughtReachedNotification(input: {
  receiveId: number;
  thoughtOwnerId: string;
  recipientId: string;
  isGenuineUserThought: boolean;
}): Promise<void> {
  if (
    !isThoughtDeliveryNotificationEligible({
      isNewReceive: true,
      isGenuineUserThought: input.isGenuineUserThought,
      thoughtOwnerId: input.thoughtOwnerId,
      recipientId: input.recipientId,
    })
  ) {
    return;
  }

  const [delivery] = await db
    .insert(thoughtDeliveryNotificationDeliveriesTable)
    .values({ receiveId: input.receiveId })
    .onConflictDoNothing()
    .returning({ id: thoughtDeliveryNotificationDeliveriesTable.id });
  if (!delivery) return;

  try {
    const status = await sendAnonymousNotification({
      thoughtOwnerId: input.thoughtOwnerId,
      body: THOUGHT_REACHED_NOTIFICATION_BODY,
      category: "thought_reached",
    });
    await db
      .update(thoughtDeliveryNotificationDeliveriesTable)
      .set({ status, sentAt: status === "sent" ? new Date() : null })
      .where(eq(thoughtDeliveryNotificationDeliveriesTable.id, delivery.id));
  } catch {
    await db
      .update(thoughtDeliveryNotificationDeliveriesTable)
      .set({ status: "failed" })
      .where(eq(thoughtDeliveryNotificationDeliveriesTable.id, delivery.id));
    logger.warn("Thought delivery notification failed");
  }
}

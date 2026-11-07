import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const anonymousUsersTable = pgTable("anonymous_users", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AnonymousUser = typeof anonymousUsersTable.$inferSelect;

export const thoughtsTable = pgTable("thoughts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  mood: text("mood"),
  category: text("category"),
  moderationStatus: text("moderation_status").notNull().default("active"),
  moderationReason: text("moderation_reason"),
  moderationUpdatedAt: timestamp("moderation_updated_at", {
    withTimezone: true,
  }),
  moderationRuleVersion: text("moderation_rule_version"),
  moderationAuditId: text("moderation_audit_id"),
  feltThisCount: integer("felt_this_count").notNull().default(0),
  madeThinkCount: integer("made_think_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertThoughtSchema = createInsertSchema(thoughtsTable).omit({
  id: true,
  moderationStatus: true,
  moderationReason: true,
  moderationUpdatedAt: true,
  moderationRuleVersion: true,
  moderationAuditId: true,
  feltThisCount: true,
  madeThinkCount: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertThought = z.infer<typeof insertThoughtSchema>;
export type Thought = typeof thoughtsTable.$inferSelect;

export const dailyThoughtSelectionsTable = pgTable("daily_thought_selections", {
  dateUtc: date("date_utc").primaryKey(),
  thoughtId: integer("thought_id")
    .notNull()
    .unique()
    .references(() => thoughtsTable.id, { onDelete: "restrict" }),
  selectedAt: timestamp("selected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  algorithmVersion: text("algorithm_version").notNull(),
  selectionMode: text("selection_mode").notNull(),
  requesterExcluded: boolean("requester_excluded").notNull().default(false),
  auditMetadata: jsonb("audit_metadata")
    .$type<{
      candidateCount: number;
      shortlistCount: number;
      authorCooldownApplied: boolean;
    }>()
    .notNull(),
});

export type DailyThoughtSelection =
  typeof dailyThoughtSelectionsTable.$inferSelect;

export const receivesTable = pgTable("receives", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  thoughtId: integer("thought_id").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Receive = typeof receivesTable.$inferSelect;

export const reactionsTable = pgTable("reactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  thoughtId: integer("thought_id").notNull(),
  reactionType: text("reaction_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Reaction = typeof reactionsTable.$inferSelect;

export const notificationDevicesTable = pgTable(
  "notification_devices",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    token: text("token").notNull(),
    platform: text("platform").notNull().default("android"),
    voidNotificationsEnabled: boolean("void_notifications_enabled")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("notification_devices_token_unique").on(table.token)],
);

export const reactionNotificationDeliveriesTable = pgTable(
  "reaction_notification_deliveries",
  {
    id: serial("id").primaryKey(),
    reactionId: integer("reaction_id")
      .notNull()
      .references(() => reactionsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("reaction_notification_delivery_reaction_unique").on(
      table.reactionId,
    ),
  ],
);

export const thoughtDeliveryNotificationDeliveriesTable = pgTable(
  "thought_delivery_notification_deliveries",
  {
    id: serial("id").primaryKey(),
    receiveId: integer("receive_id")
      .notNull()
      .references(() => receivesTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("thought_delivery_notification_receive_unique").on(
      table.receiveId,
    ),
  ],
);

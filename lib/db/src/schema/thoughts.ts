import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const anonymousUsersTable = pgTable("anonymous_users", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AnonymousUser = typeof anonymousUsersTable.$inferSelect;

export const thoughtsTable = pgTable("thoughts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  mood: text("mood"),
  category: text("category"),
  feltThisCount: integer("felt_this_count").notNull().default(0),
  madeThinkCount: integer("made_think_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertThoughtSchema = createInsertSchema(thoughtsTable).omit({
  id: true,
  feltThisCount: true,
  madeThinkCount: true,
  createdAt: true,
});
export type InsertThought = z.infer<typeof insertThoughtSchema>;
export type Thought = typeof thoughtsTable.$inferSelect;

export const receivesTable = pgTable("receives", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  thoughtId: integer("thought_id").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Receive = typeof receivesTable.$inferSelect;

export const reactionsTable = pgTable("reactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  thoughtId: integer("thought_id").notNull(),
  reactionType: text("reaction_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Reaction = typeof reactionsTable.$inferSelect;

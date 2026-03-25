import { pgTable, serial, text, timestamp, integer, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const sourcesTable = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  rssUrl: text("rss_url"),
});

export const insertSourceSchema = createInsertSchema(sourcesTable).omit({ id: true });
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type Source = typeof sourcesTable.$inferSelect;

export const newsTable = pgTable("news", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").references(() => sourcesTable.id),
  title: text("title").notNull(),
  url: text("url").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  summary: text("summary"),
  rawText: text("raw_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNewsSchema = createInsertSchema(newsTable).omit({ id: true, createdAt: true });
export type InsertNews = z.infer<typeof insertNewsSchema>;
export type News = typeof newsTable.$inferSelect;

export const tagsTable = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const insertTagSchema = createInsertSchema(tagsTable).omit({ id: true });
export type InsertTag = z.infer<typeof insertTagSchema>;
export type Tag = typeof tagsTable.$inferSelect;

export const newsTagsTable = pgTable(
  "news_tags",
  {
    newsId: integer("news_id").notNull().references(() => newsTable.id, { onDelete: "cascade" }),
    tagId: integer("tag_id").notNull().references(() => tagsTable.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.newsId, table.tagId] })],
);

export const userTagSubscriptionsTable = pgTable(
  "user_tag_subscriptions",
  {
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    tagId: integer("tag_id").notNull().references(() => tagsTable.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tagId] })],
);

export const userEventsTable = pgTable("user_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserEventSchema = createInsertSchema(userEventsTable).omit({ id: true, createdAt: true });
export type InsertUserEvent = z.infer<typeof insertUserEventSchema>;
export type UserEvent = typeof userEventsTable.$inferSelect;

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// AI Provider - a free AI service that can be used
export const providers = pgTable("providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'chat' | 'reasoning' | 'scraping' | 'browser' | 'captcha' | 'tts' | 'vision'
  endpoint: text("endpoint").notNull(),
  apiKeyRequired: boolean("api_key_required").default(false),
  apiKey: text("api_key"),
  model: text("model"),
  status: text("status").notNull().default("unknown"), // 'online' | 'offline' | 'degraded' | 'unknown'
  latencyMs: integer("latency_ms"),
  rateLimit: text("rate_limit"),
  description: text("description"),
  config: text("config"), // JSON string for extra config
});

export const insertProviderSchema = createInsertSchema(providers).omit({ id: true });
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providers.$inferSelect;

// Task - an orchestrated job
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'chat' | 'scrape' | 'browse' | 'register' | 'plan' | 'multi'
  status: text("status").notNull().default("pending"), // 'pending' | 'running' | 'completed' | 'failed'
  input: text("input").notNull(),
  output: text("output"),
  providerId: text("provider_id"),
  steps: text("steps"), // JSON string of execution steps
  createdAt: text("created_at").default(sql`now()`),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// Chat messages
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  providerId: text("provider_id"),
  model: text("model"),
  timestamp: text("timestamp").default(sql`now()`),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, timestamp: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

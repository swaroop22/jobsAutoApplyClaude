import { pgTable, uuid, text, boolean, integer, date, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users";
import { jobs } from "./jobs";

export const profileQaAnswers = pgTable(
  "profile_qa_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    questionText: text("question_text").notNull(),
    questionHash: text("question_hash").notNull(),
    answerText: text("answer_text").notNull(),
    isSensitive: boolean("is_sensitive").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("profile_qa_user_hash_unique").on(table.userId, table.questionHash)],
);

export const outreachContacts = pgTable("outreach_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  sourceUrl: text("source_url"),
  emailDraft: text("email_draft"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  oauthProvider: text("oauth_provider"), // 'gmail' | 'outlook'
});

export const inboxConnections = pgTable("inbox_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'gmail' | 'outlook'
  oauthRefreshTokenEncrypted: text("oauth_refresh_token_encrypted").notNull(),
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
  isActive: boolean("is_active").default(true),
});

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    applicationsUsed: integer("applications_used").notNull().default(0),
    creditsRemaining: integer("credits_remaining").notNull().default(0),
  },
  (table) => [unique("usage_counters_user_period_unique").on(table.userId, table.periodStart)],
);

export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  creditsDelta: integer("credits_delta").notNull(),
  reason: text("reason").notNull(), // 'purchase' | 'application_used' | 'refund'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

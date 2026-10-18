import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { profiles } from "./profiles";
import { jobs } from "./jobs";

export type FormAnswers = Record<string, string>;

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").notNull().references(() => jobs.id),
    profileId: uuid("profile_id").notNull().references(() => profiles.id),
    mode: text("mode").notNull(), // 'review' | 'autopilot' | 'extension'
    status: text("status").notNull().default("pending_review"),
    // pending_review | approved | submitted | failed | viewed | interview | offer | rejected
    tailoredResumeUrl: text("tailored_resume_url"),
    coverLetterText: text("cover_letter_text"),
    formAnswersJson: jsonb("form_answers_json").$type<FormAnswers>(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    screenshotUrl: text("screenshot_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_applications_user_status").on(table.userId, table.status)],
);

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;

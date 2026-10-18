import { pgTable, uuid, numeric, text, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users";
import { profiles } from "./profiles";
import { jobs } from "./jobs";

export const jobMatches = pgTable(
  "job_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").notNull().references(() => profiles.id),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    overallScore: numeric("overall_score", { precision: 5, scale: 2 }).notNull(),
    skillsScore: numeric("skills_score", { precision: 5, scale: 2 }),
    seniorityScore: numeric("seniority_score", { precision: 5, scale: 2 }),
    locationScore: numeric("location_score", { precision: 5, scale: 2 }),
    salaryScore: numeric("salary_score", { precision: 5, scale: 2 }),
    matchedSkills: text("matched_skills").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("job_matches_user_job_unique").on(table.userId, table.jobId)],
);

export type JobMatch = typeof jobMatches.$inferSelect;
export type NewJobMatch = typeof jobMatches.$inferInsert;

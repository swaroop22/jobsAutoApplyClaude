import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, vector, unique, index } from "drizzle-orm/pg-core";

export const jobSources = pgTable("job_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // 'greenhouse' | 'lever' | 'adzuna' | ...
  type: text("type").notNull(), // 'ats_api' | 'licensed_feed' | 'career_page'
  configJson: jsonb("config_json"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  isActive: boolean("is_active").notNull().default(true),
});

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").notNull().references(() => jobSources.id),
    externalId: text("external_id").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    location: text("location"),
    isRemote: boolean("is_remote"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    applyUrl: text("apply_url").notNull(),
    atsType: text("ats_type"), // 'greenhouse' | 'lever' | 'ashby' | null
    postedAt: timestamp("posted_at", { withTimezone: true }),
    embedding: vector("embedding", { dimensions: 1536 }),
    dedupKey: text("dedup_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("jobs_source_external_unique").on(table.sourceId, table.externalId),
    index("idx_jobs_dedup").on(table.dedupKey),
  ],
);

export type JobSource = typeof jobSources.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

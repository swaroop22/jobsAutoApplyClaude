import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, vector, unique } from "drizzle-orm/pg-core";
import { users } from "./users";

// Structured shape stored in parsed_json — enforced at the application layer via Zod, not the DB.
export type ParsedProfile = {
  experience: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate: string | null;
    bullets: string[];
  }>;
  education: Array<{
    school: string;
    degree: string;
    field: string;
    graduationYear: number | null;
  }>;
  skills: string[];
  certifications: string[];
};

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    fullName: text("full_name"),
    phone: text("phone"),
    location: text("location"),
    remotePreference: text("remote_preference"), // remote | hybrid | onsite | any
    workAuthorization: text("work_authorization"),
    visaSponsorshipNeeded: boolean("visa_sponsorship_needed"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency").default("USD"),
    rawResumeUrl: text("raw_resume_url"),
    parsedJson: jsonb("parsed_json").$type<ParsedProfile>().notNull(),
    eeoJson: jsonb("eeo_json"),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("profiles_user_version_unique").on(table.userId, table.version)],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

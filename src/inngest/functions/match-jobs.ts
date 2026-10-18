import { desc, eq, cosineDistance, sql } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/db/client";
import { profiles, jobs, jobMatches } from "@/db/schema";
import type { ParsedProfile } from "@/db/schema/profiles";
import { embedProfileText } from "@/lib/ai/embeddings";
import { scoreMatch } from "@/lib/matching/score";

const TOP_N_CANDIDATES = 50;

function profileToEmbeddingText(parsedJson: ParsedProfile): string {
  const experience = parsedJson.experience
    .map((e) => `${e.title} at ${e.company}: ${e.bullets.join(" ")}`)
    .join("\n");
  return [
    parsedJson.skills.join(", "),
    experience,
    parsedJson.certifications.join(", "),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const matchJobsForProfile = inngest.createFunction(
  { id: "match-jobs-for-profile", retries: 2, triggers: [{ event: "profile/updated" }] },
  async ({ event, step }) => {
    const { profileId } = event.data as { profileId: string };

    const profile = await step.run("load-profile", async () => {
      const [row] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
      return row;
    });

    if (!profile) return { skipped: "profile-not-found" };

    const embedding = await step.run("embed-profile", async () => {
      return embedProfileText(profileToEmbeddingText(profile.parsedJson));
    });

    await step.run("persist-profile-embedding", async () => {
      await db.update(profiles).set({ embedding }).where(eq(profiles.id, profile.id));
    });

    const candidates = await step.run("find-candidate-jobs", async () => {
      const similarity = sql<number>`1 - (${cosineDistance(jobs.embedding, embedding)})`;
      return db
        .select({ job: jobs, similarity })
        .from(jobs)
        .orderBy(desc(similarity))
        .limit(TOP_N_CANDIDATES);
    });

    const matchCount = await step.run("score-and-upsert-matches", async () => {
      let count = 0;
      for (const { job, similarity } of candidates) {
        const scores = scoreMatch(profile, job, similarity);

        await db
          .insert(jobMatches)
          .values({
            userId: profile.userId,
            profileId: profile.id,
            jobId: job.id,
            overallScore: scores.overallScore.toFixed(2),
            skillsScore: scores.skillsScore.toFixed(2),
            seniorityScore: scores.seniorityScore.toFixed(2),
            locationScore: scores.locationScore.toFixed(2),
            salaryScore: scores.salaryScore.toFixed(2),
            matchedSkills: scores.matchedSkills,
          })
          .onConflictDoUpdate({
            target: [jobMatches.userId, jobMatches.jobId],
            set: {
              profileId: profile.id,
              overallScore: scores.overallScore.toFixed(2),
              skillsScore: scores.skillsScore.toFixed(2),
              seniorityScore: scores.seniorityScore.toFixed(2),
              locationScore: scores.locationScore.toFixed(2),
              salaryScore: scores.salaryScore.toFixed(2),
              matchedSkills: scores.matchedSkills,
            },
          });
        count++;
      }
      return count;
    });

    return { profileId: profile.id, matchesCreated: matchCount };
  },
);

// Re-matches all users whenever a fresh batch of jobs lands, so existing
// profiles see new postings without waiting on a profile edit.
export const matchJobsAfterIngest = inngest.createFunction(
  { id: "match-jobs-after-ingest", retries: 2, triggers: [{ event: "jobs/ingested" }] },
  async ({ step }) => {
    const latestProfileIds = await step.run("load-latest-profile-per-user", async () => {
      const rows = await db
        .select({ id: profiles.id, userId: profiles.userId })
        .from(profiles)
        .orderBy(desc(profiles.version));

      const seen = new Set<string>();
      const latest: string[] = [];
      for (const row of rows) {
        if (seen.has(row.userId)) continue;
        seen.add(row.userId);
        latest.push(row.id);
      }
      return latest;
    });

    await step.sendEvent(
      "trigger-rematch",
      latestProfileIds.map((profileId: string) => ({
        name: "profile/updated" as const,
        data: { profileId },
      })),
    );

    return { usersRematched: latestProfileIds.length };
  },
);

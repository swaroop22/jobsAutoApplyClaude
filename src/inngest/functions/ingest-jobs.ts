import { cron } from "inngest";
import { eq, sql } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/db/client";
import { jobSources, jobs } from "@/db/schema";
import { fetchGreenhouseJobs } from "@/lib/ingestion/greenhouse";
import { fetchLeverJobs } from "@/lib/ingestion/lever";
import { embedJobDescriptions } from "@/lib/ai/embeddings";

type JobSourceConfig = { boardToken: string } | { site: string };

async function fetchJobsForSource(
  type: string,
  config: JobSourceConfig,
): Promise<Awaited<ReturnType<typeof fetchGreenhouseJobs>>> {
  if (type === "greenhouse" && "boardToken" in config) {
    return fetchGreenhouseJobs(config.boardToken);
  }
  if (type === "lever" && "site" in config) {
    return fetchLeverJobs(config.site);
  }
  throw new Error(`Unsupported job source type/config: ${type}`);
}

export const ingestJobs = inngest.createFunction(
  { id: "ingest-jobs", retries: 2, triggers: [cron("0 */6 * * *")] },
  async ({ step }) => {
    const sources = await step.run("load-active-sources", async () => {
      return db.select().from(jobSources).where(eq(jobSources.isActive, true));
    });

    let totalUpserted = 0;

    for (const source of sources) {
      const result = await step.run(`sync-${source.name}`, async () => {
        try {
          const fetched = await fetchJobsForSource(
            source.type,
            source.configJson as JobSourceConfig,
          );

          if (fetched.length === 0) {
            await db
              .update(jobSources)
              .set({ lastSyncedAt: new Date(), lastError: null })
              .where(eq(jobSources.id, source.id));
            return { source: source.name, upserted: 0 };
          }

          const embeddings = await embedJobDescriptions(
            fetched.map((job) => `${job.title}\n\n${job.description}`),
          );

          for (let i = 0; i < fetched.length; i++) {
            const job = fetched[i];
            await db
              .insert(jobs)
              .values({ ...job, sourceId: source.id, embedding: embeddings[i] })
              .onConflictDoUpdate({
                target: [jobs.sourceId, jobs.externalId],
                set: {
                  title: job.title,
                  description: job.description,
                  location: job.location,
                  isRemote: job.isRemote,
                  applyUrl: job.applyUrl,
                  postedAt: job.postedAt,
                  embedding: embeddings[i],
                },
              });
          }

          await db
            .update(jobSources)
            .set({ lastSyncedAt: new Date(), lastError: null })
            .where(eq(jobSources.id, source.id));

          return { source: source.name, upserted: fetched.length };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await db
            .update(jobSources)
            .set({ lastError: message })
            .where(eq(jobSources.id, source.id));
          throw err;
        }
      });
      totalUpserted += result.upserted;
    }

    if (totalUpserted > 0) {
      await step.sendEvent("notify-jobs-ingested", {
        name: "jobs/ingested",
        data: { count: totalUpserted },
      });
    }

    return { sourcesProcessed: sources.length, totalUpserted };
  },
);

// Deletes jobs older than 60 days that were never matched, to keep the table lean.
export const pruneStaleJobs = inngest.createFunction(
  { id: "prune-stale-jobs", retries: 1, triggers: [cron("0 3 * * *")] },
  async ({ step }) => {
    await step.run("delete-stale", async () => {
      await db.execute(
        sql`DELETE FROM jobs WHERE posted_at < now() - interval '60 days'`,
      );
    });
  },
);

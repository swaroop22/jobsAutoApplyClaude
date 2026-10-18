import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, jobs, profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { inngest } from "@/inngest/client";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({ application: applications, job: jobs })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(eq(applications.userId, user.id))
    .orderBy(desc(applications.createdAt));

  return NextResponse.json({ applications: rows });
}

const createSchema = z.object({
  jobId: z.string().uuid(),
  mode: z.enum(["review", "autopilot", "extension"]).default("review"),
});

// Creates an application record and kicks off tailoring (resume + cover
// letter) as a background job. The application starts in "tailoring" status
// and the user reviews/approves the tailored content before anything is
// ever submitted to the employer (unless mode is "autopilot").
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId, mode } = createSchema.parse(await req.json());

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const [latestProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .orderBy(desc(profiles.version))
    .limit(1);

  if (!latestProfile) {
    return NextResponse.json(
      { error: "No profile exists yet. Upload a resume first." },
      { status: 400 },
    );
  }

  const [application] = await db
    .insert(applications)
    .values({
      userId: user.id,
      jobId: job.id,
      profileId: latestProfile.id,
      mode,
      status: "tailoring",
    })
    .returning();

  await inngest.send({ name: "application/tailor", data: { applicationId: application.id } });

  return NextResponse.json({ application });
}

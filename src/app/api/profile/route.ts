import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/current-user";
import { inngest } from "@/inngest/client";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [latest] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .orderBy(desc(profiles.version))
    .limit(1);

  if (!latest) {
    return NextResponse.json({ profile: null });
  }

  return NextResponse.json({ profile: latest });
}

const patchSchema = z.object({
  fullName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  remotePreference: z.enum(["remote", "hybrid", "onsite", "any"]).nullable().optional(),
  workAuthorization: z.string().nullable().optional(),
  visaSponsorshipNeeded: z.boolean().nullable().optional(),
  salaryMin: z.number().int().nullable().optional(),
  salaryMax: z.number().int().nullable().optional(),
  parsedJson: z
    .object({
      experience: z.array(
        z.object({
          title: z.string(),
          company: z.string(),
          startDate: z.string(),
          endDate: z.string().nullable(),
          bullets: z.array(z.string()),
        }),
      ),
      education: z.array(
        z.object({
          school: z.string(),
          degree: z.string(),
          field: z.string(),
          graduationYear: z.number().int().nullable(),
        }),
      ),
      skills: z.array(z.string()),
      certifications: z.array(z.string()),
    })
    .optional(),
});

// Edits create a new version rather than mutating the existing row, so past
// applications stay auditable against the profile that was actually used.
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = patchSchema.parse(await req.json());

  const [latest] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .orderBy(desc(profiles.version))
    .limit(1);

  if (!latest) {
    return NextResponse.json(
      { error: "No profile exists yet. Upload a resume first." },
      { status: 404 },
    );
  }

  const [updated] = await db
    .insert(profiles)
    .values({
      userId: user.id,
      version: latest.version + 1,
      fullName: body.fullName ?? latest.fullName,
      phone: body.phone ?? latest.phone,
      location: body.location ?? latest.location,
      remotePreference: body.remotePreference ?? latest.remotePreference,
      workAuthorization: body.workAuthorization ?? latest.workAuthorization,
      visaSponsorshipNeeded: body.visaSponsorshipNeeded ?? latest.visaSponsorshipNeeded,
      salaryMin: body.salaryMin ?? latest.salaryMin,
      salaryMax: body.salaryMax ?? latest.salaryMax,
      rawResumeUrl: latest.rawResumeUrl,
      parsedJson: body.parsedJson ?? latest.parsedJson,
      eeoJson: latest.eeoJson,
    })
    .returning();

  await inngest.send({ name: "profile/updated", data: { profileId: updated.id } });

  return NextResponse.json({ profile: updated });
}

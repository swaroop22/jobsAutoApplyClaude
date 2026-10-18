import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db/client";
import { users, profiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { uploadResumeFile } from "@/lib/storage/r2";
import { extractResumeText, UnsupportedResumeFormatError } from "@/lib/resume-text-extraction";
import { parseResumeText, toParsedProfileJson } from "@/lib/ai/parse-resume";

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("resume");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'resume' file in form data" }, { status: 400 });
  }

  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a PDF or DOCX." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds 10MB limit." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const { key } = await uploadResumeFile({
    userId: user.id,
    fileName: file.name,
    contentType: file.type,
    body: buffer,
  });

  let resumeText: string;
  try {
    resumeText = await extractResumeText({ buffer, contentType: file.type });
  } catch (err) {
    if (err instanceof UnsupportedResumeFormatError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  if (!resumeText.trim()) {
    return NextResponse.json(
      { error: "Could not extract any text from the uploaded file. It may be a scanned image without a text layer." },
      { status: 422 },
    );
  }

  const parsed = await parseResumeText(resumeText);

  const [latest] = await db
    .select({ version: profiles.version })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .orderBy(desc(profiles.version))
    .limit(1);

  const nextVersion = (latest?.version ?? 0) + 1;

  const [created] = await db
    .insert(profiles)
    .values({
      userId: user.id,
      version: nextVersion,
      fullName: parsed.fullName,
      phone: parsed.phone,
      location: parsed.location,
      remotePreference: parsed.remotePreference,
      workAuthorization: parsed.workAuthorization,
      visaSponsorshipNeeded: parsed.visaSponsorshipNeeded,
      salaryMin: parsed.salaryMin,
      salaryMax: parsed.salaryMax,
      rawResumeUrl: key,
      parsedJson: toParsedProfileJson(parsed),
    })
    .returning();

  return NextResponse.json({ profile: created });
}

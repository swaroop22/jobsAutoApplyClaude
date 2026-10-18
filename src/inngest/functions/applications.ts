import { eq } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/db/client";
import { applications, jobs, profiles, users } from "@/db/schema";
import { tailorResume, generateCoverLetter } from "@/lib/ai/tailor";
import { renderResumePdf } from "@/lib/resume-pdf";
import { uploadTailoredResumePdf, uploadApplicationScreenshot, getObjectBuffer } from "@/lib/storage/r2";
import { submitApplication, UnsupportedAtsError } from "@/lib/submission/dispatch";
import { NonRetriableError } from "inngest";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

async function loadApplicationContext(applicationId: string) {
  const [row] = await db
    .select({ application: applications, job: jobs, profile: profiles, user: users })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(profiles, eq(applications.profileId, profiles.id))
    .innerJoin(users, eq(applications.userId, users.id))
    .where(eq(applications.id, applicationId))
    .limit(1);
  return row ?? null;
}

// Generates the tailored resume + cover letter for a newly created
// application, then leaves it in "pending_review" (or triggers immediate
// submission for autopilot mode) — nothing is ever sent to an employer
// without this step producing reviewable, non-fabricated content first.
export const tailorApplication = inngest.createFunction(
  { id: "tailor-application", retries: 2, triggers: [{ event: "application/tailor" }] },
  async ({ event, step }) => {
    const { applicationId } = event.data as { applicationId: string };

    const context = await step.run("load-context", () => loadApplicationContext(applicationId));
    if (!context) throw new NonRetriableError(`Application ${applicationId} not found.`);
    const { application, job, profile, user } = context;

    const tailoredResume = await step.run("tailor-resume", () =>
      tailorResume(profile.parsedJson, job),
    );

    const coverLetterText = await step.run("generate-cover-letter", () =>
      generateCoverLetter(profile.parsedJson, job),
    );

    const resumeKey = await step.run("render-and-upload-resume-pdf", async () => {
      const pdfBytes = await renderResumePdf(tailoredResume, profile.parsedJson, {
        fullName: profile.fullName,
        phone: profile.phone,
        location: profile.location,
      });
      const { key } = await uploadTailoredResumePdf({
        userId: user.id,
        applicationId: application.id,
        body: pdfBytes,
      });
      return key;
    });

    const nextStatus = application.mode === "autopilot" ? "approved" : "pending_review";

    await step.run("save-tailored-content", async () => {
      await db
        .update(applications)
        .set({
          tailoredResumeUrl: resumeKey,
          coverLetterText,
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(applications.id, application.id));
    });

    if (application.mode === "autopilot") {
      await step.sendEvent("trigger-autopilot-submit", {
        name: "application/approved",
        data: { applicationId: application.id },
      });
    }

    return { applicationId: application.id, status: nextStatus };
  },
);

// Fires once an application is approved (manually via review mode, or
// automatically for autopilot). Launches a headless browser against the
// job's actual ATS-hosted application form and fills it with the tailored
// content — only for ATS types with a documented public form (Greenhouse,
// Lever). Every outcome is logged with a screenshot snapshot of what was
// submitted (or where it failed), satisfying the audit-trail requirement.
export const submitApprovedApplication = inngest.createFunction(
  { id: "submit-approved-application", retries: 1, triggers: [{ event: "application/approved" }] },
  async ({ event, step }) => {
    const { applicationId } = event.data as { applicationId: string };

    const context = await step.run("load-context", () => loadApplicationContext(applicationId));
    if (!context) throw new NonRetriableError(`Application ${applicationId} not found.`);
    const { application, job, profile, user } = context;

    if (!application.tailoredResumeUrl) {
      throw new NonRetriableError("Application has no tailored resume to submit.");
    }

    const result = await step.run("submit-via-playwright", async () => {
      const resumeBuffer = await getObjectBuffer(application.tailoredResumeUrl!);
      const tempPath = join(tmpdir(), `${randomUUID()}.pdf`);
      await writeFile(tempPath, resumeBuffer);

      try {
        return await submitApplication(job.atsType, {
          applyUrl: job.applyUrl,
          fullName: profile.fullName ?? "",
          email: user.email,
          phone: profile.phone,
          location: profile.location,
          linkedinUrl: null,
          workAuthorized:
            profile.workAuthorization != null
              ? !/sponsorship|not authorized|require/i.test(profile.workAuthorization)
              : null,
          needsSponsorship: profile.visaSponsorshipNeeded,
          resumeFilePath: tempPath,
          coverLetterText: application.coverLetterText ?? "",
        });
      } catch (err) {
        if (err instanceof UnsupportedAtsError) {
          return { status: "failed" as const, errorMessage: err.message, screenshot: Buffer.alloc(0) };
        }
        throw err;
      } finally {
        await unlink(tempPath).catch(() => {});
      }
    });

    const screenshotKey = await step.run("upload-screenshot", async () => {
      // step.run() JSON-serializes its return value, so a Buffer comes back
      // as its JSON form ({ type: "Buffer", data: number[] }) rather than a
      // live Buffer instance.
      const raw = result.screenshot as unknown as Buffer | { type: "Buffer"; data: number[] };
      const screenshot = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.data);
      if (screenshot.length === 0) return null;
      const { key } = await uploadApplicationScreenshot({
        userId: user.id,
        applicationId: application.id,
        body: screenshot,
      });
      return key;
    });

    await step.run("record-result", async () => {
      await db
        .update(applications)
        .set({
          status: result.status === "submitted" ? "submitted" : "failed",
          submittedAt: result.status === "submitted" ? new Date() : null,
          errorMessage: result.status === "failed" ? result.errorMessage : null,
          screenshotUrl: screenshotKey,
          updatedAt: new Date(),
        })
        .where(eq(applications.id, application.id));
    });

    return { applicationId: application.id, status: result.status };
  },
);

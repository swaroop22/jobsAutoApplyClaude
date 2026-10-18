import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { applications, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApplicationActions } from "./application-actions";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  tailoring: "outline",
  pending_review: "secondary",
  approved: "secondary",
  submitted: "default",
  failed: "destructive",
  viewed: "default",
  interview: "default",
  offer: "default",
  rejected: "destructive",
};

export default async function ApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const rows = await db
    .select({ application: applications, job: jobs })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(eq(applications.userId, user.id))
    .orderBy(desc(applications.createdAt));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Review tailored resumes and cover letters before anything is sent. Nothing is
          submitted to an employer until you approve it (except autopilot-mode jobs).
        </p>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No applications yet. Start one from the{" "}
          <a href="/jobs" className="underline">
            jobs
          </a>{" "}
          page.
        </p>
      )}

      <div className="space-y-4">
        {rows.map(({ application, job }) => (
          <Card key={application.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>{job.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{job.company}</p>
                </div>
                <Badge variant={STATUS_VARIANT[application.status] ?? "outline"} className="shrink-0">
                  {application.status.replace("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {application.status === "tailoring" && (
                <p className="text-sm text-muted-foreground">
                  Tailoring your resume and cover letter for this role...
                </p>
              )}

              {application.coverLetterText && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">Cover letter</summary>
                  <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                    {application.coverLetterText}
                  </p>
                </details>
              )}

              {application.errorMessage && (
                <p className="text-sm text-destructive">{application.errorMessage}</p>
              )}

              <ApplicationActions application={application} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

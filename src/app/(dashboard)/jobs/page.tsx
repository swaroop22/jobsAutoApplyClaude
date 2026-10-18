import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { jobMatches, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApplyButton } from "./apply-button";

function formatSalary(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) => `$${Math.round(n / 1000)}k`;
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)}`;
  return fmt((min ?? max)!);
}

export default async function JobsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const rows = await db
    .select({ match: jobMatches, job: jobs })
    .from(jobMatches)
    .innerJoin(jobs, eq(jobMatches.jobId, jobs.id))
    .where(eq(jobMatches.userId, user.id))
    .orderBy(desc(jobMatches.overallScore))
    .limit(100);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Job matches</h1>
        <p className="text-sm text-muted-foreground">
          Ranked by fit against your most recent profile. Scores update automatically
          after you edit your profile or new jobs are ingested.
        </p>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No matches yet. Upload a resume on your{" "}
          <a href="/profile" className="underline">
            profile page
          </a>{" "}
          — matching runs automatically once jobs have been ingested.
        </p>
      )}

      <div className="space-y-4">
        {rows.map(({ match, job }) => {
          const salary = formatSalary(job.salaryMin, job.salaryMax);
          return (
            <Card key={match.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{job.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {job.company}
                      {job.location ? ` · ${job.location}` : ""}
                      {job.isRemote ? " · Remote" : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {Number(match.overallScore).toFixed(0)}% match
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Skills {Number(match.skillsScore).toFixed(0)}</span>
                  <span>·</span>
                  <span>Seniority {Number(match.seniorityScore).toFixed(0)}</span>
                  <span>·</span>
                  <span>Location {Number(match.locationScore).toFixed(0)}</span>
                  <span>·</span>
                  <span>Salary {Number(match.salaryScore).toFixed(0)}</span>
                  {salary && (
                    <>
                      <span>·</span>
                      <span>{salary}</span>
                    </>
                  )}
                </div>
                {match.matchedSkills && match.matchedSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {match.matchedSkills.map((skill) => (
                      <Badge key={skill} variant="outline">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <a
                    href={job.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    View posting →
                  </a>
                  <ApplyButton jobId={job.id} atsType={job.atsType} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

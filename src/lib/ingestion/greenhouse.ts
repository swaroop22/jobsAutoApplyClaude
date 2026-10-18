import { stripHtml } from "./html";
import type { NewJob } from "@/db/schema/jobs";

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string } | null;
  content: string;
  updated_at: string;
};

type GreenhouseResponse = {
  jobs: GreenhouseJob[];
};

const REMOTE_PATTERN = /remote/i;

// configJson for a greenhouse job_sources row: { "boardToken": "stripe" }
export async function fetchGreenhouseJobs(
  boardToken: string,
): Promise<Array<Omit<NewJob, "sourceId">>> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`,
  );

  if (!res.ok) {
    throw new Error(`Greenhouse API error for board "${boardToken}": ${res.status}`);
  }

  const { jobs } = (await res.json()) as GreenhouseResponse;

  return jobs.map((job) => {
    const location = job.location?.name ?? null;
    const description = stripHtml(job.content);

    return {
      externalId: String(job.id),
      company: boardToken,
      title: job.title,
      description,
      location,
      isRemote: location ? REMOTE_PATTERN.test(location) : null,
      salaryMin: null,
      salaryMax: null,
      applyUrl: job.absolute_url,
      atsType: "greenhouse",
      postedAt: job.updated_at ? new Date(job.updated_at) : null,
      dedupKey: `greenhouse:${boardToken}:${job.id}`,
    };
  });
}

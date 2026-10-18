import type { NewJob } from "@/db/schema/jobs";

type LeverPosting = {
  id: string;
  text: string;
  categories: {
    location?: string;
    commitment?: string;
    team?: string;
  };
  workplaceType?: string; // "remote" | "hybrid" | "on-site"
  descriptionPlain: string;
  additionalPlain?: string;
  hostedUrl: string;
  createdAt: number; // epoch ms
};

// configJson for a lever job_sources row: { "site": "palantir" }
export async function fetchLeverJobs(
  site: string,
): Promise<Array<Omit<NewJob, "sourceId">>> {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`,
  );

  if (!res.ok) {
    throw new Error(`Lever API error for site "${site}": ${res.status}`);
  }

  const postings = (await res.json()) as LeverPosting[];

  return postings.map((posting) => {
    const description = [posting.descriptionPlain, posting.additionalPlain]
      .filter(Boolean)
      .join("\n\n");

    return {
      externalId: posting.id,
      company: site,
      title: posting.text,
      description,
      location: posting.categories.location ?? null,
      isRemote: posting.workplaceType ? posting.workplaceType === "remote" : null,
      salaryMin: null,
      salaryMax: null,
      applyUrl: posting.hostedUrl,
      atsType: "lever",
      postedAt: posting.createdAt ? new Date(posting.createdAt) : null,
      dedupKey: `lever:${site}:${posting.id}`,
    };
  });
}

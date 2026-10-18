import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { ingestJobs, pruneStaleJobs } from "@/inngest/functions/ingest-jobs";
import { matchJobsForProfile, matchJobsAfterIngest } from "@/inngest/functions/match-jobs";
import { tailorApplication, submitApprovedApplication } from "@/inngest/functions/applications";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ingestJobs,
    pruneStaleJobs,
    matchJobsForProfile,
    matchJobsAfterIngest,
    tailorApplication,
    submitApprovedApplication,
  ],
});

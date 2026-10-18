import { submitGreenhouseApplication } from "./greenhouse";
import { submitLeverApplication } from "./lever";
import type { SubmissionInput, SubmissionResult } from "./types";

export class UnsupportedAtsError extends Error {}

// Only ATS types with a documented public application form (filled via
// standard form fields, no anti-bot evasion) are supported in autopilot or
// review-approved submission. Anything else is routed to extension mode,
// where the user drives the actual submission in their own browser.
export async function submitApplication(
  atsType: string | null,
  input: SubmissionInput,
): Promise<SubmissionResult> {
  switch (atsType) {
    case "greenhouse":
      return submitGreenhouseApplication(input);
    case "lever":
      return submitLeverApplication(input);
    default:
      throw new UnsupportedAtsError(
        `No automated submitter for ATS type "${atsType}". Use extension mode for this job.`,
      );
  }
}

export type SubmissionInput = {
  applyUrl: string;
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  workAuthorized: boolean | null;
  needsSponsorship: boolean | null;
  resumeFilePath: string;
  coverLetterText: string;
};

export type SubmissionResult = {
  status: "submitted" | "failed";
  errorMessage?: string;
  screenshot: Buffer;
};

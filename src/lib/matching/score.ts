import type { Job } from "@/db/schema/jobs";
import type { Profile } from "@/db/schema/profiles";

// Inngest step.run() return values are JSON-serialized, turning Date fields
// into strings — scoreMatch only reads fields unaffected by that, so accept
// either shape rather than fighting Inngest's Jsonify<T> at every call site.
type ScorableJob = Omit<Job, "createdAt" | "postedAt"> & { createdAt?: unknown; postedAt?: unknown };
type ScorableProfile = Omit<Profile, "createdAt"> & { createdAt?: unknown };

export type MatchScores = {
  overallScore: number;
  skillsScore: number;
  seniorityScore: number;
  locationScore: number;
  salaryScore: number;
  matchedSkills: string[];
};

const SENIORITY_KEYWORDS: Array<{ level: number; patterns: RegExp[] }> = [
  { level: 0, patterns: [/\bintern(ship)?\b/i] },
  { level: 1, patterns: [/\bjunior\b/i, /\bentry[- ]level\b/i, /\bassociate\b/i] },
  { level: 3, patterns: [/\bsenior\b/i, /\bsr\.?\b/i] },
  { level: 4, patterns: [/\bstaff\b/i, /\bprincipal\b/i, /\blead\b/i] },
  { level: 5, patterns: [/\bdirector\b/i, /\bhead of\b/i, /\bvp\b/i, /\bvice president\b/i] },
];

function inferSeniorityLevel(title: string): number {
  for (const { level, patterns } of SENIORITY_KEYWORDS) {
    if (patterns.some((p) => p.test(title))) return level;
  }
  return 2; // mid-level default when no seniority keyword is present
}

function scoreSeniority(profile: ScorableProfile, job: ScorableJob): number {
  const mostRecentTitle = profile.parsedJson.experience[0]?.title ?? "";
  const profileLevel = inferSeniorityLevel(mostRecentTitle);
  const jobLevel = inferSeniorityLevel(job.title);
  const diff = Math.abs(profileLevel - jobLevel);
  return Math.max(0, 100 - diff * 25);
}

function scoreLocation(profile: ScorableProfile, job: ScorableJob): number {
  const preference = profile.remotePreference ?? "any";

  if (job.isRemote) {
    return preference === "remote" || preference === "any" ? 100 : 60;
  }

  if (preference === "remote") return 20;

  if (profile.location && job.location) {
    const profileLoc = profile.location.toLowerCase();
    const jobLoc = job.location.toLowerCase();
    if (jobLoc.includes(profileLoc) || profileLoc.includes(jobLoc)) return 100;
  }

  return preference === "any" ? 70 : 40;
}

function scoreSalary(profile: ScorableProfile, job: ScorableJob): number {
  if (job.salaryMin == null && job.salaryMax == null) return 50; // unknown, neutral

  const profileMin = profile.salaryMin ?? 0;
  const profileMax = profile.salaryMax ?? Number.MAX_SAFE_INTEGER;
  const jobMin = job.salaryMin ?? 0;
  const jobMax = job.salaryMax ?? Number.MAX_SAFE_INTEGER;

  const overlaps = jobMax >= profileMin && jobMin <= profileMax;
  if (overlaps) return 100;

  const gap = jobMax < profileMin ? profileMin - jobMax : jobMin - profileMax;
  const referencePoint = Math.max(profileMin, 1);
  const gapRatio = gap / referencePoint;
  return Math.max(0, Math.round(100 - gapRatio * 100));
}

function findMatchedSkills(profile: ScorableProfile, job: ScorableJob): string[] {
  const description = job.description.toLowerCase();
  return profile.parsedJson.skills.filter((skill) =>
    description.includes(skill.toLowerCase()),
  );
}

// cosineSimilarity is 1 - cosineDistance, precomputed by the caller from pgvector.
export function scoreMatch(profile: ScorableProfile, job: ScorableJob, cosineSimilarity: number): MatchScores {
  const skillsScore = Math.max(0, Math.min(100, Math.round(cosineSimilarity * 100)));
  const seniorityScore = scoreSeniority(profile, job);
  const locationScore = scoreLocation(profile, job);
  const salaryScore = scoreSalary(profile, job);

  const overallScore = Math.round(
    skillsScore * 0.5 + seniorityScore * 0.2 + locationScore * 0.2 + salaryScore * 0.1,
  );

  return {
    overallScore,
    skillsScore,
    seniorityScore,
    locationScore,
    salaryScore,
    matchedSkills: findMatchedSkills(profile, job),
  };
}

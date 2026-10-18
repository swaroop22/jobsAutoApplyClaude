import { z } from "zod";
import { claude, CLAUDE_MODEL } from "./claude";
import type { ParsedProfile } from "@/db/schema/profiles";
import type { Job } from "@/db/schema/jobs";

// Tailoring reorders/reweights the candidate's OWN experience and selects
// which existing bullets/skills to emphasize for a given job — it never
// invents experience, skills, or credentials not already in parsedJson.
export const tailoredResumeSchema = z.object({
  summary: z.string(),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      startDate: z.string(),
      endDate: z.string().nullable(),
      bullets: z.array(z.string()),
    }),
  ),
  skills: z.array(z.string()),
});

export type TailoredResume = z.infer<typeof tailoredResumeSchema>;

const TAILOR_RESUME_TOOL = {
  name: "submit_tailored_resume",
  description:
    "Submit the tailored resume content: a professional summary, reordered/filtered experience bullets, and a reordered skills list.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description: "2-3 sentence professional summary highlighting fit for this specific role.",
      },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            company: { type: "string" },
            startDate: { type: "string" },
            endDate: { type: ["string", "null"] },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["title", "company", "startDate", "endDate", "bullets"],
        },
      },
      skills: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "experience", "skills"],
  },
};

const RESUME_SYSTEM_PROMPT = `You tailor resumes for specific job postings without ever fabricating information.

Hard rules:
- You may ONLY use experience entries, bullets, and skills that already exist in the candidate's profile JSON provided to you. Do not invent new jobs, employers, dates, bullets, skills, or metrics.
- You MAY: reorder experience entries and bullets to foreground the most relevant ones, rephrase a bullet for clarity or conciseness (without changing its factual content or adding unstated numbers/outcomes), select a subset of skills that are most relevant to the job, and write an original 2-3 sentence professional summary that only references things present in the profile.
- Every "startDate", "endDate", "title", and "company" in your output must exactly match an existing experience entry from the input profile — you are only permitted to reorder entries and their bullets, not alter these fields.
- If the profile has no bullets or skills relevant to the job, include the existing ones rather than fabricating relevant-sounding ones.
- Do not add any skill that is not already present in the candidate's skills list.`;

export async function tailorResume(
  profile: ParsedProfile,
  job: Pick<Job, "title" | "company" | "description">,
): Promise<TailoredResume> {
  const message = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: RESUME_SYSTEM_PROMPT,
    tools: [TAILOR_RESUME_TOOL],
    tool_choice: { type: "tool", name: "submit_tailored_resume" },
    messages: [
      {
        role: "user",
        content: `Candidate profile (JSON):\n${JSON.stringify(profile)}\n\nTarget job:\nTitle: ${job.title}\nCompany: ${job.company}\nDescription:\n${job.description}\n\nTailor the resume content for this job.`,
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use block for resume tailoring.");
  }

  const result = tailoredResumeSchema.parse(toolUse.input);

  const validTitles = new Set(profile.experience.map((e) => `${e.title}|||${e.company}|||${e.startDate}`));
  for (const exp of result.experience) {
    const key = `${exp.title}|||${exp.company}|||${exp.startDate}`;
    if (!validTitles.has(key)) {
      throw new Error(
        `Tailored resume referenced an experience entry not present in the source profile: ${exp.title} at ${exp.company}`,
      );
    }
  }

  const validSkills = new Set(profile.skills.map((s) => s.toLowerCase()));
  for (const skill of result.skills) {
    if (!validSkills.has(skill.toLowerCase())) {
      throw new Error(`Tailored resume referenced a skill not present in the source profile: ${skill}`);
    }
  }

  return result;
}

const COVER_LETTER_SYSTEM_PROMPT = `You write concise, specific cover letters without ever fabricating information.

Hard rules:
- Only reference experience, skills, and accomplishments that are explicitly present in the candidate's profile JSON provided to you. Never invent employers, titles, dates, metrics, or achievements.
- Write 3-4 short paragraphs: an opening stating the role and genuine interest, one or two paragraphs connecting specific (real) experience to the job's stated needs, and a brief closing.
- Do not use generic filler phrases like "I am a hard worker" or "I am passionate about excellence" — be specific and grounded in the actual profile content.
- Output plain text only, no markdown formatting, no placeholder brackets like [Company Name] — fill in the real company and role name from the job details provided.`;

export async function generateCoverLetter(
  profile: ParsedProfile,
  job: Pick<Job, "title" | "company" | "description">,
): Promise<string> {
  const message = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: COVER_LETTER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Candidate profile (JSON):\n${JSON.stringify(profile)}\n\nTarget job:\nTitle: ${job.title}\nCompany: ${job.company}\nDescription:\n${job.description}\n\nWrite the cover letter.`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude did not return text content for cover letter generation.");
  }

  return textBlock.text.trim();
}

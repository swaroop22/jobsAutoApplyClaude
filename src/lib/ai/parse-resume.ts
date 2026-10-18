import { z } from "zod";
import { claude, CLAUDE_MODEL } from "./claude";
import type { ParsedProfile } from "@/db/schema/profiles";

export const parsedResumeSchema = z.object({
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  remotePreference: z.enum(["remote", "hybrid", "onsite", "any"]).nullable(),
  workAuthorization: z.string().nullable(),
  visaSponsorshipNeeded: z.boolean().nullable(),
  salaryMin: z.number().int().nullable(),
  salaryMax: z.number().int().nullable(),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      startDate: z.string(),
      endDate: z.string().nullable(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string(),
      field: z.string(),
      graduationYear: z.number().int().nullable(),
    }),
  ),
  skills: z.array(z.string()),
  certifications: z.array(z.string()),
});

export type ParsedResumeResult = z.infer<typeof parsedResumeSchema>;

const PARSE_RESUME_TOOL = {
  name: "submit_parsed_resume",
  description: "Submit the structured data extracted from the resume.",
  input_schema: {
    type: "object" as const,
    properties: {
      fullName: { type: ["string", "null"] },
      phone: { type: ["string", "null"] },
      location: { type: ["string", "null"] },
      remotePreference: {
        type: ["string", "null"],
        enum: ["remote", "hybrid", "onsite", "any", null],
      },
      workAuthorization: { type: ["string", "null"] },
      visaSponsorshipNeeded: { type: ["boolean", "null"] },
      salaryMin: { type: ["number", "null"] },
      salaryMax: { type: ["number", "null"] },
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
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            school: { type: "string" },
            degree: { type: "string" },
            field: { type: "string" },
            graduationYear: { type: ["number", "null"] },
          },
          required: ["school", "degree", "field", "graduationYear"],
        },
      },
      skills: { type: "array", items: { type: "string" } },
      certifications: { type: "array", items: { type: "string" } },
    },
    required: [
      "fullName",
      "phone",
      "location",
      "remotePreference",
      "workAuthorization",
      "visaSponsorshipNeeded",
      "salaryMin",
      "salaryMax",
      "experience",
      "education",
      "skills",
      "certifications",
    ],
  },
};

const SYSTEM_PROMPT = `You extract structured data from resumes with perfect fidelity.

Rules:
- Only extract information that is explicitly present in the resume text. Never invent, infer, or embellish job titles, employers, dates, skills, or credentials that are not written in the document.
- If a field is not present in the resume (e.g. salary expectations, work authorization, remote preference), return null for it rather than guessing.
- Normalize dates to "YYYY-MM" where possible; use the original text if the resume is vague (e.g. "Summer 2019").
- "endDate" should be null for current/ongoing roles.
- Do not deduplicate or merge skills that are phrased differently in the source — list skills as a clean, deduplicated set of the actual terms used in the resume.`;

export async function parseResumeText(resumeText: string): Promise<ParsedResumeResult> {
  const message = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [PARSE_RESUME_TOOL],
    tool_choice: { type: "tool", name: "submit_parsed_resume" },
    messages: [
      {
        role: "user",
        content: `Extract structured data from this resume:\n\n${resumeText}`,
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use block for resume parsing.");
  }

  return parsedResumeSchema.parse(toolUse.input);
}

export function toParsedProfileJson(result: ParsedResumeResult): ParsedProfile {
  return {
    experience: result.experience,
    education: result.education,
    skills: result.skills,
    certifications: result.certifications,
  };
}

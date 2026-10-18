import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ParsedProfile } from "@/db/schema/profiles";
import type { TailoredResume } from "@/lib/ai/tailor";

const PAGE_SIZE: [number, number] = [612, 792]; // US Letter, points
const MARGIN = 54;
const FONT_SIZE_BODY = 10;
const FONT_SIZE_NAME = 18;
const FONT_SIZE_SECTION = 12;
const LINE_HEIGHT = 13;

type ContactInfo = {
  fullName: string | null;
  phone: string | null;
  location: string | null;
};

export async function renderResumePdf(
  tailored: TailoredResume,
  profile: ParsedProfile,
  contact: ContactInfo,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage(PAGE_SIZE);
  let cursorY = PAGE_SIZE[1] - MARGIN;
  const contentWidth = PAGE_SIZE[0] - MARGIN * 2;

  function ensureSpace(linesNeeded: number) {
    if (cursorY - linesNeeded * LINE_HEIGHT < MARGIN) {
      page = doc.addPage(PAGE_SIZE);
      cursorY = PAGE_SIZE[1] - MARGIN;
    }
  }

  function wrapText(text: string, size: number, useFont = font): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (useFont.widthOfTextAtSize(candidate, size) > contentWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawLine(text: string, size: number, useFont = font, indent = 0) {
    ensureSpace(1);
    page.drawText(text, {
      x: MARGIN + indent,
      y: cursorY,
      size,
      font: useFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursorY -= LINE_HEIGHT;
  }

  function drawWrapped(text: string, size: number, useFont = font, indent = 0) {
    for (const line of wrapText(text, size, useFont)) {
      drawLine(line, size, useFont, indent);
    }
  }

  // Header
  drawLine(contact.fullName ?? "Candidate", FONT_SIZE_NAME, boldFont);
  const contactLine = [contact.location, contact.phone].filter(Boolean).join("  ·  ");
  if (contactLine) drawLine(contactLine, FONT_SIZE_BODY);
  cursorY -= LINE_HEIGHT * 0.5;

  // Summary
  drawLine("SUMMARY", FONT_SIZE_SECTION, boldFont);
  drawWrapped(tailored.summary, FONT_SIZE_BODY);
  cursorY -= LINE_HEIGHT * 0.5;

  // Experience
  drawLine("EXPERIENCE", FONT_SIZE_SECTION, boldFont);
  for (const exp of tailored.experience) {
    ensureSpace(2);
    drawLine(`${exp.title} — ${exp.company}`, FONT_SIZE_BODY, boldFont);
    drawLine(`${exp.startDate} – ${exp.endDate ?? "Present"}`, FONT_SIZE_BODY - 1);
    for (const bullet of exp.bullets) {
      drawWrapped(`•  ${bullet}`, FONT_SIZE_BODY, font, 8);
    }
    cursorY -= LINE_HEIGHT * 0.4;
  }

  // Education (unmodified by tailoring — pulled straight from the profile)
  if (profile.education.length > 0) {
    cursorY -= LINE_HEIGHT * 0.3;
    drawLine("EDUCATION", FONT_SIZE_SECTION, boldFont);
    for (const edu of profile.education) {
      const line = [edu.degree, edu.field].filter(Boolean).join(", ");
      drawLine(`${line} — ${edu.school}`, FONT_SIZE_BODY);
      if (edu.graduationYear) drawLine(String(edu.graduationYear), FONT_SIZE_BODY - 1);
    }
  }

  // Skills
  if (tailored.skills.length > 0) {
    cursorY -= LINE_HEIGHT * 0.3;
    drawLine("SKILLS", FONT_SIZE_SECTION, boldFont);
    drawWrapped(tailored.skills.join(", "), FONT_SIZE_BODY);
  }

  return doc.save();
}

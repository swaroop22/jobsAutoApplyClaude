import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export class UnsupportedResumeFormatError extends Error {}

export async function extractResumeText(params: {
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const { buffer, contentType } = params;

  if (contentType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (
    contentType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new UnsupportedResumeFormatError(
    `Unsupported resume content type: ${contentType}. Only PDF and DOCX are supported.`,
  );
}

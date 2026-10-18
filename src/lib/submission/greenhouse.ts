import { chromium } from "playwright";
import type { SubmissionInput, SubmissionResult } from "./types";

// Fills Greenhouse's standard job application form. Only interacts with the
// form fields the ATS itself exposes for applicants — no CAPTCHA solving, no
// bypassing of any access restriction. If a required field can't be located
// (templates vary per employer), this fails the submission for human review
// rather than guessing or forcing it through.
export async function submitGreenhouseApplication(
  input: SubmissionInput,
): Promise<SubmissionResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(input.applyUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    await fillIfPresent(page, /first name/i, input.fullName.split(" ")[0]);
    await fillIfPresent(page, /last name/i, input.fullName.split(" ").slice(1).join(" "));
    await fillIfPresent(page, /^email/i, input.email);
    if (input.phone) await fillIfPresent(page, /phone/i, input.phone);
    if (input.location) await fillIfPresent(page, /location/i, input.location);
    if (input.linkedinUrl) await fillIfPresent(page, /linkedin/i, input.linkedinUrl);

    const resumeInput = page.locator('input[type="file"]').first();
    if ((await resumeInput.count()) > 0) {
      await resumeInput.setInputFiles(input.resumeFilePath);
    } else {
      throw new Error("Could not locate a resume file upload field on the Greenhouse form.");
    }

    await fillIfPresent(page, /cover letter/i, input.coverLetterText);

    const submitButton = page.getByRole("button", { name: /submit application/i });
    if ((await submitButton.count()) === 0) {
      throw new Error("Could not locate the submit button on the Greenhouse form.");
    }

    await submitButton.click();
    await page.waitForTimeout(2000);

    const screenshotAfterSubmit = await page.screenshot({ fullPage: true });

    return { status: "submitted", screenshot: screenshotAfterSubmit };
  } catch (err) {
    const screenshot = await page.screenshot({ fullPage: true }).catch(() => Buffer.alloc(0));
    return {
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
      screenshot,
    };
  } finally {
    await browser.close();
  }
}

async function fillIfPresent(
  page: import("playwright").Page,
  labelPattern: RegExp,
  value: string,
): Promise<void> {
  const field = page.getByLabel(labelPattern).first();
  if ((await field.count()) > 0) {
    await field.fill(value);
  }
}

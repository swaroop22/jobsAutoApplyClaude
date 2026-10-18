import { chromium } from "playwright";
import type { SubmissionInput, SubmissionResult } from "./types";

// Fills Lever's standard /apply form. Same constraint as the Greenhouse
// submitter: only uses fields the form itself exposes, fails for human
// review rather than forcing a submission when a field can't be found.
export async function submitLeverApplication(input: SubmissionInput): Promise<SubmissionResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    const applyUrl = input.applyUrl.endsWith("/apply")
      ? input.applyUrl
      : `${input.applyUrl.replace(/\/$/, "")}/apply`;

    await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    await fillIfPresent(page, /full name/i, input.fullName);
    await fillIfPresent(page, /^email/i, input.email);
    if (input.phone) await fillIfPresent(page, /phone/i, input.phone);
    if (input.location) await fillIfPresent(page, /current location/i, input.location);
    if (input.linkedinUrl) await fillIfPresent(page, /linkedin/i, input.linkedinUrl);

    const resumeInput = page.locator('input[type="file"][name="resume"], input[type="file"]').first();
    if ((await resumeInput.count()) > 0) {
      await resumeInput.setInputFiles(input.resumeFilePath);
    } else {
      throw new Error("Could not locate a resume file upload field on the Lever form.");
    }

    const workAuthField = page.getByLabel(/legally authorized to work/i).first();
    if ((await workAuthField.count()) > 0 && input.workAuthorized != null) {
      await selectYesNo(page, workAuthField, input.workAuthorized);
    }

    const sponsorshipField = page.getByLabel(/require sponsorship/i).first();
    if ((await sponsorshipField.count()) > 0 && input.needsSponsorship != null) {
      await selectYesNo(page, sponsorshipField, input.needsSponsorship);
    }

    const submitButton = page.getByRole("button", { name: /submit application/i });
    if ((await submitButton.count()) === 0) {
      throw new Error("Could not locate the submit button on the Lever form.");
    }

    await submitButton.click();
    await page.waitForTimeout(2000);

    const screenshot = await page.screenshot({ fullPage: true });
    return { status: "submitted", screenshot };
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

async function selectYesNo(
  page: import("playwright").Page,
  field: import("playwright").Locator,
  value: boolean,
): Promise<void> {
  const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
  if (tagName === "select") {
    await field.selectOption(value ? "Yes" : "No");
  }
}

import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
async function capture(options) { if (process.env.SKIP_SCREENSHOTS !== "1") await page.screenshot(options); }
page.on("pageerror", (error) => errors.push(error.message));
mkdirSync("artifacts", { recursive: true });
const base = process.env.PREVIEW_URL || "http://localhost:5173";
async function login(role) {
  await page.goto(base);
  await page
    .getByRole("button", { name: `${role} account`, exact: true })
    .click();
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await page.getByRole("heading", { name: /Good/ }).waitFor();
  await page
    .getByText(
      "Evaluation workspace: All people and clinical content shown here are synthetic.",
      { exact: true },
    )
    .waitFor();
}
try {
  await login("Doctor");
  await capture({
    path: "artifacts/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("link", { name: "Medical records", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Read Annual wellness consultation",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Verify on-chain" }).click();
  await page.getByText("Integrity verified", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close panel" }).click();
  await page
    .getByRole("button", { name: "Add medical record", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Patient", exact: true })
    .selectOption({ label: "Alex Morgan" });
  await page
    .getByLabel("Record title", { exact: true })
    .fill("Evaluation follow-up review");
  await page
    .getByLabel("Clinical notes", { exact: true })
    .fill(
      "Synthetic browser evaluation. Follow-up care plan reviewed, with questions recorded for the next consultation.",
    );
  await page
    .getByRole("button", { name: "Save medical record", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Evaluation follow-up review/ })
    .first()
    .waitFor();
  await page
    .getByRole("link", { name: "Blockchain explorer", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Every block tells a care story." })
    .waitFor();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await page.getByRole("button", { name: "Live · pause view" }).click();
  await page.getByRole("button", { name: "Resume live view" }).click();
  await capture({
    path: "artifacts/network.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/#overview");
  await page
    .getByText(
      "Evaluation workspace: All people and clinical content shown here are synthetic.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Mobile document must not overflow",
  );
  await capture({
    path: "artifacts/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("link", { name: "Medical records", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Medical records", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login("Patient");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: /Care tasks/ })
    .click();
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page
    .getByLabel("What needs to happen?", { exact: true })
    .fill("Review evaluation visit notes");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  const complete = page.getByRole("button", {
    name: "Complete Review evaluation visit notes",
    exact: true,
  });
  await complete.click();
  await page
    .getByRole("button", {
      name: "Review evaluation visit notes completed",
      exact: true,
    })
    .waitFor();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await capture({
    path: "artifacts/patient.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(
    "Browser checks passed: doctor login, consent-scoped records, on-chain verification after restart, record creation, explorer controls, mobile navigation and overflow, patient login, task creation and completion.",
  );
} finally {
  await browser.close();
}

import { test, expect } from "@playwright/test";
import {
  clearEmulators,
  completeOnboarding,
  signIn,
} from "./fixtures/auth";

test.beforeEach(async ({ page }) => {
  await clearEmulators();
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/today");
  await page.getByRole("dialog", { name: /welcome back/i })
    .getByRole("button", { name: /start my day/i })
    .click();
});

test("Today renders all main sections", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Each section uses an uppercase eyebrow label inside an <h2>.
  // Scope to visible h2 elements to skip hidden sidebar/nav text duplicates.
  for (const label of [
    /^calendar$/i,
    /^workout$/i,
    /^habits$/i,
    /^todos$/i,
    /finances/i,
  ]) {
    await expect(
      page.getByRole("heading", { level: 2, name: label }).first(),
    ).toBeVisible();
  }
});

test("daily log note field persists across reload", async ({ page }) => {
  await page.getByRole("button", { name: /daily log/i }).click();
  const note = page.getByPlaceholder(/how did today feel/i);
  await note.fill("backlog feels heavy");
  await page.getByRole("button", { name: /save daily log/i }).click();
  await expect(page.getByRole("button", { name: /^saved$/i })).toBeVisible({
    timeout: 5_000,
  });

  await page.reload();
  await page.getByRole("button", { name: /daily log/i }).click();
  await expect(
    page.getByPlaceholder(/how did today feel/i),
  ).toHaveValue("backlog feels heavy");
});

test("inline mood picker writes to today's daily doc", async ({ page }) => {
  await page.getByRole("button", { name: /daily log/i }).click();
  const mood = page.getByRole("radiogroup", { name: /mood/i });
  await mood.getByRole("radio", { name: "4" }).click();
  await expect(mood.getByRole("radio", { name: "4" })).toBeChecked();
});

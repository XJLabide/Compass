import { test, expect } from "@playwright/test";
import { clearEmulators, signIn } from "./fixtures/auth";

test.beforeEach(async ({ page }) => {
  await clearEmulators();
  await signIn(page);
  await page.goto("/fitness");
});

test("logs a run from the fitness hub", async ({ page }) => {
  await page.getByRole("button", { name: /^log run$/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/log running activity/i)).toBeVisible();
  await dialog.getByLabel(/distance/i).fill("3.2");
  await dialog.getByLabel(/duration/i).fill("22");
  await dialog.getByRole("button", { name: /^log run$/i }).click();

  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("General")).toBeVisible();
  await expect(page.getByText("3.2 km").last()).toBeVisible();
});

test("logs a sport from the fitness hub", async ({ page }) => {
  await page.getByRole("button", { name: /^log sport$/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/log sports/i)).toBeVisible();
  await dialog.getByRole("button", { name: /^competitive match/i }).click();
  await dialog.getByLabel(/final score/i).fill("21-18");
  await dialog.getByLabel(/opponent/i).fill("Downtown Squad");
  await dialog.getByRole("button", { name: /log sport activity/i }).click();

  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Basketball")).toBeVisible();
  await expect(page.getByText("Sports", { exact: true })).toBeVisible();
});

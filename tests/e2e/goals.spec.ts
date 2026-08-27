import { test, expect } from "@playwright/test";
import { clearEmulators, signIn } from "./fixtures/auth";

test.beforeEach(async ({ page }) => {
  await clearEmulators();
  await signIn(page);
  await page.goto("/goals");
});

test("creates a life-area goal with automatic and manual signals", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible();
  await page.getByRole("button", { name: /^new goal$/i }).first().click();

  const dialog = page.getByRole("dialog", { name: /new goal/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Step 1 of 5: Area")).toBeVisible();
  await dialog.getByRole("button", { name: /^next$/i }).click();

  await page.getByLabel("Priority").fill("Reach 70 kg");
  await dialog.getByRole("button", { name: /^next$/i }).click();

  await page.locator("#primary-metric-source").selectOption("bodyweight");
  await page.locator("#primary-metric-target").fill("70");
  await dialog.getByRole("button", { name: /^next$/i }).click();

  await page
    .locator("#supporting-metric-source")
    .selectOption("workouts_per_week");
  await page.locator("#supporting-metric-target").fill("4");
  await dialog.getByRole("button", { name: /^next$/i }).click();
  await expect(dialog.getByText("Step 5 of 5: Finish")).toBeVisible();

  await page.getByLabel("First manual milestone").fill("Plan the next block");
  await dialog.getByTestId("create-goal-submit").click();
  await expect(dialog).not.toBeVisible();

  const fitness = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Fitness" }) });
  await expect(fitness.getByText("Reach 70 kg")).toBeVisible();
  await expect(fitness.getByText("Bodyweight")).toBeVisible();
  await expect(fitness.getByText("Workouts per week")).toBeVisible();
  await expect(fitness.getByText("Plan the next block")).toBeVisible();
});

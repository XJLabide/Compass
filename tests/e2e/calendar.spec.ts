import { test, expect, devices } from "@playwright/test";
import { clearEmulators, signIn } from "./fixtures/auth";

test.beforeEach(async ({ page }) => {
  await clearEmulators();
  await signIn(page);
});

test("loads from sidebar and manages calendar agenda items", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^calendar$/i }).click();
  await expect(page).toHaveURL(/\/calendar/);
  await expect(page.getByRole("heading", { name: "My Calendar" })).toBeVisible();

  await page.getByTestId("calendar-add-button").click();
  let dialog = page.getByRole("dialog", { name: /add calendar item/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^class$/i }).click();
  await dialog.getByLabel("Title").fill("Calculus lecture");
  await dialog.getByTestId("calendar-create-submit").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("selected-day-agenda")).toContainText(
    "Calculus lecture",
  );

  await page.getByTestId("calendar-add-button").click();
  dialog = page.getByRole("dialog", { name: /add calendar item/i });
  await dialog.getByLabel("Title").fill("Project review");
  await dialog.getByTestId("calendar-create-submit").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("selected-day-agenda")).toContainText(
    "Project review",
  );
  await expect(page.getByTestId("calendar-preview-Project review")).toBeVisible();
  await page.getByTestId("calendar-edit-Project review").click();
  dialog = page.getByRole("dialog", { name: /edit calendar item/i });
  await dialog.getByLabel("Title").fill("Team review");
  await dialog.getByTestId("calendar-create-submit").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("selected-day-agenda")).toContainText(
    "Team review",
  );
  await expect(page.getByTestId("calendar-preview-Team review")).toBeVisible();
  await expect(page.getByTestId("selected-day-agenda")).not.toContainText(
    "Project review",
  );

  await page.getByTestId("calendar-add-button").click();
  dialog = page.getByRole("dialog", { name: /add calendar item/i });
  await dialog.getByRole("button", { name: /^todo$/i }).click();
  await dialog.getByLabel("Title").fill("Submit homework");
  await dialog.getByLabel("Priority").selectOption("high");
  await dialog.getByTestId("calendar-create-submit").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("selected-day-agenda")).toContainText(
    "Submit homework",
  );

  const todoToggle = page.getByTestId("calendar-todo-toggle-Submit homework");
  await todoToggle.click();
  await expect(page.getByTestId("selected-day-agenda")).not.toContainText(
    "Submit homework",
  );

  await page.getByTestId("calendar-add-button").click();
  dialog = page.getByRole("dialog", { name: /add calendar item/i });
  await dialog.getByRole("button", { name: /^todo$/i }).click();
  await dialog.getByLabel("Title").fill("Submit final homework");
  await dialog.getByLabel("Priority").selectOption("medium");
  await dialog.getByTestId("calendar-create-submit").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("selected-day-agenda")).toContainText(
    "Submit final homework",
  );

  await page.getByTestId("calendar-delete-Team review").click();
  let confirmDialog = page.getByRole("dialog", { name: /delete event/i });
  await expect(confirmDialog).toContainText("Team review");
  await confirmDialog.getByRole("button", { name: /^delete$/i }).click();
  await expect(confirmDialog).not.toBeVisible();
  await expect(page.getByTestId("selected-day-agenda")).not.toContainText(
    "Team review",
  );

  await page.getByTestId("calendar-delete-Calculus lecture").click();
  confirmDialog = page.getByRole("dialog", { name: /delete class/i });
  await expect(confirmDialog).toContainText("Calculus lecture");
  await confirmDialog.getByRole("button", { name: /^delete$/i }).click();
  await expect(confirmDialog).not.toBeVisible();
  await expect(page.getByTestId("selected-day-agenda")).not.toContainText(
    "Calculus lecture",
  );

  await page.getByTestId("calendar-delete-Submit final homework").click();
  confirmDialog = page.getByRole("dialog", { name: /delete todo/i });
  await expect(confirmDialog).toContainText("Submit final homework");
  await confirmDialog.getByRole("button", { name: /^delete$/i }).click();
  await expect(confirmDialog).not.toBeVisible();
  await expect(page.getByTestId("selected-day-agenda")).not.toContainText(
    "Submit final homework",
  );
});

test("weekly class appears on matching weekday cells", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByTestId("calendar-add-button").click();
  const dialog = page.getByRole("dialog", { name: /add calendar item/i });
  await dialog.getByRole("button", { name: /^class$/i }).click();
  await dialog.getByLabel("Title").fill("Chemistry lab");
  await dialog.getByTestId("calendar-create-submit").click();
  await expect(dialog).not.toBeVisible();

  const todayIso = new Date().toISOString().slice(0, 10);
  await expect(page.getByTestId(`calendar-day-${todayIso}`)).toBeVisible();
  await expect(page.getByTestId("selected-day-agenda")).toContainText(
    "Chemistry lab",
  );
});

test.describe("mobile More navigation", () => {
  const pixel = devices["Pixel 7"];
  test.use({
    viewport: pixel.viewport,
    deviceScaleFactor: pixel.deviceScaleFactor,
    isMobile: pixel.isMobile,
    hasTouch: pixel.hasTouch,
    userAgent: pixel.userAgent,
  });

  test("calendar is available from More", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^more$/i }).click();
    const sheet = page.getByRole("dialog", { name: /more navigation/i });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: /^calendar$/i }).click();
    await expect(page).toHaveURL(/\/calendar/);
    await expect(
      page.getByRole("heading", { name: "My Calendar" }),
    ).toBeVisible();
  });
});

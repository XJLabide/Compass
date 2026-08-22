import { test, expect, type Page } from "@playwright/test";
import {
  clearEmulators,
  completeOnboarding,
  signIn,
  signInAs,
} from "./fixtures/auth";

async function openCashFlow(page: Page) {
  await page.getByRole("button", { name: /cash flow/i }).click();
}

async function signOut(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: /^sign out$/i }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}

test.describe("cash flow", () => {
  test.beforeEach(async ({ page }) => {
    await clearEmulators();
    await signIn(page);
    await completeOnboarding(page);
    await page.goto("/money");
    await openCashFlow(page);
  });

  test("add an expense and see it in This Month list", async ({ page }) => {
    await page.locator("#cashflow-amount").fill("12.50");
    await page.getByRole("button", { name: /log entry/i }).click();
    // Total updates and entry shows in the list.
    await expect(page.getByText(/12\.50/).first()).toBeVisible();
  });

  test("regression — add an income with no note succeeds", async ({ page }) => {
    // This used to throw "Function addDoc() called with invalid data (note: undefined)".
    await page.getByLabel("Type").selectOption("income");
    await page.locator("#cashflow-amount").fill("2000");
    await page.getByRole("button", { name: /log entry/i }).click();
    // Scope to the app's red error banner — Next adds a permanent
    // role="alert" route announcer.
    await expect(
      page.locator('[role="alert"]:not(#__next-route-announcer__)'),
    ).not.toBeVisible();
    await expect(page.getByText(/2,?000|2000\.00/).first()).toBeVisible();
  });

  test("add an expense WITH a note still works", async ({ page }) => {
    await page.locator("#cashflow-amount").fill("8");
    await page.getByPlaceholder(/note/i).fill("lunch");
    await page.getByRole("button", { name: /log entry/i }).click();
    await expect(page.getByText("lunch")).toBeVisible();
  });

  test("add a recurring fee and surface monthly commitment", async ({ page }) => {
    await page.goto("/settings");
    await page.getByPlaceholder(/name, e\.g\. spotify/i).fill("Spotify");
    await page.getByLabel(/recurring fee amount/i).fill("10");
    await page.getByRole("button", { name: /add recurring fee/i }).click();

    await expect(page.getByText("Spotify")).toBeVisible();
    await page.goto("/money");
    await openCashFlow(page);
    await expect(page.getByText("Spotify")).toBeVisible();
    await expect(page.getByText(/₱10\.00 committed monthly/i)).toBeVisible();
  });
});

test("portfolio holdings stay scoped to the signed-in account", async ({ page }) => {
  await clearEmulators();

  await signInAs(page, "finance-a@compass.test");
  await page.goto("/money");
  await expect(page.getByText("No portfolio positions yet.")).toBeVisible();

  await page.getByRole("button", { name: /^add position$/i }).click();
  await page.getByPlaceholder("Ticker symbol").fill("AAPL");
  await page.getByPlaceholder("0.00").fill("1234.56");
  await page.locator("form").getByRole("button", { name: /^add position$/i }).click();
  await expect(page.getByText("AAPL").first()).toBeVisible();
  await expect(page.getByText("1 Positions")).toBeVisible();

  await signOut(page);
  await signInAs(page, "finance-b@compass.test");
  await page.goto("/money");

  await expect(page.getByText("No portfolio positions yet.")).toBeVisible();
  await expect(page.getByText("0 Positions")).toBeVisible();
  await expect(page.getByText("AAPL")).not.toBeVisible();
});

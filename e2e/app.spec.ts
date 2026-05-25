import { test, expect } from "@playwright/test";

test("dashboard loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("bible search page loads", async ({ page }) => {
  await page.goto("/bible");
  await expect(page.getByRole("heading", { name: "Bible Search" })).toBeVisible();
});

test("service builder page loads", async ({ page }) => {
  await page.goto("/service");
  await expect(page.getByRole("heading", { name: "Service Builder" })).toBeVisible();
});

test("live presentation page loads", async ({ page }) => {
  await page.goto("/present");
  await expect(page.getByRole("heading", { name: "Live Presentation" })).toBeVisible();
});

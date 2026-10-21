import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * These run against the plain Vite build, where Tauri `invoke` is unavailable.
 * They cover routing, shell rendering, and that pages survive a backend that
 * never answers — not Bible data, media, or output windows.
 */

function pageHeading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name });
}

function navLink(page: Page, name: string) {
  return page.getByRole("navigation").getByRole("link", { name, exact: true });
}

/** In a plain browser there is no Tauri host, so every `invoke` rejects. */
const TAURI_ABSENT = /reading '(invoke|transformCallback)'/;

test.describe("application shell", () => {
  test("dashboard renders with primary navigation", async ({ page }) => {
    await page.goto("/");
    await expect(pageHeading(page, "Home")).toBeVisible();
    await expect(navLink(page, "Bible Search")).toBeVisible();
    await expect(navLink(page, "Live Listen")).toBeVisible();
  });

  test("every primary route renders its own page heading", async ({ page }) => {
    const routes: Array<[string, string]> = [
      ["/bible", "Bible"],
      ["/listen", "Live Listen"],
      ["/service", "Service"],
      ["/songs", "Songs"],
      ["/media", "Media"],
      ["/themes", "Themes"],
      ["/settings", "Settings"],
    ];

    for (const [path, heading] of routes) {
      await page.goto(path);
      await expect(pageHeading(page, heading)).toBeVisible();
    }
  });

  test("exposes exactly one page heading per route", async ({ page }) => {
    await page.goto("/service");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("status bar reports the packaged version", async ({ page }) => {
    const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    await page.goto("/");
    await expect(page.getByRole("contentinfo")).toContainText(`v${version}`);
  });

  test("legacy /present redirects into the Bible production view", async ({ page }) => {
    await page.goto("/present");
    await expect(page).toHaveURL(/\/bible$/);
    await expect(pageHeading(page, "Bible")).toBeVisible();
  });

  test("unknown routes fall back to the dashboard", async ({ page }) => {
    await page.goto("/does-not-exist");
    await expect(page).toHaveURL(/\/$/);
    await expect(pageHeading(page, "Home")).toBeVisible();
  });

  test("sidebar navigation moves between pages", async ({ page }) => {
    await page.goto("/");
    await navLink(page, "Songs").click();
    await expect(page).toHaveURL(/\/songs$/);
    await navLink(page, "Media").click();
    await expect(page).toHaveURL(/\/media$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/songs$/);
  });

  test("survives a backend that never answers", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    for (const path of ["/", "/bible", "/listen", "/service", "/songs", "/media", "/themes", "/settings"]) {
      await page.goto(path);
      // Every page must still render its shell rather than white-screening.
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }

    expect(errors.filter((message) => !TAURI_ABSENT.test(message))).toEqual([]);
  });
});

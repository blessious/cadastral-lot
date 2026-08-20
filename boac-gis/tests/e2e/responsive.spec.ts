import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3005";
const viewports = [
  { name: "phone-360", width: 360, height: 800 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

function readAuthSecret() {
  if (process.env.AUTH_SECRET?.length && process.env.AUTH_SECRET.length >= 32) return process.env.AUTH_SECRET;
  const configPath = path.resolve(process.cwd(), "..", "server_config.env");
  const line = readFileSync(configPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith("AUTH_SECRET="));
  const value = line?.slice(line.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  if (!value || value.length < 32) throw new Error("A 32+ character AUTH_SECRET is required for responsive tests");
  return value;
}

function createSessionCookie() {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: "responsive-smoke",
    username: "responsive-smoke",
    role: "admin",
    iat: now,
    exp: now + 300,
  })).toString("base64url");
  const signature = createHmac("sha256", readAuthSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function gotoWhenServerReady(page: Page, url: string) {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await page.goto(url);
    } catch (error) {
      lastError = error;
      if (!String(error).includes("ERR_CONNECTION_REFUSED")) throw error;
      await page.waitForTimeout(500);
    }
  }
  throw lastError;
}

for (const viewport of viewports) {
  test(`${viewport.name}: login, map shell, panels, theme, and administration`, async ({ browser }) => {
    const anonymous = await browser.newContext({ viewport });
    const loginPage = await anonymous.newPage();
    await gotoWhenServerReady(loginPage, "/");
    await expect(loginPage).toHaveURL(/\/login(?:\?|$)/);
    await expect(loginPage.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await anonymous.close();

    const context = await browser.newContext({ viewport });
    await context.addCookies([{
      name: "boac_gis_session",
      value: createSessionCookie(),
      url: baseURL,
      httpOnly: true,
      sameSite: "Strict",
    }]);
    const page = await context.newPage();
    const requestedUrls: string[] = [];
    page.on("request", (request) => requestedUrls.push(request.url()));
    await gotoWhenServerReady(page, "/");
    await expect(page.getByRole("navigation", { name: "Map tools" })).toBeVisible();
    // The page contains both the primary map and the overview minimap.
    // Persist and assert against the primary (first) Leaflet container only.
    const map = page.locator(".leaflet-container").first();
    await expect(map).toBeVisible();
    await map.evaluate((element) => { element.setAttribute("data-persistence-probe", "mounted"); });

    await page.getByRole("button", { name: "Map settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Map Settings" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Show cadastral lot numbers" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Barangays" })).toBeVisible();
    await page.getByRole("button", { name: "Close map settings" }).click();

    await page.getByRole("button", { name: "Land classification", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Land Classification" })).toBeVisible();
    await expect(page.getByLabel("agricultural")).toBeVisible();
    await page.getByRole("button", { name: "Close land classification" }).click();

    const themeButton = page.getByRole("button", { name: /Switch to (dark|light) mode/ });
    await themeButton.click();
    await expect.poll(() => page.locator("html").getAttribute("data-theme")).toMatch(/dark|light/);

    await page.getByRole("button", { name: "Account" }).click();
    await page.getByRole("link", { name: "Users" }).click();
    await expect(page.getByRole("dialog", { name: "User administration" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
    await expect(map).toHaveAttribute("data-persistence-probe", "mounted");
    if (viewport.width < 768) {
      await expect(page.getByTestId("mobile-user-cards")).toBeVisible();
      await expect(page.getByTestId("desktop-user-table")).toBeHidden();
    } else {
      await expect(page.getByTestId("desktop-user-table")).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    expect(requestedUrls.some((url) => url.includes("search_index.json"))).toBe(false);
    await context.close();
  });
}

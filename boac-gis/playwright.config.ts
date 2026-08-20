import { defineConfig } from "@playwright/test";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3005";
const manageServer = process.env.PLAYWRIGHT_MANAGE_SERVER === "true";
const targetUrl = new URL(baseURL);
const targetPort = targetUrl.port || (targetUrl.protocol === "https:" ? "443" : "80");
const nextExecutable = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: "line",
  webServer: manageServer
    ? {
        command: `"${process.execPath}" "${nextExecutable}" start -H "${targetUrl.hostname}" -p "${targetPort}"`,
        url: `${baseURL.replace(/\/$/, "")}/api/health?target=staged`,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
  use: {
    baseURL,
    channel: process.env.DEPLOY_BROWSER_CHANNEL ?? "msedge",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
});

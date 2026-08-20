import { readFileSync, existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.VERIFY_BASE_URL ??
  "http://127.0.0.1:3000";

const startServer = process.env.VERIFY_START_SERVER === "1";

export default defineConfig({
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.VERIFY_RUN_ID
    ? [
        ["list"],
        [
          "json",
          {
            outputFile: `verification/results/${process.env.VERIFY_RUN_ID}/playwright.json`,
          },
        ],
      ]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  ...(startServer
    ? {
        webServer: {
          command: "npm run start",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  projects: [
    {
      name: "e2e",
      testDir: "./tests/e2e",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "verify-setup",
      testDir: "./tests/verification/setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "verify-static",
      testDir: "./tests/verification/static",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "verify-api",
      testDir: "./tests/verification/api",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "verify-browser",
      testDir: "./tests/verification/browser",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

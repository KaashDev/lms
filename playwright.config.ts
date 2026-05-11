import { defineConfig, devices } from "@playwright/test";

// Minimal Playwright setup. We run the dev server in another terminal —
// the test takes care of waiting for it. CI would wrap this with
// `pnpm dev &` and a wait-on, but that's overkill for one smoke test.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

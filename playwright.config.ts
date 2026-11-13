// The demo tests (`npm run test:demos`): a real browser against a built
// copy of the site that includes drafts (`npm run build:demos`, into
// dist-demos/ so the ordinary build in dist/ is left alone).
import { defineConfig, devices } from "@playwright/test";

const PORT = 4399;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  // A stray `test.only` must not turn CI green by skipping the rest.
  forbidOnly: CI,
  // No retries: a test that passes on a second try is a flaky test, and
  // should be seen as one.
  retries: 0,
  reporter: CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: BASE_URL,
    // A recording of a failed test (playwright-report/ in CI's artifacts).
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // A phone: a narrow, touch screen.
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // --ignore-lock: a preview of dist/ left running doesn't block this.
    command: `npx astro preview --outDir dist-demos --host 127.0.0.1 --port ${PORT} --ignore-lock`,
    url: BASE_URL,
    reuseExistingServer: false,
  },
});

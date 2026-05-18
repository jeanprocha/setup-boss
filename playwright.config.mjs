/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default {
  testDir: "e2e/playwright",
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: process.env.SETUP_BOSS_E2E_FRONTEND_URL || "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  reporter: [["list"]],
};

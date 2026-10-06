import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:3100", viewport: { width: 390, height: 844 } },
  webServer: {
    command: "pnpm dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { GRINDLY_DB_DIR: "memory" },
  },
});

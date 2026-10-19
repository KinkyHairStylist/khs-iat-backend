import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      // Never read the real .env (it points at the shared KHS database).
      DOTENV_CONFIG_PATH: "tests/.env.does-not-exist",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      REDIS_URL: "redis://127.0.0.1:6399",
      JWT_SECRET: "test-jwt-secret-that-is-at-least-32-characters-long",
      LOG_LEVEL: "error",
    },
  },
});

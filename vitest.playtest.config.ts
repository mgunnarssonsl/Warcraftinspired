import { defineConfig } from 'vitest/config';

// Long-running balance playtests, kept out of the regular test run.
export default defineConfig({
  test: { include: ['playtest/**/*.playtest.ts'], testTimeout: 4 * 3600_000 },
});

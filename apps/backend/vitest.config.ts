import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Integration tests share one real Postgres connection (see
    // src/test/helpers.ts) — running suites in parallel worker processes
    // would each open their own pool against the same DB, which is wasteful
    // and makes cross-test data cleanup harder to reason about. Sequential
    // is fast enough at this suite's size.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

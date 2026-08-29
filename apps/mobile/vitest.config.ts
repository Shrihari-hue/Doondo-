import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Only pure-logic modules — anything touching react-native / expo-*
    // needs native mocks (jest-expo) this suite deliberately doesn't set
    // up. See CLAUDE.md-style note in src/lib/*.test.ts files for which
    // modules qualify.
    include: ['src/lib/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests target the pure logic in lib/ (no browser APIs). The `@` alias
// mirrors WXT's, so tests import modules the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});

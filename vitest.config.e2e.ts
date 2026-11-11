import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // ingest/ is a separate service with its own dependencies and tests.
    exclude: ['**/node_modules/**', 'dist/**', 'ingest/**'],
  },
});

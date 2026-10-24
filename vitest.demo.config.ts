import { defineConfig } from 'vitest/config';
import base from './vitest.config';

/** Runs the demo service and route against an isolated in-memory database. */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    projects: [
      {
        extends: true,
        test: {
          name: 'demo-integration',
          include: ['tests/integration/DemoSlug.integ.ts'],
          environment: 'node',
          hookTimeout: 30_000,
        },
      },
    ],
  },
});

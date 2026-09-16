/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Integration tests read `dist/`, so they run only after a build — `npm run
// test:build`. Task 11's build-output.itest.ts is picked up by this same glob.
export default getViteConfig({
  test: {
    include: ['src/**/*.itest.ts'],
  },
});

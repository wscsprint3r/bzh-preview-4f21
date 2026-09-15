import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.bor-zh.ch',
  output: 'static',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'ro',
    locales: ['ro', 'de'],
    routing: { prefixDefaultLocale: false },
  },
  build: { inlineStylesheets: 'always' },
});

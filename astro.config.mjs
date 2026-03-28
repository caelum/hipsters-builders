// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://hipsters.builders',
  server: { port: 5332 },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});

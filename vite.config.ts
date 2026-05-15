import { defineConfig } from 'vitest/config';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// GitHub Pages serves the project at the lowercase repo path
// (`/spottr/`) — that's case-sensitive on the URL even though the brand
// is "Spottr". Display strings stay capitalized; this constant doesn't.
const APP_BASE = '/spottr/';

/**
 * Copy `dist/index.html` to `dist/404.html` so GitHub Pages serves the SPA
 * shell on direct navigations to deep links (e.g. `/spottr/settings`).
 * Pages returns 404.html for unmatched paths; React Router takes over once
 * the shell loads.
 */
function spaFallback404() {
  return {
    name: 'spa-fallback-404',
    apply: 'build' as const,
    closeBundle() {
      const dist = resolve(process.cwd(), 'dist');
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'));
    },
  };
}

export default defineConfig({
  base: APP_BASE,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    spaFallback404(),
    VitePWA({
      // `autoUpdate` swaps in new service-worker versions on next load; the
      // app doesn't surface a "new version" banner, so a silent update is
      // the right default for a personal-use PWA.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      workbox: {
        clientsClaim: false,
        skipWaiting: false,
        navigateFallback: `${APP_BASE}index.html`,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        name: 'Spottr',
        short_name: 'Spottr',
        description: 'Personal strength-training log',
        start_url: APP_BASE,
        scope: APP_BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0E0E10',
        theme_color: '#0E0E10',
        // SVG covers modern Chrome/Edge/Firefox/Safari 17+. PNGs are listed
        // for Android Chrome's install path (it rasterizes the chosen size
        // ahead of time) and to give iOS something tangible to read even
        // though it generally ignores the manifest and uses
        // <link rel="apple-touch-icon"> from index.html.
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**'],
    },
  },
});

import { defineConfig } from 'vitest/config';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const APP_BASE = '/WorkoutBuddy/';

/**
 * Copy `dist/index.html` to `dist/404.html` so GitHub Pages serves the SPA
 * shell on direct navigations to deep links (e.g. `/WorkoutBuddy/settings`).
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
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
      manifest: {
        name: 'WorkoutBuddy',
        short_name: 'WorkoutBuddy',
        description: 'Personal strength-training log',
        start_url: APP_BASE,
        scope: APP_BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0E0E10',
        theme_color: '#0E0E10',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
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

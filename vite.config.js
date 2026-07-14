import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': autoUpdate reloads every open tab the
      // moment a new build's service worker activates, which kills any
      // in-progress recording/analysis. main.jsx shows a toast instead.
      registerType: 'prompt',
      // The ASR model/WASM runtime are fetched on-demand from third-party
      // CDNs (Hugging Face) and are multi-hundred-MB in total — we don't
      // want the service worker precaching those as part of app install.
      // App shell + Quran text/audio get cached; the ASR model relies on
      // the browser's normal HTTP cache plus the Cache Storage entries it
      // manages itself.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        runtimeCaching: [
          {
            // Quran ayah text (Al Quran Cloud API)
            urlPattern: ({ url }) => url.hostname === 'api.alquran.cloud',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'quran-text-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Reciter audio (everyayah.com) — static per-ayah mp3s that
            // never change, safe to cache aggressively.
            urlPattern: ({ url }) => url.hostname === 'everyayah.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'reciter-audio-cache',
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // ASR model weights (Hugging Face) — large, static, versioned
            // by path, so caching indefinitely is safe.
            urlPattern: ({ url }) => url.hostname === 'huggingface.co' || url.hostname.endsWith('.hf.co'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'asr-model-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Quran Companion',
        short_name: 'Quran Companion',
        description: 'Read, listen, memorize, and practice Quran recitation with real acoustic feedback.',
        theme_color: '#064e3b',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Vite 6 rejects requests whose Host header it doesn't recognize, so
    // phone testing through a Cloudflare quick tunnel (see README "Testing
    // on a phone") needs the tunnel domain allow-listed. Dev-server only —
    // no effect on production builds.
    allowedHosts: ['.trycloudflare.com'],
    watch: {
      // Non-app directories the watcher must skip: the offline eval
      // harness's Python venv (~50k files under tools/) crashes the
      // Windows file watcher outright (UNKNOWN errno -4094), killing the
      // dev server seconds after startup; the e2e browser profile and
      // test artifacts are just churn.
      ignored: ['**/tools/**', '**/e2e/**', '**/test-results/**', '**/playwright-report/**'],
    },
  },
  preview: {
    // Same allow-list for the preview server — `npm run test:phone` (the
    // canonical phone-testing target) serves the static build through it.
    allowedHosts: ['.trycloudflare.com'],
  },
  optimizeDeps: {
    // Pre-bundle the ASR stack at dev-server start. Without this, Vite
    // discovers it the first time the ASR worker loads (mid-recording!),
    // re-optimizes, and force-reloads every connected page — destroying an
    // in-progress analysis.
    include: ['@huggingface/transformers'],
  },
});

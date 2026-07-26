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
            //
            // Cache name bumped v1 -> v2 (2026-07): before crossOrigin was
            // set on the Audio() elements in AudioPlayer.jsx/ComparePlayback.jsx,
            // ordinary no-crossOrigin playback produced OPAQUE (status 0)
            // responses that this cache happily stored (statuses: [0, 200]
            // below). A later cors-mode fetch() for the same URL (Voice
            // Comparison's reference-audio scoring) would then be served
            // that cached opaque entry — which the Fetch spec forbids for a
            // non-no-cors request, failing every time with a generic
            // "TypeError: Failed to fetch" for an ayah that was actually
            // perfectly fetchable. The crossOrigin fix stops NEW opaque
            // entries from being written, but every existing user's
            // already-poisoned entries would keep breaking Voice Comparison
            // indefinitely (CacheFirst never revalidates) without this
            // rename — it moves everyone to a clean, empty cache on their
            // next service-worker update, no manual "clear site data"
            // required. Do not revert the name to v1.
            urlPattern: ({ url }) => url.hostname === 'everyayah.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'reciter-audio-cache-v2',
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
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Full-bleed art with generous inner padding around the mark, safe
          // for the OS to crop into a circle/squircle without clipping it.
          { src: '/icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any maskable' },
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

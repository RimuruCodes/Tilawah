import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { registerSW } from 'virtual:pwa-register'
import { toast } from '@/components/ui/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { initLifecycleDebug, recordLifecycleEvent } from '@/lib/lifecycleDebug'
import { applyArabicFont } from '@/lib/arabicFont'

// Applies the persisted Arabic font choice to the --font-arabic CSS var
// before first paint — the preference lives in localStorage, not the DOM,
// so it must be re-applied on every load.
applyArabicFont()

// On-page debug console for mobile (iOS has no remote DevTools without a
// Mac): append ?debug=1 to any app URL and the eruda overlay appears —
// console output, network requests, device info, readable on the phone
// itself. Lazy-imported only when the flag is present, so it costs normal
// users nothing; the flag survives crash-reloads since Chrome restores the
// same URL.
if (new URLSearchParams(window.location.search).get('debug') === '1') {
  import('eruda').then((eruda) => eruda.default.init())
}

// TEMP: records pagehide/visibilitychange/SW events (persisted across
// reloads) to diagnose the mobile mid-analysis reload. See lifecycleDebug.js.
initLifecycleDebug()

// 'prompt' mode (see vite.config.js): a service-worker update must never
// silently reload the page — an auto-reload mid-recording used to destroy
// an in-progress recitation analysis. Instead, surface a toast and let the
// person update when they choose; otherwise the new version applies on the
// next natural visit.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    recordLifecycleEvent('sw-update-detected', 'new version waiting; prompting (no auto reload)')
    toast({
      title: 'Update available',
      description: 'A new version of Quran Companion is ready.',
      action: (
        <ToastAction altText="Reload to update" onClick={() => updateSW(true)}>
          Reload
        </ToastAction>
      ),
    })
  },
  onRegisteredSW(swUrl) {
    recordLifecycleEvent('sw-registered', swUrl)
  },
  onRegisterError(err) {
    recordLifecycleEvent('sw-register-error', String(err?.message || err))
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

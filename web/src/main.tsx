import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'antd/dist/reset.css'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { NEW_VERSION_EVENT } from './components/NewVersionBar.tsx'

// An installed app is rarely closed, so it asks for a new deploy itself: at
// once, whenever it comes back into view, and every 45 minutes. A new version
// is offered with a Reload button (NewVersionBar) - never reloaded by itself,
// a member may be typing a question.
const UPDATE_CHECK_INTERVAL_MS = 45 * 60 * 1000
registerSW({
  onNeedReload() {
    window.dispatchEvent(new Event(NEW_VERSION_EVENT))
  },
  onRegisteredSW(swUrl, registration) {
    if (!registration) return
    const checkForUpdate = async () => {
      if (registration.installing || !navigator.onLine) return
      try {
        const resp = await fetch(swUrl, { cache: 'no-store' })
        if (resp?.status === 200) await registration.update()
      } catch {
        // offline or a passing network error - the next check tries again
      }
    }
    checkForUpdate()
    setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

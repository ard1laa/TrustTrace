import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { installRipple } from './lib/ripple.js';

installRipple();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Workbox service worker (vite-plugin-pwa). Dev builds skip it to avoid stale modules.
// A new deploy waits for the user to tap "Refresh" instead of reloading mid-task.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh: () => window.dispatchEvent(new CustomEvent('trusttrace:update-ready', { detail: () => updateSW(true) })),
      onOfflineReady: () => window.dispatchEvent(new CustomEvent('trusttrace:offline-ready'))
    });
  });
  // Caches from the previous hand-written worker.
  window.caches?.keys().then((keys) => keys.filter((k) => /^trusttrace-v\d+$/.test(k)).forEach((k) => window.caches.delete(k)));
}

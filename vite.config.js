import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';

// Optional HTTPS support (set VITE_HTTPS=true or place cert.pem/key.pem in .cert/)
// while keeping default http:// startup 100% seamless out-of-the-box.
function resolveOptionalHttps() {
  if (process.env.VITE_HTTPS !== 'true') return false;
  const certDir = path.resolve(process.cwd(), '.cert');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  }
  return false;
}

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// Installable PWA. Workbox precaches the built app shell (revisioned, so a
// deploy replaces it cleanly) and the app opens instantly — or fully offline —
// on patchy exhibition Wi-Fi. API data is never cached here; the dashboard
// snapshot lives in IndexedDB (src/lib/offlineStore.js).
const pwa = VitePWA({
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo.png'],
  manifest: {
    id: '/',
    name: 'TrustTrace — Verified Credentials',
    short_name: 'TrustTrace',
    description: 'Verifiable co-curricular credentials, skill maps and instant QR verification for students, universities and recruiters.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#F4F2EE',
    theme_color: '#0A66C2',
    categories: ['education', 'business', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'google-fonts-css' }
      },
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: { maxEntries: 24, maxAgeSeconds: 365 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] }
        }
      }
    ]
  }
});

export default defineConfig({
  plugins: [react(), pwa],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    host: '0.0.0.0',
    https: resolveOptionalHttps(),
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        // Keep server-sent events streaming through the dev proxy.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) proxyRes.headers['cache-control'] = 'no-cache';
          });
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['chart.js', 'react-chartjs-2'],
          d3: ['d3'],
          react: ['react', 'react-dom']
        }
      }
    }
  }
});

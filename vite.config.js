import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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

export default defineConfig({
  plugins: [react()],
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

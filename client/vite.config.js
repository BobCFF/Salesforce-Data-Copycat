import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API server runs on :4000 in development. Vite proxies /api to it so the
// browser talks to a single origin and the session cookie is preserved.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});

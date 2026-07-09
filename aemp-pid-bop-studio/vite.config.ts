import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
  // jsdom: sanitizeSvg (DOMPurify) needs a DOM window, in tests as in the browser.
  test: { environment: 'jsdom' },
  build: {
    rollupOptions: {
      output: {
        // split heavy vendors into their own chunks (xlsx is already lazy-loaded)
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});

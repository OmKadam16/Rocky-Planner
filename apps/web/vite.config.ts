import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Rocky web: laptop app + /remote phone PWA. BrowserRouter, so Vercel
// rewrites (vercel.json) send all routes to index.html.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
});

import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Rocky web: laptop app + /remote phone PWA. BrowserRouter, so the
// hosted build rewrites all routes to index.html (see render.yaml).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
});

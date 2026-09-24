import { defineConfig } from 'vite';

export default defineConfig({
  // Serve the frontend/ folder root
  root: '.',

  server: {
    port: 5173,
    open: true,          // auto-open browser
    proxy: {
      // Forward all /api calls to FastAPI backend
      // (optional — only needed if you call /api/* paths)
      // '/api': 'http://localhost:8000',
    },
  },

  build: {
    outDir: 'dist',
  },
});

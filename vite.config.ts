import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true },
  build: {
    // three.js is ~600 kB minified; keep it in its own cacheable chunk.
    chunkSizeWarningLimit: 800,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});

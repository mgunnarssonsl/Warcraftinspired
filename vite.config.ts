import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Relative paths: the built game runs from any folder of any static host.
  base: './',
  define: { __VERSION__: JSON.stringify(version) },
  // In development the game server runs apart (npm run server); /ws is forwarded to it.
  server: { host: true, proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  build: {
    // three.js is ~600 kB minified; keep it in its own cacheable chunk.
    chunkSizeWarningLimit: 800,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});

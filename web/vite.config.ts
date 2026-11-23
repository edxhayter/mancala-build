import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `command` is 'serve' for `vite` (dev) and 'build' for `vite build`.
// GitHub Pages serves the site from /mancala-build/, so only the production
// build needs that prefix; local dev stays at /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/mancala-build/' : '/',
  plugins: [react()],
  // The AI worker imports modules (the engine), so build it as an ES module too.
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}));

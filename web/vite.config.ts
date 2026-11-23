import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /mancala-build/, so the production build
// (and `vite preview`, which serves that build) use that prefix; dev stays at /.
// Note `vite preview` runs with command 'serve' too: `isPreview` tells them apart.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/mancala-build/' : '/',
  plugins: [react()],
  // The AI worker imports modules (the engine), so build it as an ES module too.
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}));

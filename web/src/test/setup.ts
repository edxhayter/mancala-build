// Runs before every test file.
import '@testing-library/jest-dom/vitest'; // adds matchers like toBeInTheDocument()
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { initSync } from '../wasm/mancala_wasm';

// Load the real engine. In the browser the .wasm file is fetched over the
// network; in tests there is no server, so read the bytes from disk and
// instantiate them synchronously, before any test runs.
// (Vitest runs from web/, so the path is relative to that.)
const wasmFile = resolve(process.cwd(), 'src/wasm/mancala_wasm_bg.wasm');
initSync({ module: readFileSync(wasmFile) });

// Unmount whatever the previous test rendered, so tests can't see each other's DOM.
afterEach(cleanup);

// Moves finish at once unless a test chooses a speed (the animation tests do).
beforeEach(() => localStorage.setItem('mancala.speed', 'instant'));

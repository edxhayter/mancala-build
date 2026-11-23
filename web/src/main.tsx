import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted fonts: these CSS files ship the font files with the site, so no
// request ever goes to a font CDN.
import '@fontsource/marcellus-sc/400.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles/global.css';

import { App } from './App';
import { initEngine } from './engine';

// Load the WASM engine first, so every component can use it straight away.
await initEngine();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

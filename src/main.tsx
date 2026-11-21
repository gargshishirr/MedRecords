import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './styles/global.css';
import App from './App';
import { setUpPwa } from './lib/pwa';

// Never run inside a frame (see public/theme-init.js).
if (window.top === window.self) {
  setUpPwa();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

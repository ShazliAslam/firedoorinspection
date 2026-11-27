import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { handleGoogleRedirect } from './lib/googleAuth';
import './index.css';
import App from './App';

handleGoogleRedirect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Tag the document so CSS can switch backgrounds per-window. The popup needs
// a fully transparent body to keep its frameless rounded look; the main
// overlay needs the opaque dark theme.
if (window.location.hash === '#popup') {
  document.documentElement.dataset.window = 'popup';
  document.body.dataset.window = 'popup';
} else {
  document.documentElement.dataset.window = 'main';
  document.body.dataset.window = 'main';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

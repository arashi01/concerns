import '@atlaskit/css-reset';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';
import { App } from './app';

void view.theme.enable();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element not found');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react({ babel: { plugins: ['@compiled/babel-plugin'] } })],
  base: './',
  root: 'src/frontend/edit',
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
    },
  },
  build: {
    outDir: '../../../static/edit/build',
    emptyOutDir: true,
  },
});

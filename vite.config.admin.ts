import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react({ babel: { plugins: ['@compiled/babel-plugin'] } })],
  base: './',
  root: 'src/admin',
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
    },
  },
  build: {
    outDir: '../../static/admin/build',
    emptyOutDir: true,
  },
});

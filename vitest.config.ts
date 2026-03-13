import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
      '@resolvers': resolve(__dirname, 'src/resolvers'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
    },
  },
});

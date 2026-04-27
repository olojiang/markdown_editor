import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    exclude: ['node_modules/**', 'dist/**', 'dist-electron/**', 'tests/electron/**'],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});

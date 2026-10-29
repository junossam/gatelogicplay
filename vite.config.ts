/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { samplesPlugin } from './scripts/samples-plugin';

export default defineConfig({
  base: './',
  plugins: [react(), samplesPlugin()],
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});

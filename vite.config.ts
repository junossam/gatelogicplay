/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { chipsPlugin, samplesPlugin } from './scripts/samples-plugin';

export default defineConfig({
  base: './',
  plugins: [react(), samplesPlugin(), chipsPlugin()],
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});

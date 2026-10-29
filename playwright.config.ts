import { defineConfig, devices } from '@playwright/test';

const PORT = 5179;
/** 성능 측정은 개발 모드(React 검증 코드 포함)가 아니라 배포 빌드로 */
export const PREVIEW_PORT = 5180;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: /perf\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } },
    // 성능 측정은 다른 테스트와 CPU를 나눠 쓰지 않도록 기능 테스트가 모두 끝난 뒤 따로 돌린다
    {
      name: 'perf',
      testMatch: /perf\.spec/,
      dependencies: ['chromium'],
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm exec vite build && pnpm exec vite preview --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

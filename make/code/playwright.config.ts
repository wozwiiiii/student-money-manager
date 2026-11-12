import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E 配置（AGENT.md §5.4 关键路径）。
 * webServer 使用 vite dev（当前环境的构建产物 dist/ 会被系统清理机制回收，dev server 不依赖 dist）。
 * 每个测试用全新 browser context（IndexedDB 为空 → 首次使用态）。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4317',
  },
  webServer: {
    command: 'npm run dev -- --port 4317 --strictPort',
    url: 'http://localhost:4317',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

import { defineConfig } from "vitest/config";

// 由 repo 根執行 `yarn test`：各 workspace 的 vitest 設定為獨立 project，
// process.cwd() 維持 repo 根，讓讀取 supabase/functions/* 原始碼的契約測試路徑不變。
export default defineConfig({
  test: {
    projects: [
      "packages/shared/vitest.config.ts",
      "apps/booking/vitest.config.ts",
      "apps/pms/vitest.config.ts",
      "apps/hq/vitest.config.ts",
    ],
  },
});

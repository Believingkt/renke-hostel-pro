// 上架精靈 2d 本機截圖用：以 mock 資料渲染各步驟（不連任何資料庫）
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tailwind from "tailwindcss";
import autoprefixer from "autoprefixer";

const app = path.resolve(__dirname, "../../../apps/booking");
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  css: { postcss: { plugins: [tailwind({ config: path.join(app, "tailwind.config.ts") }), autoprefixer()] } },
  resolve: {
    alias: [
      { find: "@lakeze/shared/integrations/supabase/client", replacement: path.join(__dirname, "mockSupabase.ts") },
      { find: "@lakeze/shared", replacement: path.resolve(app, "../../packages/shared/src") },
      { find: "@", replacement: path.join(app, "src") },
    ],
  },
  server: { port: 5199, host: "127.0.0.1" },
});

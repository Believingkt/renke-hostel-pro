import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { seoPrerender } from "./scripts/vite-plugin-seo-prerender";
import { sitemap } from "./scripts/vite-plugin-sitemap";

// 產生 /version.json，讓前端能偵測新版本並提示重新整理
function emitVersionJson(buildId: string): Plugin {
  return {
    name: "emit-version-json",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ buildId }) });
    },
  };
}

const envDir = path.resolve(__dirname, "../..");

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const buildId = String(Date.now());
  const env = loadEnv(mode, envDir, "");
  return {
    envDir,
    server: {
      host: "::",
      port: 8081,
    },
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      react({ jsxImportSource: "react" }),
      emitVersionJson(buildId),
      seoPrerender({
        url: env.VITE_SUPABASE_URL || env.SUPABASE_URL || "",
        key: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "",
      }),
      sitemap({
        url: env.VITE_SUPABASE_URL || env.SUPABASE_URL || "",
        key: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "",
      }),
    ],
    resolve: {
      alias: {
        "@lakeze/shared": path.resolve(__dirname, "../../packages/shared/src"),
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      sourcemap: false,
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react/jsx-runtime"],
      esbuildOptions: { jsx: "automatic" as const },
    },
  };
});

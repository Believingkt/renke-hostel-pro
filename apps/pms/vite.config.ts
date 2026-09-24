import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

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

export default defineConfig(() => {
  const buildId = String(Date.now());
  return {
    envDir: path.resolve(__dirname, "../.."),
    server: {
      host: "::",
      port: 8082,
    },
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [react({ jsxImportSource: "react" }), emitVersionJson(buildId)],
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
      esbuildOptions: { jsx: "automatic" },
    },
  };
});

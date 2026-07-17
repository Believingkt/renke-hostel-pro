import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// 產生 /version.json，讓前端能偵測新版本並提示重新整理
function emitVersionJson(buildId: string): Plugin {
  return {
    name: "emit-version-json",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId }),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const buildId = String(Date.now());
  return {
    server: {
      host: "::",
      port: 8080,
    },
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      react({
        jsxImportSource: 'react',
      }),
      mode === "development" && componentTagger(),
      emitVersionJson(buildId),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      sourcemap: false,
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime'],
      esbuildOptions: {
        jsx: 'automatic',
      },
    },
  };
});

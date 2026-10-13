import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
  resolve: {
    alias: {
      "@lakeze/shared": path.resolve(__dirname, "./src"),
      "@": path.resolve(__dirname, "../../apps/booking/src"),
    },
  },
});

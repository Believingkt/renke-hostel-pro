import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["docs/pricing-1a/scratch/*.report.ts"], environment: "node" },
});

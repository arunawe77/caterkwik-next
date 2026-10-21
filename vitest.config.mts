import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/legacy/**", "src/test/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "text"],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
    },
  },
});

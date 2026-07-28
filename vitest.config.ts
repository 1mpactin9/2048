import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    extensions: [".ts", ".js"],
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    environmentOptions: {
      jsdom: {
        pretendToBeVisual: true,
      },
    },
  },
});

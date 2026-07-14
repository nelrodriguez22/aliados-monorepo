import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    env: { VITE_API_URL: "http://test.local" },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});

import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4747",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [
      fileURLToPath(new URL("./src/setupTests.ts", import.meta.url)),
    ],
  },
});

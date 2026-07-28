import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // El daemon sirve la SPA siempre desde la raíz del origen (#38), así
  // que "/" es correcto y evita que /pet/ (con barra final) pida
  // /pet/assets/… y reciba un 404.
  base: "/",
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

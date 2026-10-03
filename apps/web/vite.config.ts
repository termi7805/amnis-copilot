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
      // changeOrigin reescribe `Host` a 127.0.0.1:4747 (el daemon exige el
      // suyo, #88) y deja el `Origin` del navegador, que el daemon admite
      // vía AMNIS_DEV_ORIGIN. No reescribir `Origin` aquí: abriría la
      // escritura a cualquier web que llegue a este dev server.
      "/api": { target: "http://127.0.0.1:4747", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [
      fileURLToPath(new URL("./src/setupTests.ts", import.meta.url)),
    ],
  },
});

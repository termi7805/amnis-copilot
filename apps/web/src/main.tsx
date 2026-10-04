import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/silkscreen/400.css";
import "./index.css";
// Antes del primer render: el idioma de la caché ya está cargado al pintar.
import "./i18n/index.ts";
import { Dashboard } from "./routes/dashboard/Dashboard.tsx";
import { PetWindow } from "./routes/pet/PetWindow.tsx";

/** Solo en desarrollo: `import.meta.env.DEV` es `false` en el build, y Vite
 * descarta el módulo entero. */
const PetLab = import.meta.env.DEV
  ? lazy(() =>
      import("./routes/lab/PetLab.tsx").then((m) => ({ default: m.PetLab })),
    )
  : null;

/**
 * Dos rutas estáticas sin navegación entre sí — viven en contextos
 * distintos (navegador, webview de Tauri) — así que un router es más
 * código, no menos (docs/STACK.md §2).
 */
function App() {
  const { pathname } = window.location;
  if (pathname === "/lab" && PetLab) {
    return (
      <Suspense fallback={null}>
        <PetLab />
      </Suspense>
    );
  }
  return pathname === "/pet" ? <PetWindow /> : <Dashboard />;
}

// Antes del primer render: index.css solo bloquea el scroll en la
// ventana flotante, nunca en el dashboard.
if (window.location.pathname === "/pet") {
  document.documentElement.dataset.window = "pet";
}

const root = document.getElementById("root");
if (!root) throw new Error("#root no existe en index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

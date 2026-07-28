import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./routes/dashboard/Dashboard.tsx";
import { PetWindow } from "./routes/pet/PetWindow.tsx";

/**
 * Dos rutas estáticas sin navegación entre sí — viven en contextos
 * distintos (navegador, webview de Tauri) — así que un router es más
 * código, no menos (docs/STACK.md §2).
 */
function App() {
  return window.location.pathname === "/pet" ? <PetWindow /> : <Dashboard />;
}

const root = document.getElementById("root");
if (!root) throw new Error("#root no existe en index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

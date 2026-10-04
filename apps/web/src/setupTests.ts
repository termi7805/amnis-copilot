import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

// jsdom dice `en-US`: con «Sistema» los tests, escritos contra los textos en
// español, verían la interfaz en inglés.
Object.defineProperty(navigator, "language", {
  value: "es-ES",
  configurable: true,
});

const { default: i18n } = await import("./i18n/index.ts");

beforeEach(async () => {
  localStorage.removeItem("amnis-locale");
  await i18n.changeLanguage("es");
});

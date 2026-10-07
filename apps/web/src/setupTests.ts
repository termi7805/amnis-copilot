import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

// jsdom dice `en-US`: con «Sistema» los tests, escritos contra los textos en
// español, verían la interfaz en inglés.
Object.defineProperty(navigator, "language", {
  value: "es-ES",
  configurable: true,
});

// jsdom no carga imágenes: ni `onload` ni `onerror` llegarían nunca y la
// precarga de las skins (`useSelectedSkin`) esperaría a su tope de tiempo.
class InstantImage {
  onload: (() => void) | null = null;
  #src = "";
  get src() {
    return this.#src;
  }
  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onload?.());
  }
}
globalThis.Image = InstantImage as unknown as typeof Image;

const { default: i18n } = await import("./i18n/index.ts");

beforeEach(async () => {
  localStorage.removeItem("amnis-locale");
  await i18n.changeLanguage("es");
});

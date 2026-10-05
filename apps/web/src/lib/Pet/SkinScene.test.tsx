import {
  type Listening,
  type SkinManifest,
  validateSkinManifest,
} from "@amnis/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Pet } from "./Pet.tsx";
import type { PetSkin } from "./SkinScene.tsx";

afterEach(cleanup);

function skinOf(raw: unknown): PetSkin {
  const checked = validateSkinManifest(raw);
  if ("errors" in checked) throw new Error(checked.errors.join("; "));
  const manifest: SkinManifest = checked.manifest;
  return {
    id: "prueba",
    manifest,
    imageUrl: (src) => `/api/skins/prueba/${src}`,
  };
}

const skin = skinOf({
  animations: {
    wiggle: {
      beats: 1.2,
      keyframes: [
        { at: 0, rotate: -4 },
        { at: 100, rotate: 4 },
      ],
    },
  },
  states: {
    coding: {
      layers: [
        { src: "body.png", anim: "breathe", pivot: [75, 100] },
        { src: "head.png", anim: "wiggle", pivot: [75, 60] },
        { src: "code.png", clip: [97, 51, 42, 31], anim: "scroll" },
        { src: "fire.png", frames: 4, beats: 2 },
      ],
    },
    committing: {
      layers: [
        { src: "body.png" },
        { text: "commitHash", at: [50, 70], size: 9, color: "#7ee787" },
      ],
    },
    limited: {
      layers: [
        { text: "resetsCountdown", at: [10, 20], size: 8, color: "#fff" },
      ],
    },
  },
});

const images = (c: HTMLElement) => [...c.querySelectorAll("image")];

describe("<Pet skin>", () => {
  it("pinta las capas del estado como <image href>, en orden", () => {
    const { container } = render(
      <Pet state="coding" level={1} fatigue={0} skin={skin} />,
    );
    expect(images(container).map((i) => i.getAttribute("href"))).toEqual([
      "/api/skins/prueba/body.png",
      "/api/skins/prueba/head.png",
      "/api/skins/prueba/code.png",
      "/api/skins/prueba/fire.png",
    ]);
    expect(screen.getByTestId("pet").getAttribute("data-skin")).toBe("prueba");
    expect(container.querySelector('[data-look="skin"]')).not.toBeNull();
  });

  it("un estado que la skin no trae se pinta como BIT", () => {
    const { container } = render(
      <Pet state="testing" level={1} fatigue={0} skin={skin} />,
    );
    expect(container.querySelector('[data-look="testing"]')).not.toBeNull();
    expect(images(container)).toHaveLength(0);
    expect(screen.getByTestId("pet").hasAttribute("data-skin")).toBe(false);
  });

  it("sin skin pinta BIT como siempre", () => {
    const { container } = render(<Pet state="coding" level={1} fatigue={0} />);
    expect(container.querySelector('[data-look="coding"]')).not.toBeNull();
  });

  it("la animación de la capa va por clase y pivote; la propia trae su @keyframes", () => {
    const { container } = render(
      <Pet state="coding" level={1} fatigue={1} skin={skin} />,
    );
    const [body, head] = images(container).map((i) => i.parentElement);
    expect(body?.getAttribute("class")).toBe("amnis-anim-breathe");
    expect(body?.getAttribute("style")).toContain(
      "transform-origin: 75px 100px",
    );
    expect(head?.getAttribute("class")).toBe("amnis-anim-wiggle");
    const css = [...container.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("\n");
    expect(css).toContain("@keyframes amnis-anim-wiggle");
    expect(css).toContain("calc(var(--t)*1.2)");
  });

  it("el recorte envuelve la capa y el movimiento va dentro", () => {
    const { container } = render(
      <Pet state="coding" level={1} fatigue={0} skin={skin} />,
    );
    const code = images(container)[2] as Element;
    const clipped = code.parentElement?.parentElement as Element;
    const url = clipped.getAttribute("clip-path") ?? "";
    const id = /url\(#(.+)\)/.exec(url)?.[1] ?? "";
    const rect = container.querySelector(`[id="${id}"] rect`);
    expect(rect?.getAttribute("x")).toBe("97");
    expect(rect?.getAttribute("width")).toBe("42");
    expect(code.parentElement?.getAttribute("class")).toBe("amnis-anim-scroll");
  });

  it("dos mascotas con skin no comparten ids de clipPath", () => {
    const { container } = render(
      <>
        <Pet state="coding" level={1} fatigue={0} skin={skin} />
        <Pet state="coding" level={1} fatigue={0} skin={skin} />
      </>,
    );
    const ids = [...container.querySelectorAll("clipPath")].map((c) => c.id);
    expect(ids.length).toBeGreaterThan(2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[A-Za-z0-9_-]+$/.test(id))).toBe(true);
  });

  it("una tira mide N fotogramas de ancho y se reproduce con steps()", () => {
    const { container } = render(
      <Pet state="coding" level={1} fatigue={0} skin={skin} />,
    );
    const strip = images(container)[3] as Element;
    expect(strip.getAttribute("width")).toBe("600");
    expect(strip.getAttribute("class")).toBe("amnis-strip");
    expect(strip.getAttribute("style")).toContain("steps(4,end)");
  });

  it("committing muestra el hash real, o un marcador sin él", () => {
    const { container, rerender } = render(
      <Pet
        state="committing"
        level={1}
        fatigue={0}
        commitHash="a1b2c3d"
        skin={skin}
      />,
    );
    const text = () => container.querySelector("text");
    expect(text()?.textContent).toBe("a1b2c3d");
    expect(text()?.getAttribute("x")).toBe("50");
    expect(text()?.getAttribute("fill")).toBe("#7ee787");
    rerender(<Pet state="committing" level={1} fatigue={0} skin={skin} />);
    expect(text()?.textContent).toBe("······");
  });

  it("limited muestra la cuenta atrás", () => {
    const resetsAt = new Date(Date.now() + 125 * 60_000).toISOString();
    const { container } = render(
      <Pet
        state="limited"
        level={1}
        fatigue={1}
        resetsAt={resetsAt}
        skin={skin}
      />,
    );
    expect(container.querySelector("text")?.textContent).toMatch(/^2h 0[45]m$/);
  });

  describe("música", () => {
    const LISTENING: Listening = {
      vibe: "fiesta",
      bpm: 124,
      track: { id: "t1", title: "Canción", artist: "A", imageUrl: null },
    };
    const headSkin = skinOf({
      animations: {},
      states: {
        coding: {
          layers: [
            { src: "body.png", anim: "breathe" },
            {
              src: "head.png",
              role: "head",
              anchor: [75, 40],
              scale: 1.5,
              pivot: [75, 60],
              anim: "nod",
            },
          ],
        },
        waiting: {
          layers: [
            { src: "body.png" },
            { src: "head.png", role: "head", anchor: [75, 40] },
          ],
        },
        testing: { layers: [{ src: "body.png" }] },
      },
    });
    const headGroup = (c: HTMLElement) =>
      c.querySelector<SVGGElement>("[data-skin-head]");

    it("la capa head cabecea y lleva cascos y pantalla encima, colocados por anchor y scale", () => {
      const view = render(
        <Pet
          state="coding"
          level={1}
          fatigue={0}
          listening={LISTENING}
          skin={headSkin}
        />,
      );
      // La pantalla «sonando» sale al cambiar de pista, no en el primer render.
      view.rerender(
        <Pet
          state="coding"
          level={1}
          fatigue={0}
          listening={{ ...LISTENING, track: { ...LISTENING.track, id: "t2" } }}
          skin={headSkin}
        />,
      );
      const { container } = view;
      const head = headGroup(container);
      expect(head?.getAttribute("class")).toMatch(/head/);
      expect(head?.getAttribute("style")).toContain(
        "transform-origin: 75px 60px",
      );
      const phones = head?.querySelector("[data-testid='headphones']");
      expect(phones).not.toBeNull();
      expect(head?.querySelector("[data-testid='now-playing']")).not.toBeNull();
      expect(phones?.parentElement?.getAttribute("transform")).toBe(
        "translate(75 40) scale(1.5) translate(-55 -46)",
      );
      expect(phones?.parentElement?.parentElement?.getAttribute("class")).toBe(
        "amnis-anim-nod",
      );
      const pet = screen.getByTestId("pet");
      expect(pet.dataset.vibe).toBe("fiesta");
      expect(pet.dataset.motion).toBe("head");
    });

    it("el cuerpo no cabecea: solo la capa head lleva la clase", () => {
      const { container } = render(
        <Pet
          state="coding"
          level={1}
          fatigue={0}
          listening={LISTENING}
          skin={headSkin}
        />,
      );
      const heads = [...container.querySelectorAll("g")].filter((g) =>
        /head/.test(g.getAttribute("class") ?? ""),
      );
      expect(heads).toHaveLength(1);
      expect(heads[0]?.querySelector("image")?.getAttribute("href")).toContain(
        "head.png",
      );
    });

    it("sin música el grupo de anclaje sigue ahí, vacío", () => {
      const { container } = render(
        <Pet state="coding" level={1} fatigue={0} skin={headSkin} />,
      );
      const anchor = headGroup(container)?.querySelector("g[transform]");
      expect(anchor).not.toBeNull();
      expect(anchor?.children).toHaveLength(0);
    });

    it("una skin sin capa head no lleva cascos ni pantalla, pero sí notas", () => {
      const { container } = render(
        <Pet
          state="testing"
          level={1}
          fatigue={0}
          listening={LISTENING}
          skin={headSkin}
        />,
      );
      expect(container.querySelector("[data-skin]")).not.toBeNull();
      expect(screen.queryByTestId("headphones")).toBeNull();
      expect(screen.queryByTestId("now-playing")).toBeNull();
      expect(container.querySelector('[class*="note"]')).not.toBeNull();
    });

    it("waiting no lleva capa de música aunque la skin tenga head", () => {
      const { container } = render(
        <Pet
          state="waiting"
          level={1}
          fatigue={0}
          listening={LISTENING}
          skin={headSkin}
        />,
      );
      expect(headGroup(container)).not.toBeNull();
      expect(screen.queryByTestId("headphones")).toBeNull();
      expect(screen.queryByTestId("now-playing")).toBeNull();
    });
  });

  it("nunca incrusta el contenido de la skin: ni <script> ni <foreignObject>", () => {
    const { container } = render(
      <Pet state="coding" level={1} fatigue={0} skin={skin} />,
    );
    expect(container.querySelector("script, foreignObject, use")).toBeNull();
  });
});

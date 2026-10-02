import type { Listening, PetSnapshot } from "@amnis/shared";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fatigueLevel, Pet, PetOffline } from "./Pet.tsx";

// Cada `it` renderiza sobre el mismo `document`; sin esto, los `it`
// sucesivos acumulan varios <svg data-testid="pet"> y las queries por
// rol/testid dejan de ser únicas.
afterEach(cleanup);

const ALL_STATES: PetSnapshot["state"][] = [
  "coding",
  "testing",
  "researching",
  "planning",
  "waiting",
  "resting",
  "sleeping",
  "terminal",
  "subagents",
  "committing",
  "pushing",
  "limited",
];

describe("fatigueLevel", () => {
  it("satura por debajo del 10% — fresca", () => {
    expect(fatigueLevel(0.05)).toBe(0);
    expect(fatigueLevel(0.1)).toBe(0);
  });

  it("satura por encima del 85% — agotada", () => {
    expect(fatigueLevel(0.85)).toBe(1);
    expect(fatigueLevel(0.95)).toBe(1);
  });

  it("interpola linealmente entre 10% y 85%", () => {
    expect(fatigueLevel(0.475)).toBeCloseTo(0.5, 5);
  });
});

describe("Pet", () => {
  it("renderiza un <svg> que escala a su contenedor, sin dimensiones fijas", () => {
    render(<Pet state="coding" level={1} fatigue={0.42} />);

    const pet = screen.getByTestId("pet");
    expect(pet.tagName).toBe("svg");
    expect(pet).toHaveAttribute("viewBox");
    expect(pet).toHaveAttribute("width", "100%");
    expect(pet).toHaveAttribute("height", "100%");
    expect(pet.dataset.state).toBe("coding");
    expect(pet.dataset.level).toBe("1");
  });

  it("expone la fatiga normalizada como custom property", () => {
    render(<Pet state="coding" level={1} fatigue={0.475} />);

    const pet = screen.getByTestId("pet");
    expect(pet.style.getPropertyValue("--pet-fatigue")).toBe("0.5");
  });

  it("tiene role=img con un título que describe el estado", () => {
    render(<Pet state="waiting" level={1} fatigue={0} />);

    const pet = screen.getByRole("img");
    expect(pet.querySelector("title")?.textContent).toMatch(/permiso/i);
  });

  it("cada estado produce un `data-look` distinto en su escena", () => {
    const looks = new Set<string | undefined>();

    for (const state of ALL_STATES) {
      const { container, unmount } = render(
        <Pet state={state} level={1} fatigue={0} />,
      );
      const scene = container.querySelector("[data-look]");
      looks.add(scene?.getAttribute("data-look") ?? undefined);
      unmount();
    }

    expect(looks.size).toBe(ALL_STATES.length);
  });

  it("la fatiga no cambia la geometría de la escena, solo el tempo", () => {
    const { container: fresh, unmount: unmountFresh } = render(
      <Pet state="coding" level={1} fatigue={0} />,
    );
    const freshMarkup = fresh.querySelector("[data-testid='pet']")?.innerHTML;
    unmountFresh();

    const { container: tired, unmount: unmountTired } = render(
      <Pet state="coding" level={1} fatigue={1} />,
    );
    const tiredMarkup = tired.querySelector("[data-testid='pet']")?.innerHTML;
    unmountTired();

    expect(freshMarkup).toBe(tiredMarkup);
  });

  it("limited con resetsAt pinta la cuenta atrás", () => {
    render(
      <Pet
        state="limited"
        level={1}
        fatigue={1}
        resetsAt={new Date(Date.now() + 102 * 60_000).toISOString()}
      />,
    );

    const pet = screen.getByRole("img");
    expect(pet.textContent).toMatch(/1h 4[0-3]m/);
  });

  it("limited sin resetsAt no rompe", () => {
    render(<Pet state="limited" level={1} fatigue={1} resetsAt={null} />);

    expect(screen.getByRole("img").querySelector("title")?.textContent).toBe(
      "Límite alcanzado",
    );
  });

  it("pushing con commitHash pinta el hash real", () => {
    render(<Pet state="pushing" level={1} fatigue={0} commitHash="a1b2c3d" />);

    expect(screen.getByRole("img").textContent).toContain("a1b2c3d");
  });

  it("pushing sin commitHash pinta un placeholder, no un hash inventado", () => {
    render(<Pet state="pushing" level={1} fatigue={0} commitHash={null} />);

    expect(screen.getByRole("img").textContent).toContain("······");
  });

  it("committing no muestra ningún hash — todavía no existe", () => {
    render(<Pet state="committing" level={1} fatigue={0} />);

    const pet = screen.getByRole("img");
    expect(pet.textContent).not.toMatch(/[0-9a-f]{7}/);
    expect(pet.textContent).not.toContain("······");
  });
});

describe("PetOffline", () => {
  it("es una escena propia, distinta de cualquier PetState", () => {
    render(<PetOffline />);

    const pet = screen.getByRole("img");
    expect(pet.querySelector("title")?.textContent).toMatch(/sin conexión/i);
    expect(pet.querySelector("[data-look]")?.getAttribute("data-look")).toBe(
      "offline",
    );
  });
});

const LISTENING: Listening = {
  vibe: "fiesta",
  bpm: 124,
  track: { id: "t1", title: "Canción", artist: "A", imageUrl: null },
};

/** Estados que piden atención: la capa de música no se pinta (#61). */
const ATTENTION: PetSnapshot["state"][] = ["waiting", "limited"];
const WITH_LAYER = ALL_STATES.filter((s) => !ATTENTION.includes(s));

describe("capa de música", () => {
  it("el data-look depende solo de state, con y sin listening", () => {
    for (const listening of [null, LISTENING]) {
      const looks = ALL_STATES.map((state) => {
        const { container, unmount } = render(
          <Pet state={state} level={1} fatigue={0.3} listening={listening} />,
        );
        const look = container
          .querySelector("[data-look]")
          ?.getAttribute("data-look");
        unmount();
        return look;
      });
      expect(looks).toEqual(ALL_STATES);
    }
  });

  it("los cascos aparecen una sola vez en los 10 estados con capa, y solo con listening", () => {
    expect(WITH_LAYER).toHaveLength(10);
    for (const state of WITH_LAYER) {
      const on = render(
        <Pet state={state} level={1} fatigue={0} listening={LISTENING} />,
      );
      expect(on.queryAllByTestId("headphones"), state).toHaveLength(1);
      on.unmount();

      const off = render(<Pet state={state} level={1} fatigue={0} />);
      expect(off.queryAllByTestId("headphones"), state).toHaveLength(0);
      off.unmount();
    }
  });

  it("waiting y limited no pintan ningún elemento de la capa", () => {
    for (const state of ATTENTION) {
      const { container, unmount } = render(
        <Pet state={state} level={1} fatigue={0} listening={LISTENING} />,
      );
      expect(container.querySelector("[data-music]"), state).toBeNull();
      unmount();
    }
  });

  it("con el interruptor general apagado no se pinta nada, en ningún estado", () => {
    for (const state of ALL_STATES) {
      const { container, unmount } = render(
        <Pet
          state={state}
          level={1}
          fatigue={0}
          listening={LISTENING}
          musicPrefs={{ enabled: false }}
        />,
      );
      expect(container.querySelector("[data-music]"), state).toBeNull();
      unmount();
    }
  });

  it("los cascos van dentro del grupo de la cabeza, que existe en las 12 escenas", () => {
    for (const state of ALL_STATES) {
      const { container, unmount } = render(
        <Pet state={state} level={1} fatigue={0} listening={LISTENING} />,
      );
      const head = container.querySelector('[class*="head"]');
      expect(head, state).not.toBeNull();
      if (!ATTENTION.includes(state)) {
        expect(
          head?.querySelector("[data-testid='headphones']"),
          state,
        ).not.toBeNull();
      }
      unmount();
    }
  });

  it("el LED lleva el color de la vibe y el resto de la escena no cambia de color", () => {
    const { container } = render(
      <Pet
        state="coding"
        level={1}
        fatigue={0}
        listening={{ ...LISTENING, vibe: "intensa" }}
      />,
    );
    const phones = screen.getByTestId("headphones");
    expect(phones.dataset.vibe).toBe("intensa");
    expect(phones.querySelectorAll("circle")[0]).toHaveAttribute(
      "fill",
      "#F2A23A",
    );
    // Sin la capa, el markup es el mismo salvo los cascos: el cuerpo no cambia.
    const withPhones = container.querySelector("[data-look]");
    withPhones?.querySelector("[data-testid='headphones']")?.remove();
    const bare = render(<Pet state="coding" level={1} fatigue={0} />);
    expect(withPhones?.innerHTML).toBe(
      bare.container.querySelector("[data-look]")?.innerHTML,
    );
  });
});

describe("animación de la capa (#62)", () => {
  const vars = (el: HTMLElement) => ({
    beat: el.style.getPropertyValue("--beat"),
    amp: Number(el.style.getPropertyValue("--amp")),
    color: el.style.getPropertyValue("--mx-color"),
  });
  const withBpm = (
    bpm: number | null,
    vibe: Listening["vibe"] = "fiesta",
  ): Listening => ({
    ...LISTENING,
    vibe,
    bpm,
  });

  it("a igual BPM, más fatiga reduce la amplitud sin cambiar la velocidad", () => {
    const read = (fatigue: number) => {
      const { unmount } = render(
        <Pet
          state="coding"
          level={1}
          fatigue={fatigue}
          listening={withBpm(120)}
        />,
      );
      const v = vars(screen.getByTestId("pet") as unknown as HTMLElement);
      unmount();
      return v;
    };
    const [fresh, mid, tired] = [0.1, 0.5, 0.95].map(read);
    expect(fresh?.beat).toBe("0.5s");
    expect(mid?.beat).toBe("0.5s");
    expect(tired?.beat).toBe("0.5s");
    expect(fresh?.amp).toBe(1);
    expect((mid?.amp ?? 0) < 1 && (mid?.amp ?? 0) > (tired?.amp ?? 0)).toBe(
      true,
    );
    expect(tired?.amp).toBeCloseTo(0.3, 5);
  });

  it("con amortiguación 0 la fatiga no toca la amplitud", () => {
    render(
      <Pet
        state="coding"
        level={1}
        fatigue={1}
        listening={withBpm(120)}
        musicPrefs={{ damping: 0 }}
      />,
    );
    expect(vars(screen.getByTestId("pet") as unknown as HTMLElement).amp).toBe(
      1,
    );
  });

  it("la velocidad sigue al BPM; sin BPM no hay NaN", () => {
    render(
      <Pet state="coding" level={1} fatigue={0} listening={withBpm(60)} />,
    );
    expect(vars(screen.getByTestId("pet") as unknown as HTMLElement).beat).toBe(
      "1s",
    );
    cleanup();
    render(
      <Pet
        state="coding"
        level={1}
        fatigue={0}
        listening={withBpm(null, "podcast")}
      />,
    );
    expect(
      vars(screen.getByTestId("pet") as unknown as HTMLElement).beat,
    ).not.toMatch(/NaN/);
  });

  it("la vibe, el movimiento y el color salen en el <svg>; sin capa no hay nada", () => {
    const { unmount } = render(
      <Pet
        state="coding"
        level={1}
        fatigue={0}
        listening={withBpm(120, "intensa")}
      />,
    );
    const pet = screen.getByTestId("pet") as unknown as HTMLElement;
    expect(pet.dataset.vibe).toBe("intensa");
    expect(pet.dataset.motion).toBe("head");
    expect(vars(pet).color).toBe("#F2A23A");
    unmount();

    render(<Pet state="coding" level={1} fatigue={0} />);
    const bare = screen.getByTestId("pet") as unknown as HTMLElement;
    expect(bare.dataset.vibe).toBeUndefined();
    expect(bare.style.getPropertyValue("--beat")).toBe("");
  });

  it("'solo el accesorio' no mueve la cabeza", () => {
    render(
      <Pet
        state="coding"
        level={1}
        fatigue={0}
        listening={withBpm(120)}
        musicPrefs={{ motion: "accessory" }}
      />,
    );
    expect(
      (screen.getByTestId("pet") as unknown as HTMLElement).dataset.motion,
    ).toBe("accessory");
  });

  it("el color 'teal' ignora la vibe", () => {
    render(
      <Pet
        state="coding"
        level={1}
        fatigue={0}
        listening={withBpm(120, "intensa")}
        musicPrefs={{ color: "teal" }}
      />,
    );
    expect(
      vars(screen.getByTestId("pet") as unknown as HTMLElement).color,
    ).toBe("#39E0C8");
  });

  it("notas y ondas están con la capa, y con fallback 'quiet' sin datos solo quedan los cascos", () => {
    const { container, unmount } = render(
      <Pet
        state="coding"
        level={1}
        fatigue={0}
        listening={withBpm(null, "neutral")}
      />,
    );
    expect(container.querySelector("[data-music='fx']")).not.toBeNull();
    unmount();

    const quiet = render(
      <Pet
        state="coding"
        level={1}
        fatigue={0}
        listening={withBpm(null, "neutral")}
        musicPrefs={{ fallback: "quiet" }}
      />,
    );
    expect(quiet.container.querySelector("[data-music='fx']")).toBeNull();
    expect(quiet.queryAllByTestId("headphones")).toHaveLength(1);
  });

  it("al parar la música los cascos se funden y se desmontan después", () => {
    vi.useFakeTimers();
    const { rerender, container } = render(
      <Pet state="coding" level={1} fatigue={0} listening={LISTENING} />,
    );
    act(() => vi.advanceTimersByTime(50));
    expect(screen.getByTestId("headphones").dataset.visible).toBe("true");

    rerender(<Pet state="coding" level={1} fatigue={0} listening={null} />);
    // Sigue montado, ya fundiéndose, con la última vibe.
    expect(screen.getByTestId("headphones").dataset.visible).toBe("false");
    expect(screen.getByTestId("headphones").dataset.vibe).toBe("fiesta");

    act(() => vi.advanceTimersByTime(400));
    expect(container.querySelector("[data-music]")).toBeNull();
    vi.useRealTimers();
  });

  it("en waiting y limited, o con el interruptor apagado, la capa se va ya, sin fundido", () => {
    for (const [state, prefs] of [
      ["waiting", {}],
      ["limited", {}],
      ["coding", { enabled: false }],
    ] as const) {
      const { rerender, container, unmount } = render(
        <Pet state="coding" level={1} fatigue={0} listening={LISTENING} />,
      );
      rerender(
        <Pet
          state={state}
          level={1}
          fatigue={0}
          listening={LISTENING}
          musicPrefs={prefs}
        />,
      );
      expect(
        container.querySelector("[data-music]"),
        `${state} ${JSON.stringify(prefs)}`,
      ).toBeNull();
      unmount();
    }
  });

  it("el cuerpo no cambia con la capa animada: solo se suman cascos y notas", () => {
    const { container } = render(
      <Pet state="coding" level={1} fatigue={0.5} listening={withBpm(120)} />,
    );
    const scene = container.querySelector("[data-look]");
    scene?.querySelector("[data-testid='headphones']")?.remove();
    const bare = render(<Pet state="coding" level={1} fatigue={0.5} />);
    expect(scene?.innerHTML).toBe(
      bare.container.querySelector("[data-look]")?.innerHTML,
    );
  });
});

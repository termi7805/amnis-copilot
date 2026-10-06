import type { PetFocus, SessionsResponse } from "@amnis/shared";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FocusPicker } from "./FocusPicker.tsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const NOW = new Date("2026-01-10T12:00:00Z");

const sessions: SessionsResponse = {
  repos: [
    {
      repoRoot: "/home/x/repo",
      name: "repo",
      worktrees: [
        {
          worktree: "/home/x/repo-1",
          name: "repo-1",
          branch: "111-selector",
          sessions: [
            {
              sessionId: "aaaaaa111",
              state: "coding",
              lastEventAt: "2026-01-10T11:58:00Z",
              startedAt: "2026-01-10T10:00:00Z",
              alive: true,
            },
            {
              sessionId: "bbbbbb222",
              state: "sleeping",
              lastEventAt: "2026-01-10T09:00:00Z",
              startedAt: "2026-01-10T08:00:00Z",
              alive: false,
            },
          ],
        },
      ],
    },
  ],
};

function setup(over: Partial<Parameters<typeof FocusPicker>[0]> = {}) {
  const loadSessions = vi.fn().mockResolvedValue(sessions);
  const save = vi.fn().mockResolvedValue({ ok: true });
  render(
    <FocusPicker
      focus={{ kind: "auto" }}
      now={NOW}
      loadSessions={loadSessions}
      save={save}
      {...over}
    />,
  );
  return { loadSessions, save };
}

const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Foco de la mascota" }));
  await screen.findByText("111-selector");
};

describe("FocusPicker", () => {
  it("el botón enseña el foco actual y la lista no se pide hasta abrir", () => {
    const { loadSessions } = setup({
      focus: { kind: "worktree", worktree: "/home/x/repo-1" },
    });
    expect(
      screen.getByRole("button", { name: "Foco de la mascota" }),
    ).toHaveTextContent("repo-1");
    expect(loadSessions).not.toHaveBeenCalled();
  });

  it("pinta Automático, repo, worktree con rama y sesiones con estado", async () => {
    setup();
    await open();
    expect(screen.getByRole("button", { name: "Automático" })).toBeVisible();
    expect(screen.getByRole("button", { name: "repo" })).toBeVisible();
    expect(screen.getByRole("button", { name: /repo-1/ })).toBeVisible();
    expect(screen.getByText("Escribiendo código · aaaaaa")).toBeVisible();
    expect(screen.getByText("hace 2 min")).toBeVisible();
  });

  it("marca el foco actual", async () => {
    const focus: PetFocus = { kind: "worktree", worktree: "/home/x/repo-1" };
    setup({ focus });
    await open();
    expect(screen.getByRole("button", { name: /repo-1/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Automático" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("elegir un worktree guarda el foco y cierra la lista", async () => {
    const { save } = setup();
    await open();
    fireEvent.click(screen.getByRole("button", { name: /repo-1/ }));
    expect(save).toHaveBeenCalledExactlyOnceWith({
      petFocus: { kind: "worktree", worktree: "/home/x/repo-1" },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "Foco de la mascota" }),
      ).toBeNull(),
    );
  });

  it("elegir una sesión viva guarda sesión y worktree", async () => {
    const { save } = setup();
    await open();
    fireEvent.click(screen.getByText("Escribiendo código · aaaaaa"));
    expect(save).toHaveBeenCalledExactlyOnceWith({
      petFocus: {
        kind: "session",
        sessionId: "aaaaaa111",
        worktree: "/home/x/repo-1",
      },
    });
  });

  it("«Todas» va debajo de Automático y guarda el foco all", async () => {
    const { save } = setup();
    await open();
    const names = screen
      .getAllByRole("button")
      .map((b) => b.textContent)
      .slice(1, 3);
    expect(names).toEqual(["Automático", "Todas"]);
    fireEvent.click(screen.getByRole("button", { name: "Todas" }));
    expect(save).toHaveBeenCalledExactlyOnceWith({ petFocus: { kind: "all" } });
  });

  it("en la mascota las terminadas no salen ni hay interruptor", async () => {
    setup();
    await open();
    expect(screen.queryByRole("button", { name: /bbbbbb/ })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("un worktree sin sesiones vivas sigue en la lista", async () => {
    const wt = structuredClone(sessions);
    for (const w of wt.repos.flatMap((r) => r.worktrees)) {
      w.sessions = w.sessions.filter((x) => !x.alive);
    }
    setup({ loadSessions: vi.fn().mockResolvedValue(wt) });
    await open();
    expect(screen.getByRole("button", { name: /repo-1/ })).toBeVisible();
    expect(screen.queryByText(/Aún no hay sesiones/)).toBeNull();
  });

  it("si no se puede cargar la lista, lo dice", async () => {
    setup({ loadSessions: vi.fn().mockRejectedValue(new Error("x")) });
    fireEvent.click(screen.getByRole("button", { name: "Foco de la mascota" }));
    expect(
      await screen.findByText("No se pudo cargar la lista de sesiones."),
    ).toBeVisible();
  });

  it("si falla el guardado, enseña el mensaje y deja la lista abierta", async () => {
    setup({
      save: vi
        .fn()
        .mockResolvedValue({ ok: false, message: "petFocus inválido" }),
    });
    await open();
    fireEvent.click(screen.getByRole("button", { name: /repo-1/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "petFocus inválido",
    );
    expect(screen.getByRole("button", { name: "Automático" })).toBeVisible();
  });

  it("Escape cierra la lista", async () => {
    setup();
    await open();
    fireEvent.keyDown(screen.getByRole("button", { name: "Automático" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("button", { name: "Automático" })).toBeNull();
  });
});

describe("FocusPicker — aspecto por layout", () => {
  it("en el dashboard el disparador lleva chevron de trazo, no el ▾ del panel", () => {
    setup({ layout: "popover" });
    const trigger = screen.getByRole("button", { name: "Foco de la mascota" });
    expect(screen.getByTestId("focus-chevron")).toBeInTheDocument();
    expect(trigger).not.toHaveTextContent("▾");
  });

  it("en el panel de la mascota conserva el ▾", () => {
    setup();
    const trigger = screen.getByRole("button", { name: "Foco de la mascota" });
    expect(trigger).toHaveTextContent("▾");
    expect(screen.queryByTestId("focus-chevron")).toBeNull();
  });
});

describe("FocusPicker — Mostrar terminadas (dashboard)", () => {
  const KEY = "amnis-focus-show-ended";
  const props = { layout: "popover", showEnded: "toggle" } as const;
  const sw = () => screen.getByRole("switch", { name: "Mostrar terminadas" });

  it("apagado de partida: la terminada no sale", async () => {
    setup(props);
    await open();
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("button", { name: /bbbbbb/ })).toBeNull();
  });

  it("al activarlo sale, deshabilitada, sin cerrar la lista ni guardar foco", async () => {
    const { save } = setup(props);
    await open();
    fireEvent.click(sw());
    const dead = screen.getByRole("button", { name: /bbbbbb/ });
    expect(dead).toBeDisabled();
    expect(dead).toHaveTextContent("terminada");
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(sw());
    expect(screen.queryByRole("button", { name: /bbbbbb/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Automático" })).toBeVisible();
  });

  it("recuerda la elección al volver a montar", async () => {
    const first = setup(props);
    await open();
    fireEvent.click(sw());
    expect(localStorage.getItem(KEY)).toBe("1");
    cleanup();
    setup(props);
    await open();
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /bbbbbb/ })).toBeVisible();
    expect(first.loadSessions).toHaveBeenCalledOnce();
  });

  it("apagarlo borra la clave", async () => {
    setup(props);
    await open();
    fireEvent.click(sw());
    fireEvent.click(sw());
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

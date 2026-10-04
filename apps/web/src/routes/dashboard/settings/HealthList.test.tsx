import { type HealthResponse, msg } from "@amnis/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n/index.ts";
import { HealthList, type HealthListActions } from "./HealthList.tsx";

afterEach(cleanup);

const DAEMON = {
  version: "0.0.1",
  startedAt: "2026-01-01T09:12:00Z",
  eventsReceived: 1284,
};

const OK_ALL: HealthResponse = {
  daemon: DAEMON,
  checks: [
    {
      name: "daemon",
      ok: true,
      message: msg("raw", { text: "El daemon responde." }),
      remedy: null,
    },
    {
      name: "hooks",
      ok: true,
      message: msg("raw", { text: "Los hooks de Amnis están instalados." }),
      remedy: null,
    },
  ],
};

const HOOKS_BROKEN: HealthResponse = {
  daemon: DAEMON,
  checks: [
    OK_ALL.checks[0] as HealthResponse["checks"][number],
    {
      name: "hooks",
      ok: false,
      message: msg("raw", { text: "Faltan hooks de Amnis: Notification." }),
      remedy: msg("raw", { text: "Instálalos con `amnis install-hooks`." }),
    },
    {
      name: "ingesta",
      ok: false,
      message: msg("raw", { text: "Nunca se ha ingerido nada." }),
      remedy: msg("raw", { text: "Ejecuta `amnis ingest`." }),
    },
  ],
};

function actions(over: Partial<HealthListActions> = {}): HealthListActions {
  return {
    repairHooks: vi.fn().mockResolvedValue({
      ok: true,
      body: { added: ["Notification"], backup: null },
    }),
    connectSpotify: vi.fn().mockResolvedValue({ ok: true, body: {} }),
    disconnectSpotify: vi.fn().mockResolvedValue({ ok: true, body: {} }),
    ...over,
  };
}

describe("HealthList", () => {
  it("cuenta los avisos y ofrece Reparar hooks solo si fallan", () => {
    const { rerender } = render(
      <HealthList
        health={HOOKS_BROKEN}
        unreachable={false}
        refresh={() => {}}
        mediaStatus="ok"
        actions={actions()}
      />,
    );
    expect(screen.getByText("2 avisos")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reparar hooks" })).toBeVisible();

    rerender(
      <HealthList
        health={OK_ALL}
        unreachable={false}
        refresh={() => {}}
        mediaStatus="ok"
        actions={actions()}
      />,
    );
    expect(screen.getByText("OK")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reparar hooks" })).toBeNull();
  });

  it("sin botón para un fallo, el remedio sale como texto con el comando en <code>", () => {
    render(
      <HealthList
        health={HOOKS_BROKEN}
        unreachable={false}
        refresh={() => {}}
        mediaStatus="ok"
        actions={actions()}
      />,
    );
    const code = screen.getByText("amnis ingest");
    expect(code.tagName).toBe("CODE");
    // El de hooks tiene botón: su remedio de CLI sobra.
    expect(screen.queryByText("amnis install-hooks")).toBeNull();
  });

  it("Reparar hooks llama a la acción, refresca y la fila pasa a OK sin recargar", async () => {
    const repair = actions();
    function Harness() {
      const [health, setHealth] = useState(HOOKS_BROKEN);
      return (
        <HealthList
          health={health}
          unreachable={false}
          refresh={() =>
            setHealth({
              ...HOOKS_BROKEN,
              checks: HOOKS_BROKEN.checks.map((c) =>
                c.name === "hooks"
                  ? {
                      ...c,
                      ok: true,
                      message: msg("raw", {
                        text: "Los hooks de Amnis están instalados.",
                      }),
                      remedy: null,
                    }
                  : c,
              ),
            })
          }
          mediaStatus="ok"
          actions={repair}
        />
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Reparar hooks" }));
    expect(
      await screen.findByText("Los hooks de Amnis están instalados."),
    ).toBeVisible();
    expect(repair.repairHooks).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Reparado: Notification.",
    );
    expect(screen.queryByRole("button", { name: "Reparar hooks" })).toBeNull();
  });

  it("un fallo al reparar se ve en la fila y no refresca", async () => {
    const refresh = vi.fn();
    render(
      <HealthList
        health={HOOKS_BROKEN}
        unreachable={false}
        refresh={refresh}
        mediaStatus="ok"
        actions={actions({
          repairHooks: vi.fn().mockResolvedValue({
            ok: false,
            message: "Sin permisos.",
          }),
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reparar hooks" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin permisos.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["not-logged-in", "Conectar"],
    ["ok", "Desconectar"],
    ["no-device", "Desconectar"],
  ] as const)("Spotify en %s ofrece «%s»", (mediaStatus, label) => {
    render(
      <HealthList
        health={{
          daemon: DAEMON,
          checks: [
            {
              name: "spotify",
              ok: true,
              message: msg("raw", { text: "x" }),
              remedy: null,
            },
          ],
        }}
        unreachable={false}
        refresh={() => {}}
        mediaStatus={mediaStatus}
        actions={actions()}
      />,
    );
    expect(screen.getByRole("button", { name: label })).toBeVisible();
  });

  it("en inglés, los mensajes del daemon salen traducidos y cambian sin recargar", async () => {
    const health: HealthResponse = {
      daemon: DAEMON,
      checks: [
        {
          name: "hooks",
          ok: false,
          message: msg("health.hooks.missing", { events: "Notification" }),
          remedy: msg("health.hooks.remedy"),
        },
        {
          name: "ingesta",
          ok: false,
          message: msg("health.ingest.never"),
          remedy: msg("health.ingest.run"),
        },
      ],
    };
    render(
      <HealthList
        health={health}
        unreachable={false}
        refresh={() => {}}
        mediaStatus={undefined}
        actions={actions()}
      />,
    );
    expect(
      screen.getByText("Faltan hooks de Amnis: Notification."),
    ).toBeVisible();

    await act(async () => {
      await i18n.changeLanguage("en");
    });
    expect(
      screen.getByText("Missing Amnis hooks: Notification."),
    ).toBeVisible();
    expect(screen.getByText("Nothing has ever been ingested.")).toBeVisible();
    expect(screen.getByText("amnis ingest").closest("div")).toHaveTextContent(
      "Run amnis ingest.",
    );
  });

  it("Spotify sin configurar no ofrece botón", () => {
    render(
      <HealthList
        health={{
          daemon: DAEMON,
          checks: [
            {
              name: "spotify",
              ok: true,
              message: msg("raw", { text: "No configurado" }),
              remedy: null,
            },
          ],
        }}
        unreachable={false}
        refresh={() => {}}
        mediaStatus="not-configured"
        actions={actions()}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("Desconectar llama a la acción y refresca", async () => {
    const a = actions();
    const refresh = vi.fn();
    render(
      <HealthList
        health={{
          daemon: DAEMON,
          checks: [
            {
              name: "spotify",
              ok: true,
              message: msg("raw", { text: "x" }),
              remedy: null,
            },
          ],
        }}
        unreachable={false}
        refresh={refresh}
        mediaStatus="ok"
        actions={a}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(a.disconnectSpotify).toHaveBeenCalledOnce();
  });

  it("si el daemon no contesta, lo dice", () => {
    render(
      <HealthList
        health={null}
        unreachable
        refresh={() => {}}
        mediaStatus={undefined}
        actions={actions()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudo contactar con Amnis.",
    );
  });
});

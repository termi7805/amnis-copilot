import type { MediaSnapshot, PetSnapshot } from "@amnis/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaPanel, type MediaPanelProps } from "./MediaPanel.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const pet: PetSnapshot = {
  state: "coding",
  since: "2026-01-01T00:00:00Z",
  fatigue: 0.5,
  level: 1,
  reason: "test",
  commitHash: null,
  listening: null,
};

const playing: MediaSnapshot = {
  status: "ok",
  isPlaying: true,
  track: {
    id: "t1",
    title: "Blinding Lights",
    artists: ["The Weeknd"],
    album: "After Hours",
    imageUrl: null,
    durationMs: 200_000,
  },
  progressMs: 1000,
  measuredAt: "2026-01-01T00:00:00Z",
  shuffle: false,
  repeat: "off",
  device: { id: "d1", name: "Móvil", type: "Smartphone" },
  vibe: "neutral",
  bpm: null,
};

function renderPanel(props: Partial<MediaPanelProps> = {}) {
  return render(
    <MediaPanel
      pet={pet}
      resetsAt={null}
      now={new Date("2026-01-01T00:12:00Z")}
      media={playing}
      status="connected"
      onSelectPanel={vi.fn()}
      {...props}
    />,
  );
}

describe("MediaPanel", () => {
  it("pinta la cabecera con pestañas y el reproductor", () => {
    const onSelectPanel = vi.fn();
    renderPanel({ onSelectPanel });
    expect(screen.getByText("Blinding Lights")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Cuota" }));
    expect(onSelectPanel).toHaveBeenCalledWith("quota");
  });

  it("sigue mostrando al bicho con su estado y el tiempo que lleva", () => {
    renderPanel();
    expect(screen.getByTestId("pet")).toBeInTheDocument();
    expect(screen.getByTestId("activity-label")).toHaveTextContent(
      "Escribiendo código",
    );
    expect(screen.getByTestId("activity-duration")).toHaveTextContent("12 min");
  });

  it("el bicho del panel lleva los cascos cuando suena algo (#61)", () => {
    renderPanel({
      pet: {
        ...pet,
        listening: {
          vibe: "fiesta",
          bpm: 124,
          track: { id: "t1", title: "T", artist: "A", imageUrl: null },
        },
      },
    });
    expect(screen.getByTestId("headphones")).toBeInTheDocument();
  });

  it("offline, el bicho pasa a la escena de sin conexión", () => {
    const { container } = renderPanel({ status: "offline" });
    expect(
      container.querySelector("[data-look]")?.getAttribute("data-look"),
    ).toBe("offline");
  });

  it("sin datos del daemon no hay bicho y el reproductor lo dice", () => {
    renderPanel({ pet: null, media: null, status: "offline" });
    expect(screen.queryByTestId("activity-label")).toBeNull();
    expect(screen.getByText("Amnis no responde")).toBeInTheDocument();
  });

  it("una orden del reproductor va al daemon", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/media/pause"),
      { method: "POST" },
    );
  });
});

import type { MediaSnapshot } from "@amnis/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaPanel } from "./MediaPanel.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

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

describe("MediaPanel", () => {
  it("pinta la cabecera con pestañas y el reproductor", () => {
    const onSelectPanel = vi.fn();
    render(
      <MediaPanel
        media={playing}
        status="connected"
        onSelectPanel={onSelectPanel}
      />,
    );
    expect(screen.getByText("Blinding Lights")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Cuota" }));
    expect(onSelectPanel).toHaveBeenCalledWith("quota");
  });

  it("sin datos del daemon, el reproductor lo dice", () => {
    render(
      <MediaPanel media={null} status="offline" onSelectPanel={vi.fn()} />,
    );
    expect(screen.getByText("Amnis no responde")).toBeInTheDocument();
  });

  it("una orden del reproductor va al daemon", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MediaPanel media={playing} status="connected" onSelectPanel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/media/pause"),
      { method: "POST" },
    );
  });
});

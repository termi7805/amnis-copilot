import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSkillStatus, installSkill } from "../../../api/skill.ts";
import { SkillInstall } from "./SkillInstall.tsx";

vi.mock("../../../api/skill.ts", () => ({
  fetchSkillStatus: vi.fn(),
  installSkill: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SkillInstall", () => {
  it("sin la skill, ofrece instalarla y pasa a «instalada» al pulsar", async () => {
    vi.mocked(fetchSkillStatus).mockResolvedValue({
      installed: false,
      current: false,
    });
    vi.mocked(installSkill).mockResolvedValue({
      ok: true,
      body: { installed: true, current: true },
    });
    render(<SkillInstall />);

    fireEvent.click(await screen.findByRole("button", { name: /Instalar/ }));

    expect(await screen.findByText(/\/amnis-skin/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(installSkill).toHaveBeenCalledTimes(1);
  });

  it("si la instalada no es la de esta versión, ofrece actualizar", async () => {
    vi.mocked(fetchSkillStatus).mockResolvedValue({
      installed: true,
      current: false,
    });
    render(<SkillInstall />);
    expect(
      await screen.findByRole("button", { name: /Actualizar/ }),
    ).toBeInTheDocument();
  });

  it("si falla, lo dice y deja reintentar", async () => {
    vi.mocked(fetchSkillStatus).mockResolvedValue({
      installed: false,
      current: false,
    });
    vi.mocked(installSkill).mockResolvedValue({
      ok: false,
      message: "EACCES",
    });
    render(<SkillInstall />);
    fireEvent.click(await screen.findByRole("button", { name: /Instalar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("EACCES");
    expect(screen.getByRole("button", { name: /Instalar/ })).toBeEnabled();
  });

  it("sin daemon no pinta nada", async () => {
    vi.mocked(fetchSkillStatus).mockRejectedValue(new Error("down"));
    const { container } = render(<SkillInstall />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});

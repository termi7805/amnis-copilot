import type { MediaDevice, MediaDeviceOption } from "@amnis/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaDevicesResult } from "../../api/media.ts";
import { DeviceSelector, deviceKind } from "./DeviceSelector.tsx";

const pc: MediaDeviceOption = {
  id: "pc",
  name: "Mi PC",
  type: "Computer",
  isActive: true,
  isRestricted: false,
};
const phone: MediaDeviceOption = {
  id: "movil",
  name: "Móvil",
  type: "Smartphone",
  isActive: false,
  isRestricted: false,
};
const restricted: MediaDeviceOption = {
  id: "tv",
  name: "Tele del salón",
  type: "TV",
  isActive: false,
  isRestricted: true,
};

const current: MediaDevice = { id: "pc", name: "Mi PC", type: "Computer" };

afterEach(cleanup);

function setup(
  devices: MediaDeviceOption[] | MediaDevicesResult = [pc, phone, restricted],
  onTransfer: (id: string) => Promise<boolean> = async () => true,
  cur: MediaDevice | null = current,
) {
  const result: MediaDevicesResult = Array.isArray(devices)
    ? { ok: true, devices }
    : devices;
  const loadDevices = vi.fn(() => Promise.resolve(result));
  const transfer = vi.fn(onTransfer);
  const view = render(
    <DeviceSelector
      current={cur}
      loadDevices={loadDevices}
      onTransfer={transfer}
    />,
  );
  return { loadDevices, transfer, ...view };
}

async function open() {
  fireEvent.click(
    screen.getByRole("button", { name: "Dispositivo de reproducción" }),
  );
  await act(async () => {});
}

describe("DeviceSelector", () => {
  it("no pide la lista hasta que se abre, y la pide una vez por apertura", async () => {
    const { loadDevices } = setup();
    expect(loadDevices).not.toHaveBeenCalled();
    await open();
    expect(loadDevices).toHaveBeenCalledTimes(1);
  });

  it("el disparador muestra el dispositivo actual, o invita a elegir", () => {
    setup();
    expect(screen.getByText("Mi PC")).toBeInTheDocument();
    cleanup();
    setup([], undefined, null);
    expect(screen.getByText("Elegir dispositivo")).toBeInTheDocument();
  });

  it("marca el activo y no se puede elegir", async () => {
    setup();
    await open();
    const active = screen.getByRole("button", { name: /Mi PC.*Sonando aquí/ });
    expect(active).toBeDisabled();
    expect(active).toHaveAttribute("data-active", "true");
  });

  it("un dispositivo restringido se ve, con el motivo, y no se puede elegir", async () => {
    const { transfer } = setup();
    await open();
    const row = screen.getByRole("button", {
      name: /Tele del salón.*No admite control remoto/,
    });
    expect(row).toBeDisabled();
    fireEvent.click(row);
    expect(transfer).not.toHaveBeenCalled();
  });

  it("un dispositivo sin id tampoco se puede elegir", async () => {
    const { transfer } = setup([pc, { ...phone, id: null }]);
    await open();
    const row = screen.getByRole("button", { name: /Móvil/ });
    expect(row).toBeDisabled();
    fireEvent.click(row);
    expect(transfer).not.toHaveBeenCalled();
  });

  it("elegir otro llama a onTransfer y no cambia el activo en local", async () => {
    const { transfer } = setup([pc, phone], async () => false);
    await open();
    fireEvent.click(screen.getByRole("button", { name: /^Móvil/ }));
    await act(async () => {});
    expect(transfer).toHaveBeenCalledExactlyOnceWith("movil");
    // Sigue activo el PC: lo confirmará el siguiente `media`, no esta lista.
    expect(
      screen.getByRole("button", { name: /Mi PC.*Sonando aquí/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Móvil.*Sonando aquí/ }),
    ).toBeNull();
  });

  it("con éxito se cierra la lista; con fallo se queda abierta", async () => {
    const ok = setup([pc, phone], async () => true);
    await open();
    fireEvent.click(screen.getByRole("button", { name: /^Móvil/ }));
    await act(async () => {});
    expect(screen.queryByRole("group", { name: "Dispositivos" })).toBeNull();
    ok.unmount();

    setup([pc, phone], async () => false);
    await open();
    fireEvent.click(screen.getByRole("button", { name: /^Móvil/ }));
    await act(async () => {});
    expect(
      screen.getByRole("group", { name: "Dispositivos" }),
    ).toBeInTheDocument();
  });

  it("mientras el transfer no vuelve, la fila dice Cambiando… y no admite otro clic", async () => {
    let finish: (ok: boolean) => void = () => {};
    const { transfer } = setup(
      [pc, phone, { ...phone, id: "tablet", name: "Tablet" }],
      () => new Promise<boolean>((r) => (finish = r)),
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: /^Móvil/ }));
    expect(screen.getByText("Cambiando…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tablet/ }));
    expect(transfer).toHaveBeenCalledTimes(1);
    await act(async () => finish(true));
  });

  it("un error de carga se ve, y vuelve a pedirse al reabrir", async () => {
    const { loadDevices } = setup({
      ok: false,
      message: "Spotify no responde.",
    });
    await open();
    expect(screen.getByText("Spotify no responde.")).toBeInTheDocument();
    await open();
    await open();
    expect(loadDevices).toHaveBeenCalledTimes(2);
  });

  it("sin dispositivos, explica qué hacer", async () => {
    setup([]);
    await open();
    expect(
      screen.getByText(/Ningún dispositivo disponible/),
    ).toBeInTheDocument();
  });

  it("Escape cierra la lista", async () => {
    setup();
    await open();
    fireEvent.keyDown(screen.getByRole("group", { name: "Dispositivos" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("group", { name: "Dispositivos" })).toBeNull();
  });

  it("una respuesta vieja no pisa la de la reapertura", async () => {
    let first: (r: MediaDevicesResult) => void = () => {};
    const loadDevices = vi
      .fn<() => Promise<MediaDevicesResult>>()
      .mockImplementationOnce(() => new Promise((r) => (first = r)))
      .mockResolvedValueOnce({ ok: true, devices: [phone] });
    render(
      <DeviceSelector
        current={current}
        loadDevices={loadDevices}
        onTransfer={async () => true}
      />,
    );
    await open(); // pide, sin respuesta
    await open(); // cierra
    await open(); // reabre: segunda petición
    await act(async () => first({ ok: true, devices: [pc] }));
    expect(screen.getByRole("button", { name: /^Móvil/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sonando aquí/ })).toBeNull();
  });

  it("cada tipo de Spotify tiene su icono", () => {
    expect(
      ["Computer", "Smartphone", "Tablet", "Speaker", "TV", "Raro"].map(
        deviceKind,
      ),
    ).toEqual(["computer", "phone", "tablet", "speaker", "tv", "other"]);
    expect(deviceKind("CastAudio")).toBe("speaker");
    expect(deviceKind("CastVideo")).toBe("tv");
  });
});

describe("DeviceSelector — alwaysOpen", () => {
  function setupOpen(cur: MediaDevice | null = current) {
    const loadDevices = vi.fn<() => Promise<MediaDevicesResult>>(() =>
      Promise.resolve({ ok: true, devices: [pc, phone, restricted] }),
    );
    const transfer = vi.fn(async (_id: string) => true);
    const props = { loadDevices, onTransfer: transfer, alwaysOpen: true };
    const view = render(<DeviceSelector current={cur} {...props} />);
    return { loadDevices, transfer, props, ...view };
  }

  it("pide la lista al montar y la muestra sin botón que desplegar", async () => {
    const { loadDevices } = setupOpen();
    await act(async () => {});
    expect(loadDevices).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Dispositivo de reproducción" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /Móvil/ })).toBeInTheDocument();
  });

  it("tras transferir la lista sigue abierta", async () => {
    const { transfer } = setupOpen();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Móvil/ }));
    await act(async () => {});
    expect(transfer).toHaveBeenCalledWith("movil");
    expect(screen.getByRole("group", { name: "Dispositivos" })).toBeVisible();
  });

  it("vuelve a pedir la lista cuando cambia el dispositivo actual, sin parpadear", async () => {
    const { loadDevices, props, rerender } = setupOpen();
    await act(async () => {});
    rerender(
      <DeviceSelector
        current={{ id: "movil", name: "Móvil", type: "Smartphone" }}
        {...props}
      />,
    );
    expect(screen.queryByText("Buscando dispositivos…")).toBeNull();
    await act(async () => {});
    expect(loadDevices).toHaveBeenCalledTimes(2);
  });
});

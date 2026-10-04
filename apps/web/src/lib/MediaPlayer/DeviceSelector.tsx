import type { MediaDevice, MediaDeviceOption } from "@amnis/shared";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDevicesResult } from "../../api/media.ts";
import styles from "./MediaPlayer.module.css";

export type DeviceKind =
  | "computer"
  | "phone"
  | "tablet"
  | "speaker"
  | "tv"
  | "other";

export function deviceKind(type: string): DeviceKind {
  switch (type) {
    case "Computer":
      return "computer";
    case "Smartphone":
      return "phone";
    case "Tablet":
      return "tablet";
    case "Speaker":
    case "CastAudio":
    case "AVR":
    case "Automobile":
      return "speaker";
    case "TV":
    case "CastVideo":
    case "GameConsole":
    case "STB":
      return "tv";
    default:
      return "other";
  }
}

const ICON: Record<DeviceKind, ReactNode> = {
  computer: (
    <>
      <rect x="3" y="4" width="18" height="12" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" />
      <path d="M11 18h2" />
    </>
  ),
  tablet: (
    <>
      <rect x="4" y="3" width="16" height="18" />
      <path d="M11 18h2" />
    </>
  ),
  speaker: (
    <>
      <rect x="6" y="2" width="12" height="20" />
      <circle cx="12" cy="15" r="3" />
      <circle cx="12" cy="7" r="1" />
    </>
  ),
  tv: (
    <>
      <rect x="2" y="5" width="20" height="12" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  other: <circle cx="12" cy="12" r="8" />,
};

function DeviceIcon({ type }: { type: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      {ICON[deviceKind(type)]}
    </svg>
  );
}

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; devices: MediaDeviceOption[] };

export interface DeviceSelectorProps {
  current: MediaDevice | null;
  loadDevices: () => Promise<MediaDevicesResult>;
  onTransfer: (deviceId: string) => Promise<boolean>;
  disabled?: boolean;
  /** `popover` (dashboard): disparador de texto y la lista flota sobre la
   * tarjeta sin empujarla. Solo cambia el aspecto, no la lógica. */
  variant?: "inline" | "popover";
}

/**
 * La lista se pide al abrir. Tras elegir, el activo lo marca el siguiente
 * `media` (vía `current`), no esta lista: Spotify aún no lo ha confirmado.
 */
export function DeviceSelector({
  current,
  loadDevices,
  onTransfer,
  disabled = false,
  variant = "inline",
}: DeviceSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [transferringId, setTransferringId] = useState<string | null>(null);
  // Cerrar y reabrir deprisa no debe dejar que una respuesta vieja pise la nueva.
  const request = useRef(0);

  async function fetchList() {
    const mine = ++request.current;
    setLoad({ status: "loading" });
    const result = await loadDevices().catch(
      (): MediaDevicesResult => ({
        ok: false,
        message: t("media.devices.loadFailed"),
      }),
    );
    if (mine !== request.current) return;
    setLoad(
      result.ok
        ? { status: "ready", devices: result.devices }
        : { status: "error", message: result.message },
    );
  }

  function toggle() {
    if (open) {
      request.current++;
      setOpen(false);
      return;
    }
    setOpen(true);
    void fetchList();
  }

  async function choose(id: string) {
    if (transferringId !== null) return;
    setTransferringId(id);
    const ok = await onTransfer(id);
    setTransferringId(null);
    if (ok) {
      request.current++;
      setOpen(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && open) {
      request.current++;
      setOpen(false);
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: solo recoge Escape de los botones de dentro
    <div
      className={styles.devices}
      data-variant={variant}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className={styles.deviceTrigger}
        onClick={toggle}
        disabled={disabled}
        aria-expanded={open}
        aria-label={t("media.devices.trigger")}
      >
        {current && <DeviceIcon type={current.type} />}
        <span className={styles.deviceName}>
          {current ? current.name : t("media.devices.choose")}
        </span>
        {variant === "popover" && (
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.deviceChevron}
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {open && (
        <fieldset
          className={styles.deviceList}
          aria-label={t("media.devices.list")}
        >
          {load.status === "loading" && (
            <span className={styles.hint}>{t("media.devices.loading")}</span>
          )}
          {load.status === "error" && (
            <span className={styles.hint}>{load.message}</span>
          )}
          {load.status === "ready" && load.devices.length === 0 && (
            <span className={styles.hint}>{t("media.devices.none")}</span>
          )}
          {load.status === "ready" &&
            load.devices.map((device) => {
              const restricted = device.isRestricted || device.id === null;
              const id = device.id;
              const note = device.isActive
                ? t("media.devices.active")
                : restricted
                  ? t("media.devices.restricted")
                  : transferringId !== null && transferringId === id
                    ? t("media.devices.switching")
                    : null;
              return (
                <button
                  key={id ?? device.name}
                  type="button"
                  className={styles.deviceRow}
                  data-kind={deviceKind(device.type)}
                  data-active={device.isActive}
                  disabled={
                    disabled ||
                    device.isActive ||
                    restricted ||
                    transferringId !== null
                  }
                  onClick={() => id !== null && void choose(id)}
                >
                  <DeviceIcon type={device.type} />
                  <span className={styles.deviceName}>{device.name}</span>
                  {note && <span className={styles.deviceNote}>{note}</span>}
                </button>
              );
            })}
        </fieldset>
      )}
    </div>
  );
}

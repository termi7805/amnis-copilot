import { spawn } from "node:child_process";

/**
 * Abre `url` en el navegador del sistema, sin esperar. En Windows no se usa
 * `start`: cmd parte la URL en cada `&` de la query.
 */
export function openBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
): void {
  const [cmd, args] =
    platform === "darwin"
      ? ["open", [url]]
      : platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  const child = spawn(cmd as string, args as string[], {
    detached: true,
    stdio: "ignore",
  });
  // Sin navegador (ENOENT) no debe tumbar el daemon: el CLI imprime la URL.
  child.on("error", () => {});
  child.unref();
}

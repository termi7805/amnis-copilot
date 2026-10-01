import { PORT, SPOTIFY_REDIRECT_URI } from "../../config.ts";
import {
  deleteSpotifyToken,
  readSpotifyConfig,
  writeSpotifyConfig,
} from "../persistence/spotifyToken.ts";

function flagValue(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

async function login(args: readonly string[]): Promise<void> {
  const given = flagValue(args, "--client-id");
  if (args.includes("--client-id") && !given) {
    console.error("--client-id necesita un valor.");
    process.exitCode = 1;
    return;
  }
  if (given) writeSpotifyConfig({ clientId: given });

  if (!readSpotifyConfig()) {
    console.error(
      "Falta el Client ID de Spotify.\n" +
        "  → amnis spotify login --client-id <tu id>\n" +
        "Créalo en https://developer.spotify.com/dashboard con solo «Web API» marcado.",
    );
    process.exitCode = 1;
    return;
  }

  // Mismo camino que el botón de la UI: el daemon abre el navegador y
  // recibe el callback.
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${PORT}/api/spotify/login`, {
      method: "POST",
    });
  } catch {
    console.error("El daemon no responde. Arráncalo con `amnis serve`.");
    process.exitCode = 1;
    return;
  }
  if (!response.ok) {
    console.error(
      `El daemon respondió ${response.status} al iniciar el login.`,
    );
    process.exitCode = 1;
    return;
  }
  const { url } = (await response.json()) as { url: string };
  console.log("Se ha abierto el navegador para autorizar Spotify.");
  console.log(`Si no se abre, visita:\n  ${url}\n`);
  console.log(
    `El redirect URI registrado en tu app debe ser exactamente:\n  ${SPOTIFY_REDIRECT_URI}`,
  );
}

function logout(): void {
  deleteSpotifyToken();
  console.log("Sesión de Spotify cerrada. El Client ID se conserva.");
}

export async function runSpotifyCli(args: readonly string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "login":
      await login(rest);
      return;
    case "logout":
      logout();
      return;
    default:
      console.error("Uso: amnis spotify <login [--client-id X] | logout>");
      process.exitCode = 1;
  }
}

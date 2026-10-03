import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { CLAUDE_PROJECTS_DIR } from "../../../config.ts";
import type { ProviderUsageEvent } from "../../../domain/Provider.ts";

/**
 * Recursivo: cada subagente tiene su propio transcript en
 * `<sesión>/subagents/agent-*.jsonl` (y los de workflows, un nivel más
 * abajo), con llamadas que no están en el padre. Solo `.jsonl`: junto a
 * ellos hay `wf_*.json` que no son transcripts.
 */
export function findTranscripts(): string[] {
  let projectDirs: string[];
  try {
    projectDirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(CLAUDE_PROJECTS_DIR, d.name));
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const dir of projectDirs) {
    try {
      for (const name of readdirSync(dir, {
        recursive: true,
        encoding: "utf8",
      })) {
        if (name.endsWith(".jsonl")) files.push(join(dir, name));
      }
    } catch {
      // Directorio ilegible: se ignora, no es fatal.
    }
  }
  return files;
}

/** `null` si el fichero ya no existe o no es legible. */
export function statTranscriptSize(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

export function readTranscriptChunk(
  path: string,
  offset: number,
  length: number,
): string {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(length);
    const read = readSync(fd, buf, 0, length, offset);
    return buf.subarray(0, read).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/**
 * Extrae el uso de una línea de transcript. Solo metadatos: el contenido
 * del mensaje (prompts, código) nunca se toca.
 *
 * La dedupe_key es message.id, NO uuid: varias líneas comparten message.id
 * repitiendo el mismo objeto usage, una por bloque de contenido. Deduplicar
 * por uuid dobla los tokens (medido: 23 de 53 entradas en un fichero real).
 */
export function parseUsageLine(line: string): ProviderUsageEvent | null {
  // biome-ignore lint/suspicious/noExplicitAny: forma cruda del JSONL de Claude Code, sin esquema propio todavía; tiparlo de verdad es #44.
  let entry: any;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }

  if (entry?.type !== "assistant") return null;
  const message = entry.message;
  const usage = message?.usage;
  if (!usage) return null;

  const dedupeKey = message.id ?? entry.requestId ?? entry.uuid;
  if (!dedupeKey) return null;

  return {
    dedupeKey: String(dedupeKey),
    sessionId: entry.sessionId ?? null,
    project: entry.cwd ?? null,
    // Fuera de un repo llega "" o ausente: ambos son "sin rama".
    gitBranch: entry.gitBranch || null,
    ts: entry.timestamp ?? new Date().toISOString(),
    model: message.model ?? null,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    serviceTier: usage.service_tier ?? null,
  };
}

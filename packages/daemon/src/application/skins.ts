import {
  isSkinTextLayer,
  type PetState,
  type SkinManifest,
  type SkinSummary,
  validateSkinManifest,
} from "@amnis/shared";

/**
 * Listar y comprobar skins (#155). Lo comparten `GET /api/skins` y
 * `amnis skin check`, que son hermanos: ninguno importa del otro. El acceso
 * al disco entra como dependencias.
 */

export interface SkinFolder {
  /** Contenido de `skin.json`, o `null` si no existe. */
  readManifest(): string | null;
  /** La imagen existe, es un fichero y no sale de la carpeta de la skin. */
  hasImage(src: string): boolean;
}

export interface SkinCheck {
  manifest?: SkinManifest;
  errors: string[];
  warnings: string[];
}

export function checkSkin(folder: SkinFolder): SkinCheck {
  const text = folder.readManifest();
  if (text === null) {
    return {
      errors: ["falta `skin.json` en la carpeta de la skin"],
      warnings: [],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { errors: [`skin.json no es JSON válido: ${why}`], warnings: [] };
  }

  const result = validateSkinManifest(raw);
  if ("errors" in result) return { errors: result.errors, warnings: [] };

  const errors: string[] = [];
  for (const [state, def] of Object.entries(result.manifest.states)) {
    def.layers.forEach((layer, i) => {
      if (isSkinTextLayer(layer) || folder.hasImage(layer.src)) return;
      errors.push(
        `states.${state}.layers[${i}].src: no existe la imagen ${JSON.stringify(layer.src)}`,
      );
    });
  }
  if (errors.length > 0) return { errors, warnings: result.warnings };
  return { manifest: result.manifest, errors, warnings: result.warnings };
}

export interface ListSkinsDeps {
  skinIds(): string[];
  folder(id: string): SkinFolder;
}

/** Una skin rota se lista con su error: no puede tumbar el listado. */
export function listSkins(deps: ListSkinsDeps): SkinSummary[] {
  return deps
    .skinIds()
    .sort()
    .map((id): SkinSummary => {
      try {
        const { manifest, errors, warnings } = checkSkin(deps.folder(id));
        return {
          id,
          name: manifest?.name ?? null,
          states: manifest ? (Object.keys(manifest.states) as PetState[]) : [],
          errors,
          warnings,
        };
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        return {
          id,
          name: null,
          states: [],
          errors: [`no se pudo leer la skin: ${why}`],
          warnings: [],
        };
      }
    });
}

import { useEffect, useState } from "react";

/**
 * Color medio de la portada llevado a un tono claro y saturado, para que se
 * lea sobre el gris de los cascos (el de #60).
 */
export function lightColor(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
  }
  const hue = Math.round(h * 60 + 360) % 360;
  return `hsl(${hue} ${d ? 75 : 0}% 66%)`;
}

/** Color medio de unos píxeles RGBA (los de un `ImageData`). */
export function coverColorFrom(pixels: ArrayLike<number>): string {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = Math.floor(pixels.length / 4);
  for (let i = 0; i < n * 4; i += 4) {
    r += pixels[i] ?? 0;
    g += pixels[i + 1] ?? 0;
    b += pixels[i + 2] ?? 0;
  }
  return n === 0 ? lightColor(0, 0, 0) : lightColor(r / n, g / n, b / n);
}

export interface CoverArt {
  /** Portada 16×16 ampliada sin suavizado, como data URL. */
  pixel: string | null;
  color: string | null;
}

const NONE: CoverArt = { pixel: null, color: null };

/**
 * La portada pixelada y su color medio salen de leer la imagen en un canvas.
 * Spotify sirve las portadas desde `i.scdn.co`; si ese CDN no permite el
 * canvas (CORS) o no hay canvas (jsdom), devuelve `null` y quien llama cae a
 * la portada nítida y al color de la vibe. Solo trabaja con `enabled`: la
 * miniatura normal no lo necesita y no depende de CORS (#64).
 */
export function useCoverArt(url: string | null, enabled: boolean): CoverArt {
  const [art, setArt] = useState<(CoverArt & { url: string }) | null>(null);

  useEffect(() => {
    if (!enabled || !url) return;
    let stale = false;
    const done = (next: CoverArt) => {
      if (!stale) setArt({ url, ...next });
    };
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const small = document.createElement("canvas");
        small.width = small.height = 16;
        const sx = small.getContext("2d");
        if (!sx) return done(NONE);
        sx.drawImage(img, 0, 0, 16, 16);
        const color = coverColorFrom(sx.getImageData(0, 0, 16, 16).data);
        const big = document.createElement("canvas");
        big.width = big.height = 128;
        const bx = big.getContext("2d");
        if (!bx) return done({ pixel: null, color });
        bx.imageSmoothingEnabled = false;
        bx.drawImage(small, 0, 0, 128, 128);
        done({ pixel: big.toDataURL("image/png"), color });
      } catch {
        done(NONE);
      }
    };
    img.onerror = () => done(NONE);
    img.src = url;
    return () => {
      stale = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [url, enabled]);

  return enabled && url && art?.url === url ? art : NONE;
}

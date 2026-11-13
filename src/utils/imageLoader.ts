export interface ResolvedImageResult {
  ok: boolean;
  dataUrl?: string;
  error?: string;
}

// Strict per-URL cache so exact SKU photos load instantly across preview/PNG/PDF
// while distinct SKU URLs never collide or bleed across quotes.
const dataUrlCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<ResolvedImageResult>>();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result);
      } else {
        reject(new Error('No se pudo convertir la imagen a Data URL'));
      }
    };
    reader.onerror = () => reject(new Error('Error leyendo datos de imagen'));
    reader.readAsDataURL(blob);
  });
}

function verifyImageDecodes(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

async function fetchAndVerifyProxyImage(
  imageUrl: string,
  bypassCache = false
): Promise<ResolvedImageResult> {
  const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
  try {
    const res = await fetch(proxyUrl, {
      cache: bypassCache ? 'no-store' : 'default',
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} al cargar fotografía oficial` };
    }
    const blob = await res.blob();
    if (!blob || blob.size === 0 || !blob.type.toLowerCase().startsWith('image/')) {
      return { ok: false, error: 'El recurso recibido no es una imagen válida' };
    }
    const dataUrl = await blobToDataUrl(blob);
    const decoded = await verifyImageDecodes(dataUrl);
    if (!decoded) {
      return { ok: false, error: 'La fotografía oficial no pudo decodificarse' };
    }
    return { ok: true, dataUrl };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Error de red cargando fotografía' };
  }
}

/**
 * Resolve an official VTEX product image URL via server proxy into a verified,
 * decoded base64 data: URL so ClientQuoteView, PNG, and PDF always show the exact image
 * without CORS or opacity-0 race conditions.
 */
export async function resolveOfficialImageDataUrl(
  imageUrl?: string
): Promise<ResolvedImageResult> {
  const cleanUrl = (imageUrl || '').trim();
  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
    return { ok: false, error: 'El SKU seleccionado no tiene URL de fotografía oficial' };
  }

  const cached = dataUrlCache.get(cleanUrl);
  if (cached) {
    return { ok: true, dataUrl: cached };
  }

  const existing = inFlightRequests.get(cleanUrl);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<ResolvedImageResult> => {
    let result = await fetchAndVerifyProxyImage(cleanUrl, false);
    if (!result.ok) {
      // Single clean retry bypassing browser HTTP cache
      result = await fetchAndVerifyProxyImage(cleanUrl, true);
    }
    if (result.ok && result.dataUrl) {
      dataUrlCache.set(cleanUrl, result.dataUrl);
      // Keep cache bounded cleanly
      if (dataUrlCache.size > 150) {
        const firstKey = dataUrlCache.keys().next().value;
        if (firstKey) dataUrlCache.delete(firstKey);
      }
    }
    return result;
  })();

  inFlightRequests.set(cleanUrl, promise);
  try {
    return await promise;
  } finally {
    inFlightRequests.delete(cleanUrl);
  }
}

export function getCachedOfficialImageDataUrl(imageUrl?: string): string | undefined {
  const cleanUrl = (imageUrl || '').trim();
  if (!cleanUrl) return undefined;
  return dataUrlCache.get(cleanUrl);
}

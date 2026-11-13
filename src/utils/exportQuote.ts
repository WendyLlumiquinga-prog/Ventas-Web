import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

export class MissingQuoteImagesError extends Error {
  failedProducts: string[];

  constructor(failedProducts: string[]) {
    const names = failedProducts.length > 0 ? failedProducts.join(', ') : 'uno o más productos';
    super(
      `No se pudo exportar porque faltan o no cargaron las fotografías oficiales de: ${names}. Verifica la conexión o las imágenes antes de descargar.`
    );
    this.name = 'MissingQuoteImagesError';
    this.failedProducts = failedProducts;
  }
}

/**
 * Helper to get formatted filename with current date in Ecuador timezone:
 * Cotizacion_Chaide_YYYY-MM-DD
 */
export function getExportFilename(extension: 'png' | 'pdf'): string {
  const ecuadorDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return `Cotizacion_Chaide_${ecuadorDate}.${extension}`;
}

/**
 * Strictly wait until all product images inside the quote container finish resolving
 * and verify that none failed or remained empty before generating PNG/PDF.
 */
async function ensureAllQuoteImagesReady(
  element: HTMLElement,
  timeoutMs = 12000
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const stillLoading = element.querySelectorAll('[data-image-status="loading"]');
    const images = Array.from(element.querySelectorAll('img'));
    const allImgsDecoded = images.every((img) => img.complete && img.naturalWidth > 0);

    if (stillLoading.length === 0 && allImgsDecoded) {
      break;
    }

    await new Promise((r) => setTimeout(r, 60));
  }

  // Verify zero missing/failed/incomplete photos before allowing export
  const failedNodes = Array.from(
    element.querySelectorAll(
      '[data-image-status="loading"], [data-image-status="error"], [data-image-status="missing"]'
    )
  );
  const brokenImages = Array.from(element.querySelectorAll('img')).filter(
    (img) => !img.complete || img.naturalWidth === 0
  );

  if (failedNodes.length > 0 || brokenImages.length > 0) {
    const namesSet = new Set<string>();
    for (const node of failedNodes) {
      const name = node.getAttribute('data-product-name');
      if (name) namesSet.add(name);
    }
    for (const img of brokenImages) {
      const name = img.getAttribute('data-product-name') || img.getAttribute('alt');
      if (name) namesSet.add(name);
    }
    throw new MissingQuoteImagesError(Array.from(namesSet));
  }
}

/**
 * Export HTML element to high-resolution PNG image
 */
export async function exportElementToPng(
  element: HTMLElement,
  customFilename?: string
): Promise<void> {
  const filename = customFilename || getExportFilename('png');

  await ensureAllQuoteImagesReady(element);

  const dataUrl = await toPng(element, {
    quality: 0.98,
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    includeQueryParams: true,
    cacheBust: false,
  });

  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/**
 * Export HTML element to professional A4 PDF
 */
export async function exportElementToPdf(
  element: HTMLElement,
  customFilename?: string
): Promise<void> {
  const filename = customFilename || getExportFilename('pdf');

  await ensureAllQuoteImagesReady(element);

  const dataUrl = await toPng(element, {
    quality: 0.98,
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    includeQueryParams: true,
    cacheBust: false,
  });

  const img = new Image();
  img.src = dataUrl;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  // A4 dimensions in mm: 210 x 297
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const printWidth = pageWidth - margin * 2;
  const printHeight = (img.height * printWidth) / img.width;

  if (printHeight <= pageHeight - margin * 2) {
    pdf.addImage(img, 'PNG', margin, margin, printWidth, printHeight);
  } else {
    let heightLeft = printHeight;
    let position = 0;
    const availablePageHeight = pageHeight - margin * 2;

    while (heightLeft > 0) {
      if (position > 0) {
        pdf.addPage();
      }
      pdf.addImage(
        img,
        'PNG',
        margin,
        margin - position,
        printWidth,
        printHeight
      );
      heightLeft -= availablePageHeight;
      position += availablePageHeight;
    }
  }

  pdf.save(filename);
}

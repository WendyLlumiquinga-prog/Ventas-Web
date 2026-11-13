import { GoogleGenAI, Type } from '@google/genai';
import { ParsedItemQuery, ParseRequestResponse } from '../src/types.ts';
import { matchProductLocally } from './chaide-adapter.ts';

/**
 * Heuristic rule-based fallback and instant local parser
 */
export function heuristicParseText(input: string): ParseRequestResponse {
  const text = input.trim();
  const lower = text.toLowerCase();

  // Delivery detection
  const requestedDelivery =
    lower.includes('con envío') ||
    lower.includes('con envio') ||
    lower.includes('con domicilio') ||
    lower.includes('incluye entrega') ||
    lower.includes('a domicilio') ||
    lower.includes('entrega a domicilio') ||
    lower.includes('para envio') ||
    lower.includes('para envío');

  // Explicit pickup detection
  const requestedPickup =
    lower.includes('retiro') ||
    lower.includes('retirar') ||
    lower.includes('retirará') ||
    lower.includes('retirara') ||
    lower.includes('lo retiro') ||
    lower.includes('paso a retirar') ||
    lower.includes('retiro en tienda') ||
    lower.includes('retiro en fábrica') ||
    lower.includes('retiro en fabrica') ||
    lower.includes('retiro en local');

  // Check URL in text
  const urlRegex = /(https?:\/\/[^\s]+|www\.chaide\.com[^\s]+)/gi;
  const urlMatches = text.match(urlRegex) || [];

  // Protect "y media" and "un cuarto" from being split by item separator "y"
  const protectedText = text
    .replace(/(\d+|plazas?)\s+y\s+media/gi, '$1_y_media')
    .replace(/(\d+|plazas?)\s+y\s+un\s+cuarto/gi, '$1_y_un_cuarto');

  // Split multiple items by " y ", ",", "\n", ";" if present
  let rawItemSegments: string[] = [];

  if (protectedText.includes('\n')) {
    rawItemSegments = protectedText.split('\n').filter((s) => s.trim().length > 0);
  } else if (
    protectedText.match(
      /\s+[yY]\s+(?:\d+|un|una|dos|tres|otro|otra|base|cama|colch[oó]n|almohada|protector|cobija|s[aá]bana|sofa|sof[aá]|velador|cabecero|kit)\b/i
    )
  ) {
    rawItemSegments = protectedText
      .split(
        /\s+[yY]\s+(?=\d+|un|una|dos|tres|otro|otra|base|cama|colch[oó]n|almohada|protector|cobija|s[aá]bana|sofa|sof[aá]|velador|cabecero|kit\b)/i
      )
      .map((s) => s.replace(/_y_media/gi, ' y media').replace(/_y_un_cuarto/gi, ' y un cuarto'))
      .filter((s) => s.trim().length > 0);
  } else if (protectedText.includes(';')) {
    rawItemSegments = protectedText.split(';').filter((s) => s.trim().length > 0);
  } else {
    rawItemSegments = [text];
  }

  const items: ParsedItemQuery[] = [];

  for (const segment of rawItemSegments) {
    const segTrim = segment.trim();
    if (!segTrim) continue;

    let segClean = segTrim.toLowerCase();
    segClean = segClean.replace(/\bchn\b/gi, '');
    segClean = segClean.replace(/\btitaniun\b/gi, 'titanium');
    segClean = segClean.replace(/\btitanum\b/gi, 'titanium');
    segClean = segClean.replace(/\bmontesorri\b/gi, 'montessori');
    segClean = segClean.replace(/\bmontesorry\b/gi, 'montessori');
    segClean = segClean.replace(/\bmontesori\b/gi, 'montessori');

    // Check quantity at start
    let quantity = 1;
    const qtyMatch = segTrim.match(/^\s*(\d+)\s+/);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
    } else {
      const wordQtyMatch = segTrim.match(/^(un|una|uno|dos|tres|cuatro|cinco)\s+/i);
      if (wordQtyMatch) {
        const w = wordQtyMatch[1].toLowerCase();
        if (w === 'dos') quantity = 2;
        else if (w === 'tres') quantity = 3;
        else if (w === 'cuatro') quantity = 4;
        else if (w === 'cinco') quantity = 5;
        else quantity = 1;
      }
    }

    // Check size (plazas or explicit cm dimensions like 70x50 / 90x50)
    let size = '';
    if (
      segClean.includes('1.25') ||
      segClean.includes('1,25') ||
      segClean.includes('1¼') ||
      segClean.includes('1 1/4') ||
      segClean.includes('un cuarto')
    ) {
      size = '1¼ plaza';
    } else if (
      segClean.includes('1.5') ||
      segClean.includes('1,5') ||
      segClean.includes('1½') ||
      segClean.includes('1 1/2') ||
      segClean.includes('1 y 1/2') ||
      segClean.includes('plaza y media') ||
      segClean.includes('una plaza y media') ||
      segClean.includes('1 y media')
    ) {
      size = '1½ plaza';
    } else if (
      segClean.includes('2.5') ||
      segClean.includes('2,5') ||
      segClean.includes('2½') ||
      segClean.includes('2 1/2') ||
      segClean.includes('2 y 1/2') ||
      segClean.includes('2 plazas y media') ||
      segClean.includes('dos plazas y media') ||
      segClean.includes('dos y media') ||
      segClean.includes('2 y media')
    ) {
      size = '2½ plazas';
    } else if (
      segClean.includes('2 plazas') ||
      segClean.includes('2 plaza') ||
      segClean.includes('2 pl') ||
      segClean.includes('dos plazas')
    ) {
      size = '2 plazas';
    } else if (
      segClean.includes('3 plazas') ||
      segClean.includes('3 plaza') ||
      segClean.includes('3 pl') ||
      segClean.includes('tres plazas')
    ) {
      size = '3 plazas';
    } else if (
      segClean.includes('1 plaza') ||
      segClean.includes('1 pl') ||
      segClean.includes('una plaza')
    ) {
      size = '1 plaza';
    } else {
      const cmMatch = segClean.match(/\b(\d{2,3})\s*(?:cm\s*)?[x×]\s*(\d{2,3})\b/i);
      if (cmMatch) {
        size = `${cmMatch[1]} cm x ${cmMatch[2]} cm`;
      }
    }

    // Check bodies
    let bodies = '';
    if (segClean.includes('dos cuerpos') || segClean.includes('2 cuerpos')) {
      bodies = 'Dos cuerpos';
    } else if (segClean.includes('un cuerpo') || segClean.includes('1 cuerpo')) {
      bodies = 'Un cuerpo';
    }

    // Check design
    let design = '';
    if (/\bpara\s+ni[ñn]a\b|\bni[ñn]a\b/.test(segClean)) {
      design = 'niña';
    } else if (/\bpara\s+ni[ñn]o\b|\bni[ñn]o\b/.test(segClean)) {
      design = 'niño';
    }

    // Check color (expanded full catalog palette)
    let color = '';
    let anyColor = false;
    if (segClean.includes('cualquier color')) {
      anyColor = true;
      color = 'cualquier color';
    } else if (/\bchocolate\b/.test(segClean)) {
      color = 'Chocolate';
    } else if (/\bplomo\b/.test(segClean)) {
      color = 'Plomo';
    } else if (/\bgris\b/.test(segClean)) {
      color = 'Gris';
    } else if (/\bblanco\b|\bblanca\b/.test(segClean)) {
      color = 'Blanco';
    } else if (/\bnegro\b|\bnegra\b/.test(segClean)) {
      color = 'Negro';
    } else if (/\bazul marino\b/.test(segClean)) {
      color = 'Azul Marino';
    } else if (/\bazul\b/.test(segClean)) {
      color = 'Azul';
    } else if (/\bturquesa\b/.test(segClean)) {
      color = 'Turquesa';
    } else if (/\bagua marina\b|\baqua\b/.test(segClean)) {
      color = 'Agua Marina';
    } else if (/\bceleste\b/.test(segClean)) {
      color = 'Celeste';
    } else if (/\bvioleta\b/.test(segClean)) {
      color = 'Violeta';
    } else if (/\bhabano\b/.test(segClean)) {
      color = 'Habano';
    } else if (/\bbruma\b/.test(segClean)) {
      color = 'Bruma';
    } else if (/\bmiel\b/.test(segClean)) {
      color = 'Miel';
    } else if (/\bmostaza\b/.test(segClean)) {
      color = 'Mostaza';
    } else if (/\bcoral\b/.test(segClean)) {
      color = 'Coral';
    } else if (/\brosado\b|\brosa\b/.test(segClean)) {
      color = 'Rosado';
    } else if (/\bastra beige\b/.test(segClean)) {
      color = 'Astra Beige';
    } else if (/\bbeige\b/.test(segClean)) {
      color = 'Beige';
    } else if (/\bvintage capuccino\b|\bcapuccino\b/.test(segClean)) {
      color = 'Vintage Capuccino';
    } else if (/\bvintage humo\b|\bhumo\b/.test(segClean)) {
      color = 'Vintage Humo';
    }

    // Check link in segment or overall
    let link: string | undefined;
    let originalSkuId: string | undefined;
    const segUrl = segTrim.match(urlRegex)?.[0] || (urlMatches.length === 1 ? urlMatches[0] : undefined);
    if (segUrl) {
      link = segUrl.startsWith('http') ? segUrl : `https://${segUrl}`;
      try {
        const u = new URL(link);
        const skuParam = u.searchParams.get('skuId');
        if (skuParam) originalSkuId = skuParam;
      } catch {
        // ignore
      }
    }

    // Model name resolution using local index matcher
    let modelName = '';
    const matched = matchProductLocally(segTrim);
    if (matched) {
      modelName = matched.product.productName;
    } else if (link) {
      try {
        const u = new URL(link);
        const pathSlug = u.pathname.replace(/^\/|\/p\/?$/g, '');
        modelName = pathSlug.replace(/-/g, ' ');
      } catch {
        modelName = segTrim;
      }
    } else {
      modelName = segTrim;
    }

    items.push({
      rawQuery: segTrim,
      modelName,
      quantity: Math.max(1, quantity),
      size: size || undefined,
      color: color || undefined,
      bodies: bodies || undefined,
      design: design || undefined,
      link,
      originalSkuId,
      anyColor,
    });
  }

  return {
    items: items.length > 0 ? items : [{ modelName: text, quantity: 1, rawQuery: text }],
    requestedDelivery,
    requestedPickup,
    explanation: 'Interpretación heurística estructurada',
  };
}

/**
 * Hybrid query parser:
 * 1. Checks if query can be resolved locally with high confidence in <5ms.
 * 2. Uses Gemini only for complex multi-product or ambiguous queries.
 */
export async function parseQueryWithGemini(input: string): Promise<ParseRequestResponse> {
  const trimmed = input.trim();

  // 1. FAST PATH: Check if query has multiple items
  const isMultiItem =
    trimmed.includes('\n') ||
    trimmed.includes(';') ||
    /\s+[yY]\s+(?:\d+|un|una|dos|tres|otro|otra|base|cama|colch[oó]n|almohada|protector|cobija|s[aá]bana|sofa|sof[aá]|velador|cabecero|kit)\b/i.test(
      trimmed
    );

  // If single item, attempt local fuzzy index match immediately
  if (!isMultiItem) {
    const localResult = heuristicParseText(trimmed);
    const firstItem = localResult.items[0];

    if (firstItem && firstItem.modelName && firstItem.modelName !== trimmed) {
      return {
        ...localResult,
        explanation: 'Identificación instantánea por índice local',
      };
    }
  }

  // 2. GEMINI PATH: For multi-product or complex ambiguous requests
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return heuristicParseText(input);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `
Eres el motor de búsqueda e interpretación para el equipo de ventas online de Chaide (Ecuador).
Interpreta las solicitudes de clientes o asesoras, identificando productos de TODO el catálogo oficial de Chaide (Colchones, Camas, Bases, Muebles Kids/Montessori, Sofás cama, Almohadas, Protectores, Ropa de cama, Mascotas, etc.).
Corrige errores ortográficos, abreviaturas y nombres incompletos, SIN confundir ni fusionar versiones distintas de un mismo modelo.

Reglas estrictas de modelos:
- Mantén estrictamente separados modelos con sufijos como "Dark", "Smart", "Dark Smart", "Pillow Top", "Non Flip", "Nueva Generación", "Memory", "Soft".
  Ejemplo: "Golden Dreams", "Golden Dreams Dark", "Golden Dreams Smart", "Golden Dreams Dark Smart" son 4 productos distintos.
- No cambies un producto pedido explícitamente por otro similar.
- Ejemplos comunes:
  * "cama montesorri 1.5 plaz" -> modelName: "Cama Montessori", size: "1½ plaza"
  * "titanium 2.5 plazas" / "titaniun 2.5" -> modelName: "Colchón Titanium", size: "2½ plazas"
  * "fb 2 pl" -> modelName: "Colchón Continental FB", size: "2 plazas"
  * "base tapiz chocolate 2 plazas 1 cuerpo" -> modelName: "Base Chaide Tapiz", size: "2 plazas", color: "Chocolate", bodies: "Un cuerpo"
  * "almohada back support negro" -> modelName: "Almohada Back Support", color: "Negro"
  * "protector de almohada panal soft blanco 70x50" -> modelName: "Protector de Almohada Panal Soft", color: "Blanco", size: "70 cm x 50 cm"

Reglas de interpretación:
1. Normalización de medidas:
   - "1.25", "1 1/4", "1¼ plaza" -> "1¼ plaza"
   - "1.5 plazas", "1 1/2", "plaza y media" -> "1½ plaza"
   - "2.5 plazas", "2 1/2", "2 plazas y media" -> "2½ plazas"
   - "2 plazas", "dos plazas", "2 pl" -> "2 plazas"
   - "3 plazas", "tres plazas" -> "3 plazas"
   - "1 plaza" -> "1 plaza"
   - Para almohadas, protectores o ropa de cama con medida en cm (ej. "70x50", "90x50"), conserva "70 cm x 50 cm".
2. Cantidad: por defecto 1 si no se especifica.
3. Cuerpos para bases/camas: "Un cuerpo" vs "Dos cuerpos".
4. Color: extrae colores solicitados (Blanco, Negro, Gris, Plomo, Chocolate, Azul, Turquesa, Agua Marina, Celeste, Violeta, Habano, Bruma, Miel, Mostaza, Coral, Rosado, Beige, etc.). Si dice "cualquier color", marca anyColor=true y color="cualquier color".
5. Detección de retiro: "retiro en tienda", "retiro en fábrica", "paso a retirar", "lo retiro" -> requestedPickup=true.
6. Detección de envío: "con envío", "con domicilio", "incluye entrega" -> requestedDelivery=true.
7. Si hay enlaces a chaide.com, extráelos y extrae skuId si existe en el enlace.

Solicitud del usuario a interpretar:
"${input}"
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  modelName: { type: Type.STRING },
                  quantity: { type: Type.INTEGER },
                  size: { type: Type.STRING },
                  color: { type: Type.STRING },
                  bodies: { type: Type.STRING },
                  design: { type: Type.STRING },
                  link: { type: Type.STRING },
                  originalSkuId: { type: Type.STRING },
                  anyColor: { type: Type.BOOLEAN },
                  rawQuery: { type: Type.STRING },
                },
                required: ['modelName'],
              },
            },
            requestedDelivery: { type: Type.BOOLEAN },
            requestedPickup: { type: Type.BOOLEAN },
            explanation: { type: Type.STRING },
          },
          required: ['items'],
        },
      },
    });

    const parsedJson = JSON.parse(response.text || '{}');
    if (parsedJson.items && Array.isArray(parsedJson.items) && parsedJson.items.length > 0) {
      const refinedItems = parsedJson.items.map((it: ParsedItemQuery) => {
        const localMatch = matchProductLocally(it.modelName || input);
        return {
          ...it,
          modelName: localMatch ? localMatch.product.productName : it.modelName,
          quantity: it.quantity && it.quantity > 0 ? it.quantity : 1,
        };
      });

      return {
        items: refinedItems,
        requestedDelivery: !!parsedJson.requestedDelivery,
        requestedPickup: !!parsedJson.requestedPickup,
        explanation: parsedJson.explanation || 'Interpretado con Gemini',
      };
    }

    return heuristicParseText(input);
  } catch (err) {
    console.warn('Gemini parser error, falling back to local heuristic:', err);
    return heuristicParseText(input);
  }
}

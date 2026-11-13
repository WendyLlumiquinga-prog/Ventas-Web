import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  CatalogStatusSummary,
  CatalogSuggestionItem,
  CatalogSuggestionsResponse,
  DiagnosticErrorCode,
  ProductPricing,
  ProductVariant,
  QuoteItem,
  RelatedModelOption,
  SkuGroupVariant,
  SkuProductGroup,
  VtexStatus,
} from '../src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CATALOG_FILE_PATH = path.resolve(__dirname, 'catalog-index.json');
const CATALOG_META_PATH = path.resolve(__dirname, 'catalog-meta.json');

export interface RawVtexProduct {
  productId: string;
  productName: string;
  brand?: string;
  linkText: string;
  link: string;
  description?: string;
  productReference?: string;
  productReferenceCode?: string;
  categories: string[];
  categoryId?: string;
  skuSpecifications?: Array<{
    field: { id: number; name: string };
    values: Array<{ id: string; name: string }>;
  }>;
  items: RawVtexItem[];
}

export interface RawVtexItem {
  itemId: string;
  name: string;
  Talla?: string[];
  Medida?: string[];
  Color?: string[];
  Diseño?: string[];
  variations?: string[];
  referenceId?: Array<{ Key: string; Value: string }>;
  images?: Array<{
    imageId: string;
    imageUrl: string;
    imageText?: string;
  }>;
  sellers?: Array<{
    sellerId: string;
    commertialOffer?: {
      Price: number;
      ListPrice: number;
      Tax: number;
      AvailableQuantity: number;
      IsAvailable: boolean;
    };
  }>;
  [key: string]: any;
}

export interface IndexedSku {
  skuId: string;
  productId: string;
  referenceId?: string;
  variantName: string;
  medida: string;
  plazas: string;
  dimensiones: string;
  color: string;
  diseno: string;
  cuerpos: string;
  attributes: Record<string, string>;
  images: string[];
  imageUrl?: string;
  availableQuantity: number;
  isAvailable: boolean;
  catalogPriceCents: number;
  catalogListPriceCents: number;
  hasVerifiablePrice: boolean;
  link: string;
  rawItem: RawVtexItem;
}

export interface IndexedProduct {
  productId: string;
  productName: string;
  model: string;
  brand: string;
  category: string;
  subcategory: string;
  categories: string[];
  description: string;
  linkText: string;
  officialLink: string;
  skus: IndexedSku[];
  rawProduct: RawVtexProduct;
}

interface CatalogSyncMeta {
  lastSyncAt: string | null;
  syncDurationMs: number;
  syncErrors: string[];
  vtexSourceStats: {
    pagedProductsCount: number;
    sitemapUrlsCount: number;
    categoryIdsChecked: number;
    extraRecoveredCount: number;
  };
}

// Level 1 & Level 2 In-Memory Indexes
let cachedCatalog: RawVtexProduct[] = [];
let indexedProducts: IndexedProduct[] = [];
const productByIdMap = new Map<string, IndexedProduct>();
const productBySlugMap = new Map<string, IndexedProduct>();
const skuLookupMap = new Map<string, { product: IndexedProduct; sku: IndexedSku }>();
const refIdLookupMap = new Map<string, Array<{ product: IndexedProduct; sku: IndexedSku }>>();

let catalogLoadedAt = 0;
const CATALOG_CACHE_TTL = 1000 * 60 * 60; // 1 hour
let isSyncing = false;
let syncState: 'idle' | 'syncing' | 'error' | 'ready' = 'idle';

let syncMeta: CatalogSyncMeta = {
  lastSyncAt: null,
  syncDurationMs: 0,
  syncErrors: [],
  vtexSourceStats: {
    pagedProductsCount: 0,
    sitemapUrlsCount: 0,
    categoryIdsChecked: 0,
    extraRecoveredCount: 0,
  },
};

// Price cache for rapid quoting (5 minutes TTL)
const priceCache = new Map<string, { pricing: ProductPricing; timestamp: number }>();
const PRICE_CACHE_TTL = 1000 * 60 * 5;

// Connection status tracking
export const vtexStatusState: VtexStatus = {
  connected: false,
  lastQueryAt: null,
  latencyMs: 0,
  errorDetail: null,
  catalogCount: 0,
};

function recordSuccess(latencyMs: number) {
  vtexStatusState.connected = true;
  vtexStatusState.lastQueryAt = new Date().toLocaleTimeString('es-EC', { hour12: false });
  vtexStatusState.latencyMs = latencyMs;
  vtexStatusState.errorDetail = null;
  vtexStatusState.catalogCount = cachedCatalog.length;
}

function recordError(errorMsg: string) {
  vtexStatusState.connected = false;
  vtexStatusState.errorDetail = errorMsg;
}

/**
 * Normalize text removing accents and common filler words
 */
export function normalizeTextBasic(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s./×x-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeProductText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bchn\b/gi, '')
    .replace(/\bcolchon\b/gi, '')
    .replace(/\bcolchones\b/gi, '')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (s1.length < s2.length) return levenshteinDistance(s2, s1);
  if (s2.length === 0) return s1.length;

  let prev = Array.from({ length: s2.length + 1 }, (_, i) => i);

  for (let i = 0; i < s1.length; i++) {
    const curr = [i + 1];
    for (let j = 0; j < s2.length; j++) {
      const insertions = prev[j + 1] + 1;
      const deletions = curr[j] + 1;
      const substitutions = prev[j] + (s1[i] !== s2[j] ? 1 : 0);
      curr.push(Math.min(insertions, deletions, substitutions));
    }
    prev = curr;
  }

  return prev[s2.length];
}

/**
 * Clean canonical category and subcategory extraction from VTEX categories array
 */
export function extractCanonicalCategory(product: RawVtexProduct): string {
  const cats = (product.categories || []).map((c) => c.toLowerCase());
  const pName = (product.productName || '').toLowerCase();

  for (const c of cats) {
    if (c.includes('kids') || c.includes('infantil')) {
      if (pName.includes('cama')) return 'Cama Infantil';
      if (pName.includes('almohada')) return 'Almohada';
      if (pName.includes('sabana') || pName.includes('sábana') || pName.includes('edredon')) return 'Ropa de Cama';
      return 'Infantil';
    }
    if (c.includes('sofas cama') || c.includes('sofa cama') || pName.includes('sofá cama') || pName.includes('sofa cama')) {
      return 'Sofá Cama';
    }
    if (c.includes('mascotas') || pName.includes('mascota') || pName.includes('pet ')) {
      return 'Mascotas';
    }
    if (c.includes('protector') || pName.includes('protector')) {
      return 'Protector';
    }
    if (c.includes('almohadas') || pName.includes('almohada')) {
      return 'Almohada';
    }
    if (c.includes('bases') || pName.startsWith('base ')) {
      return 'Base';
    }
    if (c.includes('camas') || pName.startsWith('cama ')) {
      return 'Cama';
    }
    if (c.includes('colchones') || pName.includes('colchón') || pName.includes('colchon')) {
      return 'Colchón';
    }
    if (c.includes('ropa de cama') || c.includes('sabanas') || c.includes('cobijas') || c.includes('edredon') || c.includes('funda')) {
      return 'Ropa de Cama';
    }
    if (c.includes('muebles') || c.includes('velador') || c.includes('cabecero') || c.includes('butaca') || c.includes('sofa')) {
      return 'Muebles';
    }
  }

  if (pName.includes('colchón') || pName.includes('colchon')) return 'Colchón';
  if (pName.includes('base')) return 'Base';
  if (pName.includes('cama')) return 'Cama';
  if (pName.includes('almohada')) return 'Almohada';
  if (pName.includes('sofá') || pName.includes('sofa')) return 'Sofá Cama';
  if (pName.includes('protector')) return 'Protector';
  if (pName.includes('pet ') || pName.includes('mascota')) return 'Mascotas';
  if (pName.includes('sabana') || pName.includes('sábana') || pName.includes('edredon') || pName.includes('cobija') || pName.includes('funda')) {
    return 'Ropa de Cama';
  }

  return 'Accesorio';
}

function extractSubcategory(product: RawVtexProduct): string {
  const firstPath = product.categories?.[0];
  if (!firstPath) return extractCanonicalCategory(product);
  const parts = firstPath.split('/').filter(Boolean);
  return parts[parts.length - 1] || extractCanonicalCategory(product);
}

function extractModelName(product: RawVtexProduct): string {
  return (product.productName || '')
    .replace(/^(colch[oó]n|base|cama|almohada|protector\s+de\s+(?:colch[oó]n|almohada)|sof[aá]\s+cama|cobija|juego\s+de\s+s[aá]banas)\s+/i, '')
    .trim() || product.productName;
}

const KNOWN_COLOR_PATTERNS = [
  'azul cama infantil',
  'coral cama infantil',
  'mostaza cama infantil',
  'vintage negro mate',
  'vintage capuccino',
  'vintage humo',
  'vintage beige',
  'vintage negro',
  'astra beige',
  'astra café',
  'astra cafe',
  'eurus beige',
  'eurus café',
  'eurus cafe',
  'eurus océano',
  'eurus oceano',
  'eurus gris',
  'agua marina',
  'aqua marina',
  'azul acero',
  'azul marino',
  'elementa bruma',
  'elementa agua',
  'elementa arena',
  'elementa cacao',
  'elementa ceniza',
  'elementa tierra',
  'elementa trigo',
  'elementa aire',
  'tapiz arena',
  'calm gris',
  'pure beige',
  'sultry gris',
  'infinity azul',
  'balance café',
  'chocolate',
  'turquesa',
  'celeste',
  'violeta',
  'habano',
  'mostaza',
  'capuccino',
  'rosado',
  'blanco',
  'blanca',
  'negro',
  'negra',
  'plomo',
  'bruma',
  'miel',
  'gris',
  'azul',
  'aqua',
  'beige',
  'rosa',
  'coral',
  'arena',
  'plata',
  'lila',
  'moka',
  'mocka',
  'verde',
  'uva',
  'café',
  'cafe',
];

/**
 * Parse dynamic VTEX SKU attributes (Medida/Talla, Plazas, Dimensiones, Cuerpos, Color, Diseño)
 */
export function parseVariantInfo(skuItem: RawVtexItem, parentProductName?: string) {
  const attributes: Record<string, string> = {};
  const variationKeys = Array.isArray(skuItem.variations) ? skuItem.variations : [];

  for (const key of variationKeys) {
    const val = skuItem[key];
    if (Array.isArray(val) && val[0]) {
      attributes[key] = String(val[0]).trim();
    } else if (typeof val === 'string' && val.trim()) {
      attributes[key] = val.trim();
    }
  }

  const medidaRaw = (
    attributes['Medida'] ||
    attributes['Talla'] ||
    skuItem.Medida?.[0] ||
    skuItem.Talla?.[0] ||
    ''
  ).trim();
  const diseno = (attributes['Diseño'] || skuItem.Diseño?.[0] || '').trim();
  const name = (skuItem.name || '').trim();
  let plazas = '';
  let dimensiones = '';
  let cuerpos = '';

  const fullText = `${medidaRaw} ${name}`.toLowerCase();

  // Check cuerpos (Bases y Camas)
  if (
    fullText.includes('dos cuerpos') ||
    fullText.includes('2 cuerpos') ||
    /^2c\b/i.test(name)
  ) {
    cuerpos = 'Dos cuerpos';
  } else if (
    fullText.includes('un cuerpo') ||
    fullText.includes('1 cuerpo') ||
    /^1c\b/i.test(name)
  ) {
    cuerpos = 'Un cuerpo';
  }

  // Check plazas accurately (specific fractional sizes first, avoid matching "1 puesto" / "1 cajon")
  if (
    fullText.includes('1 ¼ plaza') ||
    fullText.includes('1 1/4 plaza') ||
    fullText.includes('1.25 plaza') ||
    /\b1\s*1\/4\b/.test(fullText) ||
    /\b90\s*[x×]\s*190\b/.test(fullText) ||
    /\b090\s*[x×]\s*190\b/.test(fullText) ||
    /^(?:0)?90\s+/.test(name)
  ) {
    plazas = '1¼ plaza';
  } else if (
    fullText.includes('1 ½ plaza') ||
    fullText.includes('1 1/2 plaza') ||
    fullText.includes('1.5 plaza') ||
    /\b1\s*1\/2\b/.test(fullText) ||
    /\b105\s*[x×]\s*190\b/.test(fullText) ||
    /\b031\s*[x×]\s*190\s*[x×]\s*105\b/.test(fullText) ||
    /^105\s+/.test(name)
  ) {
    plazas = '1½ plaza';
  } else if (
    fullText.includes('2 ½ plaza') ||
    fullText.includes('2 1/2 plaza') ||
    fullText.includes('2.5 plaza') ||
    /\b2\s*1\/2\b/.test(fullText) ||
    /\b160\s*[x×]\s*(?:190|200)\b/.test(fullText) ||
    /\b031\s*[x×]\s*200\s*[x×]\s*160\b/.test(fullText) ||
    /^160\s+/.test(name)
  ) {
    plazas = '2½ plazas';
  } else if (
    /\b3\s*plazas?\b/.test(fullText) ||
    /\b200\s*[x×]\s*200\b/.test(fullText) ||
    /\b031\s*[x×]\s*200\s*[x×]\s*200\b/.test(fullText) ||
    /^200\s+/.test(name)
  ) {
    plazas = '3 plazas';
  } else if (
    /\b2\s*plazas?\b/.test(fullText) ||
    /\b135\s*[x×]\s*190\b/.test(fullText) ||
    /\b031\s*[x×]\s*190\s*[x×]\s*135\b/.test(fullText) ||
    /^135\s+/.test(name)
  ) {
    plazas = '2 plazas';
  } else if (
    /\b1\s*plazas?\b/.test(fullText) ||
    /\b0?80\s*[x×]\s*190\b/.test(fullText) ||
    /^(?:0)?80\s+/.test(name)
  ) {
    plazas = '1 plaza';
  }

  // Extract dimensions in cm
  const dimMatch3 = (medidaRaw || name).match(/(\d{2,3}\s*cm\s*[x×]\s*\d{2,3}\s*cm\s*[x×]\s*\d{1,3}\s*cm)/i);
  const dimMatch2 = (medidaRaw || name).match(/(\d{2,3}\s*cm\s*[x×]\s*\d{2,3}\s*cm)/i);
  if (dimMatch3) {
    dimensiones =
      dimMatch3[1]
        .replace(/cm/gi, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*[x×]\s*/gi, ' × ')
        .trim() + ' cm';
  } else if (dimMatch2) {
    dimensiones =
      dimMatch2[1]
        .replace(/cm/gi, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*[x×]\s*/gi, ' × ')
        .trim() + ' cm';
  } else {
    const invDimMatch = name.match(/(?:0)?(\d{2,3})[x×](?:0)?(\d{2,3})[x×](?:0)?(\d{1,3})/i);
    const nameDimMatch = name.match(/(?:0)?(\d{2,3})[x×](?:0)?(\d{2,3})/i);
    if (invDimMatch) {
      const a = parseInt(invDimMatch[1], 10);
      const b = parseInt(invDimMatch[2], 10);
      const c = parseInt(invDimMatch[3], 10);
      if (a <= 45 && b >= 150) {
        dimensiones = `${b} × ${c} cm`;
      } else {
        dimensiones = `${a} × ${b} × ${c} cm`;
      }
    } else if (nameDimMatch) {
      dimensiones = `${parseInt(nameDimMatch[1], 10)} × ${parseInt(nameDimMatch[2], 10)} cm`;
    }
  }

  // Extract color from dynamic Color variation first, then fallback vocabulary
  let color = (attributes['Color'] || skuItem.Color?.[0] || '').trim();
  if (!color) {
    const lowerName = name.toLowerCase();
    for (const cw of KNOWN_COLOR_PATTERNS) {
      const escaped = cw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(lowerName)) {
        // Normalize feminine adjectives when representing color
        if (cw === 'negra') color = 'Negro';
        else if (cw === 'blanca') color = 'Blanco';
        else color = cw.charAt(0).toUpperCase() + cw.slice(1);
        break;
      }
    }
  }

  // Canonical measure label: plazas if applicable, else clean VTEX Medida (e.g. "70 cm x 50 cm", "Derecha", "2 PUESTOS"), else dimensiones
  const cleanMedidaRaw = medidaRaw
    .replace(/^Est[aá]ndar:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanNameFallback =
    name &&
    !/^\d{6,}$/.test(name) &&
    (!parentProductName || name.toLowerCase() !== parentProductName.toLowerCase())
      ? name
      : 'Estándar';

  const medida = plazas || cleanMedidaRaw || dimensiones || cleanNameFallback;

  return {
    medida,
    plazas,
    dimensiones,
    cuerpos,
    color,
    diseno,
    attributes,
  };
}

export function extractImageUrl(item: RawVtexItem, product?: RawVtexProduct): string | undefined {
  if (item.images && item.images.length > 0 && item.images[0].imageUrl) {
    return item.images[0].imageUrl;
  }
  if (product && product.items) {
    for (const it of product.items) {
      if (it.images && it.images.length > 0 && it.images[0].imageUrl) {
        return it.images[0].imageUrl;
      }
    }
  }
  return undefined;
}

export function extractReferenceId(item: RawVtexItem, _product?: RawVtexProduct): string | undefined {
  if (Array.isArray(item.referenceId) && item.referenceId.length > 0) {
    const exactRefId = item.referenceId.find(
      (r) => typeof r?.Key === 'string' && r.Key.trim().toLowerCase() === 'refid' && r.Value
    );
    if (exactRefId?.Value !== undefined && exactRefId?.Value !== null) {
      const val = String(exactRefId.Value).trim();
      if (val.length > 0) return val;
    }
  }
  return undefined;
}

/**
 * Rebuild Two-Level In-Memory Index (Products + SKUs) from RawVtexProduct[]
 */
function rebuildStructuredIndex(rawProducts: RawVtexProduct[]) {
  const dedupedProductsMap = new Map<string, RawVtexProduct>();
  for (const p of rawProducts) {
    if (p && p.productId) {
      dedupedProductsMap.set(String(p.productId), p);
    }
  }

  const dedupedRaw = Array.from(dedupedProductsMap.values());
  cachedCatalog = dedupedRaw;

  productByIdMap.clear();
  productBySlugMap.clear();
  skuLookupMap.clear();
  refIdLookupMap.clear();

  const builtProducts: IndexedProduct[] = [];

  for (const raw of dedupedRaw) {
    const category = extractCanonicalCategory(raw);
    const subcategory = extractSubcategory(raw);
    const model = extractModelName(raw);
    const linkText = (raw.linkText || '').trim();
    const officialLink = raw.link || (linkText ? `https://www.chaide.com/${linkText}/p` : 'https://www.chaide.com');

    const indexedProd: IndexedProduct = {
      productId: String(raw.productId),
      productName: raw.productName || '',
      model,
      brand: raw.brand || 'Chaide',
      category,
      subcategory,
      categories: raw.categories || [],
      description: raw.description || '',
      linkText,
      officialLink,
      skus: [],
      rawProduct: raw,
    };

    const seenSkuIds = new Set<string>();
    const rawItems = Array.isArray(raw.items) ? raw.items : [];

    for (const it of rawItems) {
      const skuId = String(it.itemId || '').trim();
      if (!skuId || seenSkuIds.has(skuId)) continue;
      seenSkuIds.add(skuId);

      const vInfo = parseVariantInfo(it, raw.productName);
      const refId = extractReferenceId(it, raw);
      const images = (it.images || []).map((img) => img.imageUrl).filter(Boolean);
      const imageUrl = images[0] || extractImageUrl(it, raw);
      const seller = it.sellers?.[0];
      const offer = seller?.commertialOffer;
      const catalogPrice = offer?.Price || 0;
      const catalogListPrice = offer?.ListPrice || 0;
      const availQty = offer?.AvailableQuantity || 0;
      const isAvail = Boolean(offer?.IsAvailable) || availQty > 0;

      const indexedSku: IndexedSku = {
        skuId,
        productId: indexedProd.productId,
        referenceId: refId,
        variantName: it.name || '',
        medida: vInfo.medida,
        plazas: vInfo.plazas,
        dimensiones: vInfo.dimensiones,
        color: vInfo.color,
        diseno: vInfo.diseno,
        cuerpos: vInfo.cuerpos,
        attributes: vInfo.attributes,
        images,
        imageUrl,
        availableQuantity: availQty,
        isAvailable: isAvail,
        catalogPriceCents: catalogPrice > 0 ? Math.round(catalogPrice * 100) : 0,
        catalogListPriceCents: catalogListPrice > 0 ? Math.round(catalogListPrice * 100) : 0,
        hasVerifiablePrice: catalogPrice > 0,
        link: linkText
          ? `https://www.chaide.com/${linkText}/p?skuId=${skuId}`
          : `https://www.chaide.com/p?skuId=${skuId}`,
        rawItem: it,
      };

      indexedProd.skus.push(indexedSku);
      skuLookupMap.set(skuId, { product: indexedProd, sku: indexedSku });

      if (refId) {
        const refKey = refId.trim().toLowerCase();
        const list = refIdLookupMap.get(refKey) || [];
        list.push({ product: indexedProd, sku: indexedSku });
        refIdLookupMap.set(refKey, list);
      }
    }

    builtProducts.push(indexedProd);
    productByIdMap.set(indexedProd.productId, indexedProd);
    if (linkText) {
      productBySlugMap.set(linkText.toLowerCase(), indexedProd);
    }
  }

  indexedProducts = builtProducts;
  vtexStatusState.catalogCount = indexedProducts.length;
}

function saveCatalogMeta() {
  try {
    fs.writeFileSync(CATALOG_META_PATH, JSON.stringify(syncMeta, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Índice Chaide] Error guardando metadata:', e);
  }
}

function loadCatalogMeta() {
  if (fs.existsSync(CATALOG_META_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(CATALOG_META_PATH, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        syncMeta = {
          lastSyncAt: parsed.lastSyncAt || null,
          syncDurationMs: parsed.syncDurationMs || 0,
          syncErrors: Array.isArray(parsed.syncErrors) ? parsed.syncErrors : [],
          vtexSourceStats: parsed.vtexSourceStats || syncMeta.vtexSourceStats,
        };
      }
    } catch {
      // ignore corrupt meta
    }
  }
}

function upsertProductsIntoIndex(newProducts: RawVtexProduct[]) {
  if (!newProducts || newProducts.length === 0) return false;
  const map = new Map<string, RawVtexProduct>();
  for (const p of cachedCatalog) {
    map.set(String(p.productId), p);
  }
  let addedOrUpdated = false;
  for (const p of newProducts) {
    if (p && p.productId) {
      if (!map.has(String(p.productId))) {
        addedOrUpdated = true;
      }
      map.set(String(p.productId), p);
    }
  }
  if (addedOrUpdated) {
    const merged = Array.from(map.values());
    rebuildStructuredIndex(merged);
    try {
      fs.writeFileSync(CATALOG_FILE_PATH, JSON.stringify(merged), 'utf-8');
    } catch (e) {
      console.error('[Índice Chaide] Error persistiendo producto recuperado:', e);
    }
  }
  return addedOrUpdated;
}

/**
 * Load full catalog from disk cache instantly and schedule background refresh if stale
 */
export async function loadFullCatalog(): Promise<RawVtexProduct[]> {
  const now = Date.now();
  if (cachedCatalog.length > 0 && now - catalogLoadedAt < CATALOG_CACHE_TTL) {
    return cachedCatalog;
  }

  loadCatalogMeta();

  // 1. Instant load from persistent disk file (<50ms)
  if (cachedCatalog.length === 0 && fs.existsSync(CATALOG_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(CATALOG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        rebuildStructuredIndex(parsed);
        catalogLoadedAt = Date.now();
        syncState = 'ready';
        if (!syncMeta.lastSyncAt) {
          syncMeta.lastSyncAt = fs.statSync(CATALOG_FILE_PATH).mtime.toISOString();
          syncMeta.vtexSourceStats.pagedProductsCount = parsed.length;
        }
        recordSuccess(2);
        console.log(
          `[Índice Chaide] Cargados ${indexedProducts.length} productos y ${skuLookupMap.size} SKUs desde disco.`
        );
      }
    } catch (err) {
      console.error('[Índice Chaide] Error leyendo archivo de caché:', err);
    }
  }

  // 2. Background sync only if empty or older than TTL
  const metaAge = syncMeta.lastSyncAt ? now - new Date(syncMeta.lastSyncAt).getTime() : Infinity;
  if (cachedCatalog.length === 0 || metaAge > CATALOG_CACHE_TTL) {
    syncVtexCatalogInBackground();
  }

  return cachedCatalog;
}

/**
 * Multi-source public VTEX catalog synchronization (non-blocking)
 * Sources: paginated products/search (with resources header) + sitemap/product-0.xml + category/tree/10
 */
async function syncVtexCatalogInBackground() {
  if (isSyncing) return;
  isSyncing = true;
  syncState = 'syncing';
  const startTime = Date.now();
  const errors: string[] = [];

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Cotizador Chaide)' };
    const productMap = new Map<string, RawVtexProduct>();
    let totalExpectedFromHeader = 0;

    // 1. Paginated public catalog search (_from/_to)
    for (let from = 0; from < 2000; from += 50) {
      const res = await fetch(
        `https://www.chaide.com/api/catalog_system/pub/products/search/?_from=${from}&_to=${from + 49}`,
        { headers, signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) {
        const msg = `VTEX búsqueda paginada HTTP ${res.status} en rango ${from}-${from + 49}`;
        errors.push(msg);
        recordError(msg);
        break;
      }

      const resourcesHeader = res.headers.get('resources') || '';
      const totalMatch = resourcesHeader.match(/\/(\d+)/);
      if (totalMatch) {
        totalExpectedFromHeader = parseInt(totalMatch[1], 10);
      }

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;

      for (const p of data) {
        if (p?.productId) {
          productMap.set(String(p.productId), p);
        }
      }

      if (totalExpectedFromHeader > 0 && from + 50 >= totalExpectedFromHeader) break;
      if (data.length < 50 && totalExpectedFromHeader === 0) break;
    }

    const pagedCount = productMap.size;

    // 2. Cross-check public product sitemaps for any omitted slugs
    let sitemapUrlsCount = 0;
    let extraRecoveredCount = 0;
    const missingSlugs: string[] = [];
    const existingSlugs = new Set(
      Array.from(productMap.values()).map((p) => (p.linkText || '').toLowerCase()).filter(Boolean)
    );

    for (let page = 0; page < 3; page++) {
      try {
        const smRes = await fetch(`https://www.chaide.com/sitemap/product-${page}.xml`, {
          headers,
          signal: AbortSignal.timeout(10000),
        });
        if (!smRes.ok) break;
        const xml = await smRes.text();
        const locMatches = Array.from(xml.matchAll(/<loc>https?:\/\/www\.chaide\.com\/([^<\s]+?)\/p<\/loc>/gi));
        sitemapUrlsCount += locMatches.length;
        for (const m of locMatches) {
          const slug = m[1].trim().toLowerCase();
          if (slug && !existingSlugs.has(slug)) {
            missingSlugs.push(slug);
          }
        }
      } catch {
        break;
      }
    }

    // Fetch missing sitemap slugs in controlled batches of 4
    for (let i = 0; i < missingSlugs.length; i += 4) {
      const batch = missingSlugs.slice(i, i + 4);
      await Promise.all(
        batch.map(async (slug) => {
          try {
            const pRes = await fetch(
              `https://www.chaide.com/api/catalog_system/pub/products/search/${encodeURIComponent(slug)}`,
              { headers, signal: AbortSignal.timeout(10000) }
            );
            if (pRes.ok) {
              const pData = await pRes.json();
              if (Array.isArray(pData)) {
                for (const p of pData) {
                  if (p?.productId && !productMap.has(String(p.productId))) {
                    productMap.set(String(p.productId), p);
                    extraRecoveredCount++;
                  }
                }
              }
            }
          } catch (e: any) {
            errors.push(`Error recuperando slug ${slug}: ${e.message}`);
          }
        })
      );
    }

    // 3. Verify category tree count (depth 10)
    let categoryIdsChecked = 0;
    try {
      const catRes = await fetch('https://www.chaide.com/api/catalog_system/pub/category/tree/10', {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (catRes.ok) {
        const tree = await catRes.json();
        const countNodes = (nodes: any[]): number =>
          nodes.reduce((acc, n) => acc + 1 + (Array.isArray(n.children) ? countNodes(n.children) : 0), 0);
        if (Array.isArray(tree)) {
          categoryIdsChecked = countNodes(tree);
        }
      }
    } catch (e: any) {
      errors.push(`Error consultando árbol de categorías: ${e.message}`);
    }

    const merged = Array.from(productMap.values());
    if (merged.length > 0) {
      rebuildStructuredIndex(merged);
      catalogLoadedAt = Date.now();
      const durationMs = Date.now() - startTime;
      recordSuccess(durationMs);

      syncMeta = {
        lastSyncAt: new Date().toISOString(),
        syncDurationMs: durationMs,
        syncErrors: errors,
        vtexSourceStats: {
          pagedProductsCount: pagedCount,
          sitemapUrlsCount,
          categoryIdsChecked,
          extraRecoveredCount,
        },
      };
      syncState = errors.length > 0 ? 'error' : 'ready';

      try {
        fs.writeFileSync(CATALOG_FILE_PATH, JSON.stringify(merged), 'utf-8');
        saveCatalogMeta();
        console.log(
          `[Índice Chaide] Catálogo sincronizado: ${indexedProducts.length} productos, ${skuLookupMap.size} SKUs únicos (${durationMs}ms).`
        );
      } catch (e: any) {
        errors.push(`Error guardando índice en disco: ${e.message}`);
      }
    } else if (errors.length > 0) {
      syncMeta.syncErrors = errors;
      syncState = 'error';
      saveCatalogMeta();
    }
  } catch (err: any) {
    const msg = err.message || 'Error sincronizando catálogo VTEX';
    syncMeta.syncErrors = [msg];
    syncState = 'error';
    recordError(msg);
    saveCatalogMeta();
    console.error('[Índice Chaide] Error sincronizando catálogo:', err);
  } finally {
    isSyncing = false;
  }
}

export function triggerCatalogSync(): { started: boolean; status: CatalogStatusSummary } {
  const alreadyRunning = isSyncing;
  if (!alreadyRunning) {
    syncVtexCatalogInBackground();
  }
  return {
    started: !alreadyRunning,
    status: getCatalogStatusSummary(),
  };
}

export function getCatalogStatusSummary(): CatalogStatusSummary {
  const catMap = new Map<string, { productCount: number; skuCount: number }>();
  let productsWithoutVerifiableSku = 0;
  let skusWithoutPhoto = 0;
  let skusWithoutVerifiablePrice = 0;
  let skusOutOfStockCount = 0;

  for (const prod of indexedProducts) {
    const cat = prod.category || 'Otro';
    const current = catMap.get(cat) || { productCount: 0, skuCount: 0 };
    current.productCount += 1;
    current.skuCount += prod.skus.length;
    catMap.set(cat, current);

    if (prod.skus.length === 0) {
      productsWithoutVerifiableSku += 1;
    }

    for (const sku of prod.skus) {
      if (!sku.imageUrl) skusWithoutPhoto += 1;
      if (!sku.hasVerifiablePrice) skusWithoutVerifiablePrice += 1;
      if (!sku.isAvailable || sku.availableQuantity <= 0) skusOutOfStockCount += 1;
    }
  }

  const categoriesList = Array.from(catMap.entries())
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => b.productCount - a.productCount);

  return {
    totalProducts: indexedProducts.length,
    totalUniqueSkus: skuLookupMap.size,
    totalCategories: categoriesList.length,
    categoriesList,
    productsWithoutVerifiableSku,
    skusWithoutPhoto,
    skusWithoutVerifiablePrice,
    skusOutOfStockCount,
    syncErrors: syncMeta.syncErrors,
    lastSyncAt: syncMeta.lastSyncAt,
    syncDurationMs: syncMeta.syncDurationMs,
    syncState: isSyncing ? 'syncing' : syncState,
    coverageNote: 'Cobertura del catálogo público accesible; total administrativo no confirmado.',
    vtexSourceStats: syncMeta.vtexSourceStats,
  };
}

// Initial immediate load from disk (<50ms)
loadFullCatalog();

/**
 * Known product mapping for unambiguous shorthand aliases
 */
const KNOWN_PRODUCTS: Record<string, string> = {
  fb: '73',
  'continental fb': '73',
  'colchon continental fb': '73',
  'cama montessori': '320',
  montessori: '320',
  'cama montesorri': '320',
  'cama montesorry': '320',
  'continental tradicional de lujo nueva generacion': '76',
  'continental tradicional nueva generacion': '76',
  'colchon continental tradicional de lujo nueva generacion': '76',
  'continental de lujo tradicional': '72',
  'colchon continental de lujo tradicional': '72',
  'continental pillow top nueva generacion': '75',
  'continental de lujo non flip': '70',
  'base chaide tapiz': '30',
  'base tapiz': '30',
  'base chaide': '290',
  titanium: '113',
  'colchon titanium': '113',
  'titanium smart': '114',
  'colchon titanium smart': '114',
  restapedic: '101',
  'colchon restapedic': '101',
  'gran hotel': '88',
  'grand hotel': '88',
  'almohada bianca': '269',
  'ortopedico prensado': '98',
};

const STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'o',
  'con',
  'para',
  'por',
  'en',
  'un',
  'una',
  'unos',
  'unas',
]);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripVariantTokensFromQuery(qNorm: string): string {
  let cleaned = qNorm;
  cleaned = cleaned.replace(
    /\b(1\.5|2\.5|1,5|2,5|1|2|3|1½|2½|1¼|1\.25)?\s*(plazas?|plazes?|plaz|plzs?|pl)\b/gi,
    ' '
  );
  cleaned = cleaned.replace(
    /\b(plaza y media|dos plazas y media|dos y media|una plaza y media|dos plazas|tres plazas|una plaza)\b/gi,
    ' '
  );
  cleaned = cleaned.replace(/\b(un|dos|1|2)\s*cuerpos?\b/gi, ' ');
  cleaned = cleaned.replace(/\bcualquier color\b/gi, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

interface ScoredProduct {
  product: IndexedProduct;
  tier: number; // 5=Exact name, 4=All words exact, 3=Model/SKU/partial prefix, 2=Fuzzy typo, 1=Related (desc/category/variants)
  score: number;
  matchReason: string;
}

/**
 * 5-Tier Ranking Engine across ALL 2-level indexed products
 */
export function rankCatalogProducts(
  rawQuery: string,
  options?: { category?: string; stripVariants?: boolean }
): ScoredProduct[] {
  if (indexedProducts.length === 0 || !rawQuery.trim()) return [];

  const qTrim = rawQuery.trim();
  const qLower = qTrim.toLowerCase();
  const qBasic = normalizeTextBasic(qTrim);
  const qModelNorm = normalizeProductText(qTrim);
  const qForMatching = options?.stripVariants ? stripVariantTokensFromQuery(qModelNorm) : qModelNorm;
  const queryTokens = (qForMatching || qModelNorm)
    .split(' ')
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  // If user typed a pure number, also check SKU/RefId lookup directly
  const isNumericQuery = /^\d{1,10}$/.test(qTrim);
  const directSkuHit = isNumericQuery ? skuLookupMap.get(qTrim) : undefined;
  const directRefHits = isNumericQuery ? refIdLookupMap.get(qTrim.toLowerCase()) : undefined;

  // Check KNOWN_PRODUCTS exact alias
  const knownProductId = KNOWN_PRODUCTS[qLower] || KNOWN_PRODUCTS[qForMatching];

  const scored: ScoredProduct[] = [];

  for (const prod of indexedProducts) {
    if (options?.category && options.category !== 'Todos' && prod.category !== options.category) {
      continue;
    }

    const pBasic = normalizeTextBasic(prod.productName);
    const pNorm = normalizeProductText(prod.productName);
    const modelNorm = normalizeProductText(prod.model);
    const pTokens = pNorm.split(' ').filter((t) => t.length >= 1 && !STOPWORDS.has(t));
    const catText = normalizeTextBasic(`${prod.category} ${prod.subcategory} ${prod.brand}`);
    const descText = normalizeTextBasic(prod.description);
    const variantBlob = normalizeTextBasic(
      prod.skus
        .map((s) => `${s.skuId} ${s.referenceId || ''} ${s.variantName} ${s.color} ${s.medida} ${s.diseno}`)
        .join(' ')
    );

    let tier = 0;
    let score = 0;
    let matchReason = '';

    // Exact SKU ID or Product ID or RefId match
    if (directSkuHit && directSkuHit.product.productId === prod.productId) {
      tier = 5;
      score = 5900;
      matchReason = `Coincidencia exacta de SKU ${qTrim}`;
    } else if (
      directRefHits &&
      directRefHits.some((h) => h.product.productId === prod.productId)
    ) {
      tier = 5;
      score = 5800;
      matchReason = `Coincidencia exacta de RefId ${qTrim}`;
    } else if (knownProductId && prod.productId === knownProductId) {
      tier = 5;
      score = 5700;
      matchReason = 'Coincidencia comercial directa';
    } else if (pBasic === qBasic || pNorm === qForMatching || modelNorm === qForMatching) {
      // Tier 5: Exact full product or model name match
      tier = 5;
      score = 5500;
      matchReason = 'Nombre exacto';
    } else if (queryTokens.length > 0) {
      // Evaluate every important query word against product name words
      let wholeWordMatches = 0;
      let prefixMatches = 0;
      let fuzzyMatches = 0;
      let fuzzyPenalty = 0;

      for (const qt of queryTokens) {
        const wholeWordRx = new RegExp(`\\b${escapeRegex(qt)}\\b`, 'i');
        if (wholeWordRx.test(pNorm) || wholeWordRx.test(pBasic)) {
          wholeWordMatches++;
        } else if (pTokens.some((pt) => pt.startsWith(qt))) {
          prefixMatches++;
        } else if (pTokens.some((pt) => qt.startsWith(pt) && pt.length >= 4)) {
          fuzzyMatches++;
          fuzzyPenalty += 10;
        } else {
          // Fuzzy distance check against individual tokens in productName
          let bestDist = 99;
          for (const pt of pTokens) {
            const dist = levenshteinDistance(qt, pt);
            const maxLen = Math.max(qt.length, pt.length);
            const allowed = maxLen >= 8 ? 2 : maxLen >= 5 ? 2 : maxLen >= 4 ? 1 : 0;
            if (dist <= allowed && dist < bestDist) {
              bestDist = dist;
            }
          }
          if (bestDist < 99) {
            fuzzyMatches++;
            fuzzyPenalty += bestDist * 30;
          }
        }
      }

      const totalNameMatched = wholeWordMatches + prefixMatches + fuzzyMatches;

      // Tier 4: ALL important words match as whole words in product name/model
      if (wholeWordMatches === queryTokens.length) {
        tier = 4;
        // Prefer closer model lengths and exact phrase order
        const exactPhraseBoost = pNorm.includes(qForMatching) ? 250 : 0;
        const startsWithBoost = modelNorm.startsWith(qForMatching) || pNorm.startsWith(qForMatching) ? 150 : 0;
        const categoryBoost = prod.category === 'Colchón' ? 60 : prod.category === 'Almohada' || prod.category === 'Cama' || prod.category === 'Base' ? 40 : 0;
        const lengthRatioScore = Math.round((queryTokens.length / Math.max(1, pTokens.length)) * 120);
        score = 4000 + exactPhraseBoost + startsWithBoost + categoryBoost + lengthRatioScore;
        matchReason = 'Todas las palabras coinciden';
      } else if (wholeWordMatches + prefixMatches === queryTokens.length) {
        // Tier 3: All words match via whole-word or prefix (e.g. "golden", "montes")
        tier = 3;
        const wholeBonus = wholeWordMatches * 140;
        const phraseBoost = pNorm.includes(qForMatching) ? 180 : 0;
        const lengthScore = Math.round((queryTokens.length / Math.max(1, pTokens.length)) * 100);
        score = 3000 + wholeBonus + phraseBoost + lengthScore;
        matchReason = 'Modelo coincidente';
      } else if (totalNameMatched === queryTokens.length && fuzzyMatches > 0) {
        // Tier 2: Fuzzy typo match across all tokens (e.g. "montesorri", "titaniun")
        tier = 2;
        score = 2200 + wholeWordMatches * 120 - fuzzyPenalty;
        matchReason = 'Coincidencia aproximada (ortografía)';
      } else {
        // Tier 1: Related results (partial tokens, category, brand, description, variant attributes)
        let relatedHits = 0;
        let variantHits = 0;
        let categoryHits = 0;

        for (const qt of queryTokens) {
          if (catText.includes(qt)) categoryHits++;
          if (variantBlob.includes(qt) || descText.includes(qt)) variantHits++;
          if (pNorm.includes(qt)) relatedHits++;
        }

        if (totalNameMatched > 0 || relatedHits > 0 || categoryHits > 0 || variantHits > 0) {
          tier = 1;
          score =
            1000 +
            wholeWordMatches * 150 +
            prefixMatches * 90 +
            fuzzyMatches * 60 +
            categoryHits * 70 +
            variantHits * 40 -
            fuzzyPenalty;
          if (variantHits > 0 && totalNameMatched === 0) {
            matchReason = 'Coincidencia en variante / atributo';
          } else if (categoryHits > 0 && totalNameMatched === 0) {
            matchReason = `Categoría ${prod.category}`;
          } else {
            matchReason = 'Resultado relacionado';
          }
        }
      }
    } else if (qTrim.length >= 2) {
      // Short 1-2 char or fallback check
      if (pBasic.includes(qBasic)) {
        tier = 3;
        score = 3000;
        matchReason = 'Coincidencia parcial';
      }
    }

    if (tier > 0) {
      scored.push({ product: prod, tier, score, matchReason });
    }
  }

  // Sort strictly by Tier DESC, Score DESC, ProductName ASC (never unsorted VTEX order!)
  scored.sort((a, b) => {
    if (b.tier !== a.tier) return b.tier - a.tier;
    if (b.score !== a.score) return b.score - a.score;
    return a.product.productName.localeCompare(b.product.productName, 'es');
  });

  return scored;
}

/**
 * Autocomplete & catalog search suggestions separated into exactMatches vs relatedMatches
 */
export function getRankedSuggestions(
  query: string,
  options?: { limit?: number; category?: string }
): CatalogSuggestionsResponse {
  const start = Date.now();
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 100));

  if (!query || query.trim().length < 2 || indexedProducts.length === 0) {
    return {
      exactMatches: [],
      relatedMatches: [],
      totalExact: 0,
      totalRelated: 0,
      availableCategories: [],
      latencyMs: Date.now() - start,
    };
  }

  // First evaluate all categories matching the query so filter tabs always show real available categories
  const allScoredUnfiltered = rankCatalogProducts(query, { stripVariants: false });
  const availableCategories = Array.from(
    new Set(allScoredUnfiltered.filter((s) => s.tier >= 2).map((s) => s.product.category))
  );
  if (availableCategories.length === 0) {
    for (const s of allScoredUnfiltered) {
      if (!availableCategories.includes(s.product.category)) {
        availableCategories.push(s.product.category);
      }
    }
  }

  const scored =
    options?.category && options.category !== 'Todos'
      ? allScoredUnfiltered.filter((s) => s.product.category === options.category)
      : allScoredUnfiltered;

  const toSuggestionItem = (s: ScoredProduct): CatalogSuggestionItem => {
    const p = s.product;
    const sizes = Array.from(new Set(p.skus.map((sk) => sk.medida).filter(Boolean)));
    const colors = Array.from(new Set(p.skus.map((sk) => sk.color).filter(Boolean)));
    const designs = Array.from(new Set(p.skus.map((sk) => sk.diseno).filter(Boolean)));
    const firstWithImage = p.skus.find((sk) => sk.imageUrl) || p.skus[0];

    return {
      productId: p.productId,
      productName: p.productName,
      brand: p.brand,
      category: p.category,
      subcategory: p.subcategory,
      linkText: p.linkText,
      image: firstWithImage?.imageUrl,
      skusCount: p.skus.length,
      sizes,
      colors,
      designs,
      matchTier: s.tier,
      matchReason: s.matchReason,
      defaultSkuId: p.skus[0]?.skuId,
    };
  };

  const exactScored = scored.filter((s) => s.tier >= 3);
  const relatedScored = scored.filter((s) => s.tier < 3);

  const exactMatches = exactScored.slice(0, limit).map(toSuggestionItem);
  const remainingSlots = Math.max(0, limit - exactMatches.length);
  const relatedLimit = exactMatches.length === 0 ? limit : Math.max(4, remainingSlots);
  const relatedMatches = relatedScored.slice(0, relatedLimit).map(toSuggestionItem);

  return {
    exactMatches,
    relatedMatches,
    totalExact: exactScored.length,
    totalRelated: relatedScored.length,
    availableCategories,
    latencyMs: Date.now() - start,
  };
}

/**
 * Legacy helper kept for compatibility
 */
export function getAutocompleteSuggestions(query: string, limit = 8) {
  const ranked = getRankedSuggestions(query, { limit });
  return [...ranked.exactMatches, ...ranked.relatedMatches].slice(0, limit);
}

/**
 * Instant local fuzzy matcher used by Gemini parser and quotation engine
 */
export function matchProductLocally(queryText: string): { product: RawVtexProduct; score: number } | null {
  if (indexedProducts.length === 0) return null;

  const qNorm = normalizeProductText(queryText);
  const cleaned = stripVariantTokensFromQuery(qNorm);

  // Strip color names ONLY if stripping them still leaves meaningful model tokens
  let withoutColors = cleaned;
  for (const cw of KNOWN_COLOR_PATTERNS) {
    const rx = new RegExp(`\\b${escapeRegex(normalizeTextBasic(cw))}\\b`, 'gi');
    withoutColors = withoutColors.replace(rx, ' ');
  }
  withoutColors = withoutColors.replace(/\s+/g, ' ').trim();

  const effectiveQuery = withoutColors.length >= 2 ? withoutColors : cleaned || qNorm;
  const ranked = rankCatalogProducts(effectiveQuery, { stripVariants: true });

  if (ranked.length === 0) return null;

  // Model specificity tie-breaker ONLY when user explicitly typed base model without "smart"/"dark"
  const effLower = effectiveQuery.toLowerCase();
  if (!effLower.includes('smart') && !effLower.includes('dark') && !effLower.includes('nueva generacion')) {
    const exactBase = ranked.find((r) => {
      const pn = normalizeProductText(r.product.productName);
      return (
        r.tier >= 3 &&
        !pn.includes('smart') &&
        !pn.includes('nueva generacion') &&
        !pn.includes('kit ') &&
        !pn.includes('combo ')
      );
    });
    if (exactBase && ranked[0].tier === exactBase.tier && ranked[0].score - exactBase.score < 200) {
      return { product: exactBase.product.rawProduct, score: exactBase.score / 1000 };
    }
  }

  const top = ranked[0];
  if (top.tier >= 2 || top.score >= 1250) {
    return { product: top.product.rawProduct, score: top.score / 1000 };
  }

  return null;
}

/**
 * Find sibling/related versions of the same base model (e.g. Golden Dreams / Dark / Smart / Dark Smart, or Cervical Memory Foam / Dark)
 */
export function findRelatedModelOptions(product: RawVtexProduct): RelatedModelOption[] {
  const current = productByIdMap.get(String(product.productId));
  if (!current) return [];

  const baseStem = normalizeProductText(current.model)
    .replace(/\b(dark|smart|tradicional|nueva generacion|pillow top|non flip|soft|memory|convoluted foam|memory foam|lavanda|manzanilla|fresh|carbon|cobre)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!baseStem || baseStem.length < 4) return [];

  const siblings: RelatedModelOption[] = [];
  for (const cand of indexedProducts) {
    if (cand.productId === current.productId) continue;
    if (cand.category !== current.category) continue;
    const candModelNorm = normalizeProductText(cand.model);
    if (candModelNorm.includes(baseStem)) {
      const firstSku = cand.skus[0];
      if (!firstSku) continue;
      siblings.push({
        productId: cand.productId,
        productName: cand.productName,
        label: cand.model,
        skuId: firstSku.skuId,
        imageUrl: firstSku.imageUrl,
        linkText: cand.linkText,
      });
    }
  }

  return siblings.slice(0, 6);
}

/**
 * Fetch a single product by productId
 */
export async function getProductById(productId: string): Promise<RawVtexProduct | null> {
  const fromMap = productByIdMap.get(String(productId));
  if (fromMap) return fromMap.rawProduct;

  const startTime = Date.now();
  try {
    const res = await fetch(
      `https://www.chaide.com/api/catalog_system/pub/products/search/?fq=productId:${encodeURIComponent(productId)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) {
      recordError(`HTTP ${res.status} al consultar productId ${productId}`);
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data) && data[0]) {
      recordSuccess(Date.now() - startTime);
      upsertProductsIntoIndex([data[0]]);
      return data[0];
    }
    return null;
  } catch (err: any) {
    recordError(err.message || 'Error de conexión con VTEX');
    return null;
  }
}

/**
 * Fetch a single product by slug or linkText
 */
export async function getProductBySlug(slug: string): Promise<RawVtexProduct | null> {
  const cleanSlug = slug.replace(/^\/|\/p\/?$/g, '').trim().toLowerCase();

  const fromMap = productBySlugMap.get(cleanSlug);
  if (fromMap) return fromMap.rawProduct;

  const startTime = Date.now();
  try {
    const res = await fetch(
      `https://www.chaide.com/api/catalog_system/pub/products/search/${encodeURIComponent(cleanSlug)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) {
      recordError(`HTTP ${res.status} al consultar slug ${cleanSlug}`);
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      recordSuccess(Date.now() - startTime);
      upsertProductsIntoIndex(data);
      const exact = data.find((p) => (p.linkText || '').toLowerCase() === cleanSlug);
      return exact || data[0];
    }
    return null;
  } catch (err: any) {
    recordError(err.message || 'Error de conexión con VTEX');
    return null;
  }
}

/**
 * Automatic recovery pipeline for omitted / not-yet-indexed products
 */
export async function searchProductsWithRecovery(query: string): Promise<{
  products: RawVtexProduct[];
  alternativeMatches: Array<{ productId: string; productName: string; category: string; skuId: string; imageUrl?: string }>;
  diagnosticCode?: DiagnosticErrorCode;
  errorMessage?: string;
}> {
  // 1. Check ranked local index first
  const localMatch = matchProductLocally(query);
  const rankedLocal = rankCatalogProducts(stripVariantTokensFromQuery(normalizeProductText(query)) || query, {
    stripVariants: true,
  });

  if (localMatch) {
    const alternatives = rankedLocal
      .filter((r) => r.tier >= 3 && r.product.productId !== localMatch.product.productId)
      .slice(0, 5)
      .map((r) => ({
        productId: r.product.productId,
        productName: r.product.productName,
        category: r.product.category,
        skuId: r.product.skus[0]?.skuId || '',
        imageUrl: r.product.skus[0]?.imageUrl,
      }));

    return {
      products: [localMatch.product],
      alternativeMatches: alternatives,
    };
  }

  // 2. Fallback live VTEX search + VTEX Intelligent Search
  const startTime = Date.now();
  const cleanQ = stripVariantTokensFromQuery(normalizeProductText(query)) || query.trim();
  const encoded = encodeURIComponent(cleanQ.replace(/-/g, ' '));
  const headers = { 'User-Agent': 'Mozilla/5.0 (Cotizador Chaide)' };

  try {
    const [catalogRes, intelligentRes] = await Promise.allSettled([
      fetch(`https://www.chaide.com/api/catalog_system/pub/products/search/${encoded}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      }),
      fetch(
        `https://www.chaide.com/api/io/_v/api/intelligent-search/product_search?query=${encoded}`,
        { headers, signal: AbortSignal.timeout(10000) }
      ),
    ]);

    const discovered: RawVtexProduct[] = [];

    if (catalogRes.status === 'fulfilled') {
      if (catalogRes.value.status === 401 || catalogRes.value.status === 403) {
        return {
          products: [],
          alternativeMatches: [],
          diagnosticCode: 'RESTRICTED_ACCESS',
          errorMessage: 'Acceso restringido al consultar el catálogo público de VTEX.',
        };
      }
      if (catalogRes.value.ok) {
        const data = await catalogRes.value.json();
        if (Array.isArray(data)) discovered.push(...data);
      }
    }

    if (discovered.length === 0 && intelligentRes.status === 'fulfilled' && intelligentRes.value.ok) {
      const iData = await intelligentRes.value.json();
      if (Array.isArray(iData?.products)) {
        discovered.push(...iData.products);
      }
    }

    if (discovered.length > 0) {
      recordSuccess(Date.now() - startTime);
      upsertProductsIntoIndex(discovered);
      return {
        products: discovered,
        alternativeMatches: discovered.slice(1, 5).map((p) => ({
          productId: p.productId,
          productName: p.productName,
          category: extractCanonicalCategory(p),
          skuId: p.items?.[0]?.itemId || '',
          imageUrl: p.items?.[0]?.images?.[0]?.imageUrl,
        })),
      };
    }

    // If catalogRes failed due to network error
    if (catalogRes.status === 'rejected' && intelligentRes.status === 'rejected') {
      return {
        products: [],
        alternativeMatches: [],
        diagnosticCode: 'CONNECTION_ERROR',
        errorMessage: 'Error de conexión al consultar el catálogo oficial de Chaide.',
      };
    }

    return {
      products: [],
      alternativeMatches: [],
      diagnosticCode: 'NOT_FOUND_PUBLIC',
      errorMessage: 'Producto inexistente en el catálogo público accesible de www.chaide.com.',
    };
  } catch (err: any) {
    recordError(err.message || 'Error de conexión con VTEX');
    return {
      products: [],
      alternativeMatches: [],
      diagnosticCode: 'CONNECTION_ERROR',
      errorMessage: 'Error de conexión con VTEX al buscar el producto.',
    };
  }
}

export async function searchProducts(query: string): Promise<RawVtexProduct[]> {
  const res = await searchProductsWithRecovery(query);
  return res.products;
}

/**
 * Comprehensive SKU search across ALL matching products and ALL their SKUs (for Tab 2: Buscador SKU)
 */
export async function searchAllMatchingSkus(query: string): Promise<
  Array<{
    product: IndexedProduct;
    sku: IndexedSku;
    matchTier: number;
    matchReason: string;
  }>
> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const results: Array<{
    product: IndexedProduct;
    sku: IndexedSku;
    matchTier: number;
    matchReason: string;
  }> = [];
  const seenSkuIds = new Set<string>();

  const pushUnique = (product: IndexedProduct, sku: IndexedSku, tier: number, reason: string) => {
    if (seenSkuIds.has(sku.skuId)) return;
    seenSkuIds.add(sku.skuId);
    results.push({ product, sku, matchTier: tier, matchReason: reason });
  };

  // 1. Direct numeric SKU ID or RefId lookup
  if (/^\d{1,10}$/.test(trimmed)) {
    const skuHit = skuLookupMap.get(trimmed);
    if (skuHit) {
      pushUnique(skuHit.product, skuHit.sku, 5, 'Coincidencia exacta de SKU ID');
    }
    const refHits = refIdLookupMap.get(trimmed.toLowerCase());
    if (refHits) {
      for (const h of refHits) {
        pushUnique(h.product, h.sku, 5, 'Coincidencia exacta de RefId');
      }
    }
    if (results.length > 0) return results;

    // Live VTEX lookup fallback for non-indexed numeric SKU
    const liveHit = await getProductAndSkuBySkuId(trimmed);
    if (liveHit) {
      upsertProductsIntoIndex([liveHit.product]);
      const pIdx = productByIdMap.get(String(liveHit.product.productId));
      const sIdx = pIdx?.skus.find((s) => s.skuId === String(liveHit.sku.itemId));
      if (pIdx && sIdx) {
        pushUnique(pIdx, sIdx, 5, 'SKU encontrado en VTEX en vivo');
        return results;
      }
    }
  }

  // 2. Ranked catalog search returning ALL matching products & matching SKUs
  const qNorm = normalizeProductText(trimmed);
  const ranked = rankCatalogProducts(trimmed, { stripVariants: true });

  // Extract explicit color/size filter hints from query to highlight/filter matching SKUs when appropriate
  const qLower = trimmed.toLowerCase();
  const explicitColor = KNOWN_COLOR_PATTERNS.find((cw) =>
    new RegExp(`\\b${escapeRegex(cw)}\\b`, 'i').test(qLower)
  );

  for (const entry of ranked.slice(0, 25)) {
    const prod = entry.product;
    // Include SKUs of matching products (filter by color ONLY if query named a specific color AND product has SKUs of that color)
    let candidateSkus = prod.skus;
    if (explicitColor && !prod.productName.toLowerCase().includes(explicitColor)) {
      const colorFiltered = prod.skus.filter(
        (s) =>
          s.color.toLowerCase().includes(explicitColor) ||
          s.variantName.toLowerCase().includes(explicitColor)
      );
      if (colorFiltered.length > 0) {
        candidateSkus = colorFiltered;
      }
    }

    for (const sku of candidateSkus) {
      pushUnique(prod, sku, entry.tier, entry.matchReason);
    }
  }

  // 3. Also scan SKU-level attributes directly if results < 20 (e.g. searching "negro", "70x50", "refId")
  if (qNorm.length >= 3) {
    for (const prod of indexedProducts) {
      for (const sku of prod.skus) {
        if (seenSkuIds.has(sku.skuId)) continue;
        const skuBlob = normalizeTextBasic(
          `${sku.skuId} ${sku.referenceId || ''} ${sku.variantName} ${sku.color} ${sku.medida} ${sku.diseno}`
        );
        if (skuBlob.includes(normalizeTextBasic(trimmed))) {
          pushUnique(prod, sku, 2, 'Coincidencia directa en variante SKU');
        }
      }
    }
  }

  return results;
}

/**
 * Fetch real-time verified price and offer details for an SKU with caching
 */
export async function verifySkuPricing(
  skuId: string,
  slugHint?: string,
  fallbackItem?: RawVtexItem
): Promise<ProductPricing> {
  const verificationTime = new Date().toLocaleTimeString('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const officialLink = slugHint
    ? `https://www.chaide.com/${slugHint}/p?skuId=${skuId}`
    : `https://www.chaide.com/p?skuId=${skuId}`;

  // Check in-memory price cache
  const cachedPrice = priceCache.get(skuId);
  if (cachedPrice && Date.now() - cachedPrice.timestamp < PRICE_CACHE_TTL) {
    return {
      ...cachedPrice.pricing,
      verificationTime,
      officialLink,
    };
  }

  const startTime = Date.now();
  try {
    const simRes = await fetch(
      'https://www.chaide.com/api/checkout/pub/orderForms/simulation',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: skuId, quantity: 1, seller: '1' }],
          country: 'ECU',
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (simRes.status === 401 || simRes.status === 403) {
      return {
        listPriceCents: 0,
        promoPriceCents: 0,
        discountPercent: 0,
        discountCalculated: false,
        isBlackFriday: false,
        ivaIncluded: true,
        verified: false,
        verificationTime,
        officialLink,
        diagnosticCode: 'RESTRICTED_ACCESS',
        unverifiedReason: 'Acceso restringido al consultar precios en Chaide',
      };
    }

    if (simRes.ok) {
      const simData = await simRes.json();
      const item = simData.items?.[0];

      if (item && item.availability === 'available' && (item.sellingPrice > 0 || item.price > 0)) {
        recordSuccess(Date.now() - startTime);

        const taxRate = 0.15; // 15% IVA Ecuador standard
        const promoPriceCents = Math.round(item.sellingPrice + (item.tax || 0));
        const listPriceCents =
          item.listPrice && item.listPrice > 0
            ? Math.round(item.listPrice * (1 + taxRate))
            : promoPriceCents;

        let discountPercent = 0;
        let discountCalculated = false;

        if (listPriceCents > promoPriceCents && listPriceCents > 0) {
          discountPercent = Math.round(
            ((listPriceCents - promoPriceCents) / listPriceCents) * 100
          );
          discountCalculated = true;
        }

        let isBlackFriday = false;
        const teasers = simData.ratesAndBenefitsData?.teaser || [];
        const campaigns = simData.ratesAndBenefitsData?.campaigns || [];
        for (const p of [...teasers, ...campaigns]) {
          const name = (p.name || '').toLowerCase();
          if (name.includes('black friday') || name.includes('blackfriday') || name.includes('bf')) {
            isBlackFriday = true;
            break;
          }
        }

        const pricing: ProductPricing = {
          listPriceCents,
          promoPriceCents,
          discountPercent,
          discountCalculated,
          isBlackFriday,
          ivaIncluded: true,
          verified: true,
          verificationTime,
          officialLink,
        };

        priceCache.set(skuId, { pricing, timestamp: Date.now() });
        return pricing;
      }
    }

    // Fallback: check commercial offer from catalog item ONLY if Price > 0
    const offerPrice = fallbackItem?.sellers?.[0]?.commertialOffer?.Price || 0;
    if (offerPrice > 0) {
      const offer = fallbackItem!.sellers![0].commertialOffer!;
      const promoPriceCents = Math.round(offer.Price * 100);
      const listPriceCents = offer.ListPrice > 0 ? Math.round(offer.ListPrice * 100) : promoPriceCents;
      let discountPercent = 0;
      let discountCalculated = false;
      if (listPriceCents > promoPriceCents) {
        discountPercent = Math.round(((listPriceCents - promoPriceCents) / listPriceCents) * 100);
        discountCalculated = true;
      }

      const fallbackPricing: ProductPricing = {
        listPriceCents,
        promoPriceCents,
        discountPercent,
        discountCalculated,
        isBlackFriday: false,
        ivaIncluded: true,
        verified: true,
        verificationTime,
        officialLink,
      };

      priceCache.set(skuId, { pricing: fallbackPricing, timestamp: Date.now() });
      return fallbackPricing;
    }

    recordError(`SKU ${skuId} sin precio verificable en Chaide`);
    return {
      listPriceCents: 0,
      promoPriceCents: 0,
      discountPercent: 0,
      discountCalculated: false,
      isBlackFriday: false,
      ivaIncluded: true,
      verified: false,
      verificationTime,
      officialLink,
      diagnosticCode: 'PRICE_UNAVAILABLE',
      unverifiedReason: 'Producto sin precio verificable actualmente en Chaide (posible SKU agotado o sin oferta vigente)',
    };
  } catch (err: any) {
    recordError(err.message || 'Error de conexión durante simulación');
    return {
      listPriceCents: 0,
      promoPriceCents: 0,
      discountPercent: 0,
      discountCalculated: false,
      isBlackFriday: false,
      ivaIncluded: true,
      verified: false,
      verificationTime,
      officialLink,
      diagnosticCode: 'CONNECTION_ERROR',
      unverifiedReason: 'Error de conexión con VTEX al consultar el precio',
    };
  }
}

/**
 * Find the best matching SKU for requested size, color, bodies, design
 */
export function selectBestSku(
  product: RawVtexProduct,
  criteria: {
    size?: string;
    color?: string;
    bodies?: string;
    design?: string;
    anyColor?: boolean;
    originalSkuId?: string;
  }
): {
  selectedSku: RawVtexItem;
  skuAdjustmentNote?: string;
  assignedColorNote?: string;
  needsVariantSelection?: boolean;
} {
  const items = product.items;
  if (!items || items.length === 0) {
    throw new Error('El producto no tiene variantes');
  }

  const parsedItems = items.map((it) => ({
    item: it,
    info: parseVariantInfo(it),
    isAvailable: Boolean(it.sellers?.[0]?.commertialOffer?.IsAvailable) || (it.sellers?.[0]?.commertialOffer?.AvailableQuantity || 0) > 0,
  }));

  // If user pasted an exact skuId via URL and didn't request overrides, honor it directly
  if (criteria.originalSkuId && !criteria.size && !criteria.color && !criteria.bodies && !criteria.design) {
    const exactUrlSku = parsedItems.find((p) => p.item.itemId === criteria.originalSkuId);
    if (exactUrlSku) {
      return {
        selectedSku: exactUrlSku.item,
        needsVariantSelection: false,
      };
    }
  }

  // Target size normalization
  let targetSize = (criteria.size || '').toLowerCase().trim();
  if (
    targetSize === '1.25' ||
    targetSize.includes('1.25') ||
    targetSize.includes('1¼') ||
    targetSize.includes('1 1/4') ||
    targetSize.includes('un cuarto')
  ) {
    targetSize = '1¼ plaza';
  } else if (
    targetSize === '1.5' ||
    targetSize.includes('1.5') ||
    targetSize.includes('1½') ||
    targetSize.includes('1 1/2') ||
    targetSize.includes('plaza y media')
  ) {
    targetSize = '1½ plaza';
  } else if (
    targetSize === '2.5' ||
    targetSize.includes('2.5') ||
    targetSize.includes('2½') ||
    targetSize.includes('2 1/2') ||
    targetSize.includes('2 plazas y media') ||
    targetSize.includes('dos plazas y media') ||
    targetSize.includes('dos y media')
  ) {
    targetSize = '2½ plazas';
  } else if (targetSize === '2' || targetSize.includes('2 plaza') || targetSize.includes('dos plazas')) {
    targetSize = '2 plazas';
  } else if (targetSize === '3' || targetSize.includes('3 plaza') || targetSize.includes('tres plazas')) {
    targetSize = '3 plazas';
  } else if (targetSize === '1' || targetSize.includes('1 plaza') || targetSize.includes('una plaza')) {
    targetSize = '1 plaza';
  }

  // Target bodies normalization
  let targetBodies = (criteria.bodies || '').toLowerCase().trim();
  if (targetBodies.includes('dos') || targetBodies.includes('2')) {
    targetBodies = 'Dos cuerpos';
  } else if (targetBodies.includes('un') || targetBodies.includes('1')) {
    targetBodies = 'Un cuerpo';
  }

  let matches = parsedItems;

  if (targetSize) {
    const sizeMatches = matches.filter(
      (m) =>
        m.info.plazas === targetSize ||
        m.info.medida.toLowerCase().includes(targetSize) ||
        m.item.name.toLowerCase().includes(targetSize)
    );
    if (sizeMatches.length > 0) {
      matches = sizeMatches;
    }
  }

  if (targetBodies) {
    const bodyMatches = matches.filter((m) => m.info.cuerpos === targetBodies);
    if (bodyMatches.length > 0) {
      matches = bodyMatches;
    }
  }

  if (criteria.design) {
    const targetDesign = criteria.design.toLowerCase().trim();
    const designMatches = matches.filter(
      (m) =>
        m.info.diseno.toLowerCase().includes(targetDesign) ||
        m.item.name.toLowerCase().includes(targetDesign)
    );
    if (designMatches.length > 0) {
      matches = designMatches;
    }
  }

  let assignedColorNote: string | undefined;
  if (criteria.color && criteria.color.toLowerCase() !== 'cualquier color') {
    const targetColor = criteria.color.toLowerCase().trim();
    const colorMatches = matches.filter(
      (m) =>
        m.info.color.toLowerCase().includes(targetColor) ||
        m.item.name.toLowerCase().includes(targetColor)
    );
    if (colorMatches.length > 0) {
      matches = colorMatches;
    }
  } else if (criteria.anyColor || criteria.color?.toLowerCase() === 'cualquier color') {
    const firstAvail = matches.find((m) => m.isAvailable) || matches[0];
    const firstColor = firstAvail?.info.color || 'Disponible';
    assignedColorNote = `Color asignado: ${firstColor} (solicitado: cualquier color)`;
  }

  // Prefer available SKU among matches
  const selected = matches.find((m) => m.isAvailable) || matches[0] || parsedItems[0];

  let skuAdjustmentNote: string | undefined;
  if (criteria.originalSkuId && criteria.originalSkuId !== selected.item.itemId) {
    const origItem = parsedItems.find((p) => p.item.itemId === criteria.originalSkuId);
    if (origItem) {
      skuAdjustmentNote = `El enlace abrió SKU ${criteria.originalSkuId} (${origItem.info.medida || 'otra medida'}), ajustado automáticamente al SKU ${selected.item.itemId} (${selected.info.medida || ''}${selected.info.cuerpos ? `, ${selected.info.cuerpos}` : ''}) según lo solicitado.`;
    }
  }

  const needsVariantSelection =
    parsedItems.length > 1 && !criteria.size && !criteria.color && !criteria.design;

  return {
    selectedSku: selected.item,
    skuAdjustmentNote,
    assignedColorNote,
    needsVariantSelection,
  };
}

/**
 * Build QuoteItem from product and selected SKU
 */
export async function buildQuoteItem(
  product: RawVtexProduct,
  selectedSku: RawVtexItem,
  quantity: number = 1,
  meta?: {
    rawQuery?: string;
    originalPastedSkuId?: string;
    skuAdjustmentNote?: string;
    assignedColorNote?: string;
    needsVariantSelection?: boolean;
    alternativeMatches?: QuoteItem['alternativeMatches'];
  }
): Promise<QuoteItem> {
  const variantInfo = parseVariantInfo(selectedSku);
  const pricing = await verifySkuPricing(selectedSku.itemId, product.linkText, selectedSku);
  const imageUrl = extractImageUrl(selectedSku, product);
  const referenceId = extractReferenceId(selectedSku, product);
  const category = extractCanonicalCategory(product);
  const subcategory = extractSubcategory(product);

  const availableVariants: ProductVariant[] = product.items.map((it) => {
    const info = parseVariantInfo(it);
    const offer = it.sellers?.[0]?.commertialOffer;
    const availQty = offer?.AvailableQuantity || 0;
    return {
      skuId: it.itemId,
      referenceId: extractReferenceId(it, product),
      name: it.name,
      medida: info.medida,
      plazas: info.plazas,
      dimensiones: info.dimensiones,
      color: info.color || undefined,
      diseno: info.diseno || undefined,
      cuerpos: info.cuerpos || undefined,
      attributes: info.attributes,
      inStock: Boolean(offer?.IsAvailable) || availQty > 0,
      availableQuantity: availQty,
      link: `https://www.chaide.com/${product.linkText}/p?skuId=${it.itemId}`,
      imageUrl: extractImageUrl(it, product),
    };
  });

  const relatedModels = findRelatedModelOptions(product);

  return {
    id: `${product.productId}-${selectedSku.itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productId: product.productId,
    productName: product.productName,
    brand: product.brand || 'Chaide',
    category,
    subcategory,
    skuId: selectedSku.itemId,
    referenceId,
    imageUrl,
    medida: variantInfo.medida,
    plazas: variantInfo.plazas,
    dimensiones: variantInfo.dimensiones,
    color: variantInfo.color || undefined,
    diseno: variantInfo.diseno || undefined,
    cuerpos: variantInfo.cuerpos || undefined,
    quantity: Math.max(1, quantity),
    availableVariants,
    relatedModels: relatedModels.length > 0 ? relatedModels : undefined,
    pricing,
    rawQuery: meta?.rawQuery,
    originalPastedSkuId: meta?.originalPastedSkuId,
    skuAdjustmentNote: meta?.skuAdjustmentNote,
    assignedColorNote: meta?.assignedColorNote,
    needsVariantSelection: meta?.needsVariantSelection,
    diagnosticCode: pricing.diagnosticCode,
    alternativeMatches: meta?.alternativeMatches,
  };
}

/**
 * Direct search by SKU itemId in catalog
 */
export async function getProductAndSkuBySkuId(
  skuId: string
): Promise<{ product: RawVtexProduct; sku: RawVtexItem } | null> {
  const cleanId = skuId.trim();

  const fromMap = skuLookupMap.get(cleanId);
  if (fromMap) {
    return { product: fromMap.product.rawProduct, sku: fromMap.sku.rawItem };
  }

  try {
    const res = await fetch(
      `https://www.chaide.com/api/catalog_system/pub/products/search/?fq=skuId:${encodeURIComponent(cleanId)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data[0]) {
      const p = data[0];
      upsertProductsIntoIndex([p]);
      const it = p.items.find((i: RawVtexItem) => i.itemId === cleanId) || p.items[0];
      return { product: p, sku: it };
    }
    return null;
  } catch (err) {
    console.error('Error finding SKU by ID:', err);
    return null;
  }
}

export function getIndexedProductById(productId: string): IndexedProduct | undefined {
  return productByIdMap.get(String(productId));
}

export function getIndexedSkuById(
  skuId: string
): { product: IndexedProduct; sku: IndexedSku } | undefined {
  return skuLookupMap.get(String(skuId).trim());
}

/**
 * Build a grouped SkuProductGroup with all real VTEX variants and verified active SKU pricing
 */
export async function buildSkuProductGroup(
  indexedProd: IndexedProduct,
  options?: {
    selectedSkuId?: string;
    quantity?: number;
    matchReason?: string;
    verifyLive?: boolean;
  }
): Promise<SkuProductGroup> {
  const variants: SkuGroupVariant[] = indexedProd.skus.map((sku) => {
    const promo = sku.catalogPriceCents;
    const list = sku.catalogListPriceCents > 0 ? sku.catalogListPriceCents : promo;
    const discountPercent =
      list > promo && list > 0 ? Math.round(((list - promo) / list) * 100) : 0;

    return {
      skuId: sku.skuId,
      referenceId: sku.referenceId,
      name: sku.variantName,
      medida: sku.medida,
      plazas: sku.plazas,
      dimensiones: sku.dimensiones,
      color: sku.color || undefined,
      diseno: sku.diseno || undefined,
      cuerpos: sku.cuerpos || undefined,
      attributes: sku.attributes || {},
      imageUrl: sku.imageUrl,
      link: sku.link,
      inStock: sku.isAvailable,
      availableQuantity: sku.availableQuantity,
      catalogPricing: {
        listPriceCents: list,
        promoPriceCents: promo,
        discountPercent,
        verified: sku.hasVerifiablePrice,
      },
    };
  });

  const preferredSku =
    (options?.selectedSkuId
      ? indexedProd.skus.find((s) => s.skuId === String(options.selectedSkuId))
      : undefined) ||
    indexedProd.skus.find((s) => s.isAvailable) ||
    indexedProd.skus[0];

  let initialPricing: ProductPricing;
  if (preferredSku) {
    if (options?.verifyLive !== false) {
      initialPricing = await verifySkuPricing(
        preferredSku.skuId,
        indexedProd.linkText,
        preferredSku.rawItem
      );
    } else {
      const promo = preferredSku.catalogPriceCents;
      const list =
        preferredSku.catalogListPriceCents > 0 ? preferredSku.catalogListPriceCents : promo;
      const discount = list > promo && list > 0 ? Math.round(((list - promo) / list) * 100) : 0;
      initialPricing = {
        listPriceCents: list,
        promoPriceCents: promo,
        discountPercent: discount,
        discountCalculated: discount > 0,
        isBlackFriday: false,
        ivaIncluded: true,
        verified: preferredSku.hasVerifiablePrice,
        verificationTime: new Date().toLocaleTimeString('es-EC', { hour12: false }),
        officialLink: preferredSku.link,
      };
    }
  } else {
    initialPricing = {
      listPriceCents: 0,
      promoPriceCents: 0,
      discountPercent: 0,
      discountCalculated: false,
      isBlackFriday: false,
      ivaIncluded: true,
      verified: false,
      verificationTime: new Date().toLocaleTimeString('es-EC', { hour12: false }),
      officialLink: indexedProd.officialLink,
    };
  }

  const relatedModels = findRelatedModelOptions(indexedProd.rawProduct);

  return {
    productId: indexedProd.productId,
    productName: indexedProd.productName,
    brand: indexedProd.brand || 'Chaide',
    category: indexedProd.category,
    linkText: indexedProd.linkText,
    officialLink: indexedProd.officialLink,
    quantity: Math.max(1, options?.quantity || 1),
    matchReason: options?.matchReason || 'Coincidencia de catálogo',
    selectedSkuId: preferredSku?.skuId || '',
    variants,
    initialPricing,
    relatedModels: relatedModels.length > 0 ? relatedModels : undefined,
  };
}

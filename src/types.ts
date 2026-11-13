export type DiagnosticErrorCode =
  | 'NOT_FOUND_PUBLIC'
  | 'NOT_INDEXED'
  | 'VARIANT_UNIDENTIFIED'
  | 'PRICE_UNAVAILABLE'
  | 'CONNECTION_ERROR'
  | 'RESTRICTED_ACCESS';

export interface ProductVariant {
  skuId: string;
  referenceId?: string;
  name: string;
  medida?: string;
  plazas: string;
  dimensiones: string;
  color?: string;
  diseno?: string;
  cuerpos?: string;
  attributes?: Record<string, string>;
  inStock: boolean;
  availableQuantity?: number;
  link: string;
  imageUrl?: string;
}

export interface RelatedModelOption {
  productId: string;
  productName: string;
  label: string;
  skuId: string;
  imageUrl?: string;
  linkText: string;
}

export interface ProductPricing {
  listPriceCents: number; // in cents with IVA
  promoPriceCents: number; // in cents with IVA
  discountPercent: number;
  discountCalculated: boolean;
  isBlackFriday: boolean;
  ivaIncluded: boolean;
  verified: boolean;
  verificationTime: string; // HH:MM:SS
  officialLink: string;
  unverifiedReason?: string;
  diagnosticCode?: DiagnosticErrorCode;
}

export interface QuoteItem {
  id: string;
  productId: string;
  productName: string;
  brand?: string;
  category: string;
  subcategory?: string;
  skuId: string;
  referenceId?: string;
  imageUrl?: string;
  medida?: string;
  plazas: string;
  dimensiones: string;
  color?: string;
  diseno?: string;
  cuerpos?: string;
  quantity: number;
  availableVariants: ProductVariant[];
  relatedModels?: RelatedModelOption[];
  pricing: ProductPricing;
  rawQuery?: string;
  originalPastedSkuId?: string;
  skuAdjustmentNote?: string;
  assignedColorNote?: string;
  needsVariantSelection?: boolean;
  diagnosticCode?: DiagnosticErrorCode;
  alternativeMatches?: Array<{
    productId: string;
    productName: string;
    category: string;
    skuId: string;
    imageUrl?: string;
  }>;
}

export type ShippingRule =
  | 'AUTO_FREE_OVER_350'
  | 'STANDARD_DELIVERY'
  | 'PICKUP_EXPLICIT'
  | 'PARTIAL_QUOTE_PENDING';

export interface ShippingCalculation {
  ruleApplied: ShippingRule;
  shippingCents: number;
  statusText: string;
  isFree: boolean;
  isOmitted: boolean;
  isPartial: boolean;
}

export interface QuoteSummary {
  subtotalNormalCents: number;
  subtotalPromoCents: number;
  totalSavingsCents: number;
  totalDiscountPercent: number;
  hasPartialSavings: boolean;
  isPartialQuote: boolean;
  shipping: ShippingCalculation;
  totalToPayCents: number | null;
  ivaConfirmedAll: boolean;
}

export interface ParsedItemQuery {
  rawQuery?: string;
  modelName: string;
  quantity: number;
  size?: string;
  color?: string;
  bodies?: string;
  design?: string;
  link?: string;
  originalSkuId?: string;
  anyColor?: boolean;
}

export interface ParseRequestResponse {
  items: ParsedItemQuery[];
  requestedDelivery: boolean;
  requestedPickup: boolean;
  explanation?: string;
}

export interface VtexStatus {
  connected: boolean;
  lastQueryAt: string | null;
  latencyMs: number;
  errorDetail: string | null;
  catalogCount: number;
}

export interface CatalogSuggestionItem {
  productId: string;
  productName: string;
  brand?: string;
  category: string;
  subcategory?: string;
  linkText: string;
  image?: string;
  skusCount: number;
  sizes: string[];
  colors: string[];
  designs: string[];
  matchTier: number;
  matchReason: string;
  defaultSkuId?: string;
}

export interface CatalogSuggestionsResponse {
  exactMatches: CatalogSuggestionItem[];
  relatedMatches: CatalogSuggestionItem[];
  totalExact: number;
  totalRelated: number;
  availableCategories: string[];
  latencyMs: number;
}

export interface CatalogStatusSummary {
  totalProducts: number;
  totalUniqueSkus: number;
  totalCategories: number;
  categoriesList: Array<{
    name: string;
    productCount: number;
    skuCount: number;
  }>;
  productsWithoutVerifiableSku: number;
  skusWithoutPhoto: number;
  skusWithoutVerifiablePrice: number;
  skusOutOfStockCount: number;
  syncErrors: string[];
  lastSyncAt: string | null;
  syncDurationMs: number;
  syncState: 'idle' | 'syncing' | 'error' | 'ready';
  coverageNote: string;
  vtexSourceStats: {
    pagedProductsCount: number;
    sitemapUrlsCount: number;
    categoryIdsChecked: number;
    extraRecoveredCount: number;
  };
}

/**
 * Sanitized commercial line item for ClientQuoteView / PNG / PDF.
 * Technically excludes SKU IDs, productIds, and internal reference codes.
 */
export interface ClientQuoteLineItem {
  renderKey: string;
  productName: string;
  imageUrl?: string;
  medida: string;
  color?: string;
  diseno?: string;
  cuerpos?: string;
  quantity: number;
  unitPromoCents: number;
  unitNormalCents: number;
}

export interface SkuGroupVariant {
  skuId: string;
  referenceId?: string;
  name: string;
  medida: string;
  plazas: string;
  dimensiones: string;
  color?: string;
  diseno?: string;
  cuerpos?: string;
  attributes: Record<string, string>;
  imageUrl?: string;
  link: string;
  inStock: boolean;
  availableQuantity: number;
  catalogPricing: {
    listPriceCents: number;
    promoPriceCents: number;
    discountPercent: number;
    verified: boolean;
  };
}

export interface SkuProductGroup {
  productId: string;
  productName: string;
  brand: string;
  category: string;
  linkText: string;
  officialLink: string;
  quantity: number;
  matchReason: string;
  selectedSkuId: string;
  variants: SkuGroupVariant[];
  initialPricing: ProductPricing;
  relatedModels?: RelatedModelOption[];
}


import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildQuoteItem,
  getProductById,
  getProductBySlug,
  getProductAndSkuBySkuId,
  searchProductsWithRecovery,
  selectBestSku,
  verifySkuPricing,
  parseVariantInfo,
  extractImageUrl,
  extractReferenceId,
  vtexStatusState,
  getRankedSuggestions,
  getCatalogStatusSummary,
  triggerCatalogSync,
  searchAllMatchingSkus,
  rankCatalogProducts,
  buildSkuProductGroup,
  getIndexedProductById,
  IndexedProduct,
} from './server/chaide-adapter.ts';
import { parseQueryWithGemini } from './server/gemini-parser.ts';
import { QuoteItem, SkuProductGroup } from './src/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());

// VTEX Live connection status endpoint
app.get('/api/vtex/status', (_req, res) => {
  res.json({
    ...vtexStatusState,
    geminiEnabled: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Cotizador Chaide',
    timestamp: new Date().toISOString(),
    geminiEnabled: !!process.env.GEMINI_API_KEY,
    vtexConnected: vtexStatusState.connected,
  });
});

/**
 * Catalog diagnostics & status modal endpoint
 */
app.get('/api/catalog/status', (_req, res) => {
  res.json(getCatalogStatusSummary());
});

/**
 * Non-blocking manual catalog sync trigger
 */
app.post('/api/catalog/sync', (_req, res) => {
  const result = triggerCatalogSync();
  res.json(result);
});

/**
 * Image proxy to ensure 100% CORS-safe rendering in html-to-image and jsPDF
 */
app.get('/api/image-proxy', async (req, res) => {
  const rawUrl = (req.query.url as string) || '';
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    return res.status(400).send('Invalid url parameter');
  }

  const normalizedUrl = rawUrl.replace(/^http:\/\/(chaideec\.vteximg\.com\.br|www\.chaide\.com)/i, 'https://$1');

  try {
    const upstream = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CotizadorChaide/1.0)',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!upstream.ok) {
      return res.status(upstream.status).send('Upstream image error');
    }
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return res.status(422).send('Upstream response is not an image');
    }
    const arrayBuffer = await upstream.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return res.status(502).send('Empty image response');
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error('Image proxy error:', err);
    res.status(500).send('Error proxying image');
  }
});

/**
 * Ranked catalog search (used by manual add modal & external queries)
 */
app.get('/api/catalog/search', async (req, res) => {
  const query = (req.query.q as string) || '';
  if (!query.trim()) {
    return res.json([]);
  }
  try {
    const ranked = getRankedSuggestions(query, { limit: 30 });
    const combined = [...ranked.exactMatches, ...ranked.relatedMatches];
    if (combined.length > 0) {
      return res.json(
        combined.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          category: item.category,
          link: `https://www.chaide.com/${item.linkText}/p`,
          linkText: item.linkText,
          skusCount: item.skusCount,
          image: item.image,
          sizes: item.sizes,
          colors: item.colors,
        }))
      );
    }

    const recovery = await searchProductsWithRecovery(query);
    return res.json(
      recovery.products.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        link: p.link,
        linkText: p.linkText,
        skusCount: p.items.length,
        image: p.items[0]?.images?.[0]?.imageUrl || undefined,
      }))
    );
  } catch (err) {
    console.error('Catalog search error:', err);
    res.status(500).json({ error: 'Error searching catalog' });
  }
});

/**
 * Real-time ranked suggestions endpoint from 2-level index (<10ms)
 * Separates exactMatches vs relatedMatches, supports category filter and expandable limit
 */
app.get('/api/catalog/suggestions', (req, res) => {
  const q = (req.query.q as string) || '';
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
  const category = (req.query.category as string) || undefined;
  const response = getRankedSuggestions(q, { limit, category });
  res.json(response);
});

/**
 * Get product variants by productId or slug
 */
app.get('/api/catalog/product/:idOrSlug', async (req, res) => {
  const param = req.params.idOrSlug;
  try {
    let product = await getProductById(param);
    if (!product) {
      product = await getProductBySlug(param);
    }
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(product);
  } catch (err) {
    console.error('Product fetch error:', err);
    res.status(500).json({ error: 'Error fetching product' });
  }
});

/**
 * Get grouped product + all parsed VTEX variants + verified active pricing (shared by AddProductModal)
 */
app.get('/api/catalog/product/:idOrSlug/group', async (req, res) => {
  const param = req.params.idOrSlug;
  const requestedSkuId = (req.query.skuId as string) || undefined;
  const hintQuery = (req.query.hint as string) || '';
  try {
    let product = await getProductById(param);
    if (!product) {
      product = await getProductBySlug(param);
    }
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const indexedProd = getIndexedProductById(product.productId);
    if (!indexedProd) {
      return res.status(404).json({ error: 'Producto no indexado' });
    }

    let preferredSkuId = requestedSkuId;
    if (!preferredSkuId && hintQuery.trim()) {
      const parsedHint = (await parseQueryWithGemini(hintQuery)).items[0];
      if (parsedHint && (parsedHint.size || parsedHint.color || parsedHint.bodies || parsedHint.design)) {
        const { selectedSku } = selectBestSku(product, {
          size: parsedHint.size,
          color: parsedHint.color,
          bodies: parsedHint.bodies,
          design: parsedHint.design,
          anyColor: parsedHint.anyColor,
        });
        preferredSkuId = selectedSku.itemId;
      }
    }

    const group = await buildSkuProductGroup(indexedProd, {
      selectedSkuId: preferredSkuId,
      quantity: 1,
      matchReason: 'Selección de catálogo',
      verifyLive: true,
    });
    res.json(group);
  } catch (err) {
    console.error('Product group fetch error:', err);
    res.status(500).json({ error: 'Error obteniendo variantes del producto' });
  }
});

/**
 * Pestaña 2: Buscador SKU
 * Returns grouped product models with ALL VTEX variants + live-verified active SKU
 */
app.post('/api/sku/search', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'La consulta es requerida' });
  }

  const trimmed = query.trim();

  // Helper to convert SkuProductGroup[] into legacy flat results for backwards compatibility
  const groupsToLegacyResults = (groups: SkuProductGroup[]) => {
    return groups.map((g) => {
      const v = g.variants.find((vr) => vr.skuId === g.selectedSkuId) || g.variants[0];
      return {
        productId: g.productId,
        productName: g.productName,
        category: g.category,
        skuId: v?.skuId || g.selectedSkuId || 'SKU no verificado',
        referenceId: v?.referenceId,
        medida: v?.medida || 'Estándar',
        plazas: v?.plazas || v?.medida || 'Estándar',
        dimensiones: v?.dimensiones || '',
        color: v?.color,
        diseno: v?.diseno,
        cuerpos: v?.cuerpos,
        quantity: g.quantity,
        imageUrl: v?.imageUrl,
        link: v?.link || g.officialLink,
        pricing: g.initialPricing,
        matchReason: g.matchReason,
        inStock: v?.inStock ?? true,
      };
    });
  };

  // 1. Direct numeric SKU ID or RefId lookup
  if (/^\d{1,10}$/.test(trimmed)) {
    try {
      const skuMatches = await searchAllMatchingSkus(trimmed);
      if (skuMatches.length > 0) {
        const seenProdIds = new Set<string>();
        const groupInputs: Array<{ prod: IndexedProduct; skuId: string; reason: string }> = [];

        for (const m of skuMatches) {
          if (seenProdIds.has(m.product.productId)) continue;
          seenProdIds.add(m.product.productId);
          groupInputs.push({
            prod: m.product,
            skuId: m.sku.skuId,
            reason: m.matchReason,
          });
          if (groupInputs.length >= 10) break;
        }

        const groups = await Promise.all(
          groupInputs.map((gi) =>
            buildSkuProductGroup(gi.prod, {
              selectedSkuId: gi.skuId,
              quantity: 1,
              matchReason: gi.reason,
              verifyLive: true,
            })
          )
        );

        const totalSkusMatched = groups.reduce((acc, g) => acc + g.variants.length, 0);
        return res.json({
          groups,
          results: groupsToLegacyResults(groups),
          totalSkusMatched,
          totalProductsMatched: groups.length,
        });
      }
    } catch (e) {
      console.error('Error looking up direct SKU/RefId:', e);
    }
  }

  // 2. Determine if user entered a multi-item line request vs a general catalog/model/color search
  const looksLikeMultiItem =
    trimmed.includes('\n') ||
    trimmed.includes(';') ||
    /\s+[yY]\s+(?:\d+|un|una|dos|tres|base|cama|colch[oó]n|almohada|protector|cobija|s[aá]bana|sofa|sof[aá])/i.test(
      trimmed
    );

  try {
    if (looksLikeMultiItem) {
      const parsed = await parseQueryWithGemini(trimmed);
      const groups: SkuProductGroup[] = [];
      const seenGroupKey = new Set<string>();

      for (const parsedItem of parsed.items) {
        let product = null;

        if (parsedItem.link) {
          try {
            const u = new URL(parsedItem.link);
            const slug = u.pathname.replace(/^\/|\/p\/?$/g, '');
            product = await getProductBySlug(slug);
          } catch {
            // ignore
          }
        }

        if (!product) {
          const found = await searchProductsWithRecovery(parsedItem.modelName);
          if (found.products.length > 0) {
            product = found.products[0];
          }
        }

        if (product) {
          const { selectedSku } = selectBestSku(product, {
            size: parsedItem.size,
            color: parsedItem.color,
            bodies: parsedItem.bodies,
            design: parsedItem.design,
            anyColor: parsedItem.anyColor,
            originalSkuId: parsedItem.originalSkuId,
          });

          const key = `${product.productId}-${selectedSku.itemId}`;
          if (seenGroupKey.has(key)) continue;
          seenGroupKey.add(key);

          const indexedProd = getIndexedProductById(product.productId);
          if (indexedProd) {
            const grp = await buildSkuProductGroup(indexedProd, {
              selectedSkuId: selectedSku.itemId,
              quantity: parsedItem.quantity || 1,
              matchReason: 'Coincidencia de pedido múltiple',
              verifyLive: true,
            });
            groups.push(grp);
          }
        }
      }

      const totalSkusMatched = groups.reduce((acc, g) => acc + g.variants.length, 0);
      return res.json({
        groups,
        results: groupsToLegacyResults(groups),
        totalSkusMatched,
        totalProductsMatched: groups.length,
      });
    }

    // 3. General single-query grouped SKU search across ALL matching models
    const parsedSingle = await parseQueryWithGemini(trimmed);
    const parsedHint = parsedSingle.items[0];

    let ranked = rankCatalogProducts(trimmed, { stripVariants: true });

    // If typos prevented direct match, try parsed modelName
    if (ranked.length === 0 && parsedHint?.modelName && parsedHint.modelName !== trimmed) {
      ranked = rankCatalogProducts(parsedHint.modelName, { stripVariants: true });
    }

    // If still empty, run VTEX recovery pipeline and re-rank
    if (ranked.length === 0) {
      await searchProductsWithRecovery(parsedHint?.modelName || trimmed);
      ranked = rankCatalogProducts(parsedHint?.modelName || trimmed, { stripVariants: true });
    }

    // Deduplicate distinct productIds while preserving ranking & distinct models (e.g. Golden Dreams series)
    const matchedEntries: Array<{ prod: IndexedProduct; matchReason: string }> = [];
    const seenProductIds = new Set<string>();

    for (const r of ranked) {
      if (seenProductIds.has(r.product.productId)) continue;
      seenProductIds.add(r.product.productId);
      matchedEntries.push({ prod: r.product, matchReason: r.matchReason });
      if (matchedEntries.length >= 16) break;
    }

    // Also include direct SKU-level matches if < 3 products matched by product name
    if (matchedEntries.length < 3) {
      const skuMatches = await searchAllMatchingSkus(trimmed);
      for (const sm of skuMatches) {
        if (seenProductIds.has(sm.product.productId)) continue;
        seenProductIds.add(sm.product.productId);
        matchedEntries.push({ prod: sm.product, matchReason: sm.matchReason });
        if (matchedEntries.length >= 16) break;
      }
    }

    // Build groups: pre-select best matching SKU per product based on parsed size/color/bodies/design
    const groups = await Promise.all(
      matchedEntries.map(async (entry, idx) => {
        let preferredSkuId = entry.prod.skus[0]?.skuId;
        if (entry.prod.rawProduct.items?.length > 0) {
          const { selectedSku } = selectBestSku(entry.prod.rawProduct, {
            size: parsedHint?.size,
            color: parsedHint?.color,
            bodies: parsedHint?.bodies,
            design: parsedHint?.design,
            anyColor: parsedHint?.anyColor,
          });
          preferredSkuId = selectedSku.itemId;
        }

        return buildSkuProductGroup(entry.prod, {
          selectedSkuId: preferredSkuId,
          quantity: parsedHint?.quantity || 1,
          matchReason: entry.matchReason,
          verifyLive: idx < 6,
        });
      })
    );

    const totalSkusMatched = groups.reduce((acc, g) => acc + g.variants.length, 0);

    res.json({
      groups,
      results: groupsToLegacyResults(groups),
      totalSkusMatched,
      totalProductsMatched: groups.length,
    });
  } catch (err: any) {
    console.error('SKU search error:', err);
    res.status(500).json({ error: 'Error buscando SKU' });
  }
});

/**
 * Live SKU verification when user switches variant selectors inside Buscador SKU
 */
app.post('/api/sku/verify', async (req, res) => {
  const { productId, skuId } = req.body;
  if (!productId || !skuId) {
    return res.status(400).json({ error: 'productId y skuId son requeridos' });
  }

  try {
    const product = await getProductById(String(productId));
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const skuItem = product.items.find((i) => i.itemId === String(skuId));
    if (!skuItem) {
      return res.status(404).json({ error: 'Variante no disponible en este producto' });
    }

    const info = parseVariantInfo(skuItem, product.productName);
    const pricing = await verifySkuPricing(skuItem.itemId, product.linkText, skuItem);
    const offer = skuItem.sellers?.[0]?.commertialOffer;
    const availableQuantity = offer?.AvailableQuantity || 0;
    const inStock = Boolean(offer?.IsAvailable) || availableQuantity > 0;

    res.json({
      productId: product.productId,
      productName: product.productName,
      skuId: skuItem.itemId,
      referenceId: extractReferenceId(skuItem, product),
      medida: info.medida,
      plazas: info.plazas,
      dimensiones: info.dimensiones,
      color: info.color || undefined,
      diseno: info.diseno || undefined,
      cuerpos: info.cuerpos || undefined,
      attributes: info.attributes,
      imageUrl: extractImageUrl(skuItem, product),
      link: `https://www.chaide.com/${product.linkText}/p?skuId=${skuItem.itemId}`,
      inStock,
      availableQuantity,
      pricing,
    });
  } catch (err) {
    console.error('Error verifying SKU:', err);
    res.status(500).json({ error: 'Error verificando SKU en VTEX' });
  }
});

/**
 * Pestaña 1: Parse natural language query and fetch live quotes for all items
 */
app.post('/api/quote/parse-and-quote', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'El campo de texto es requerido' });
  }

  try {
    const parsed = await parseQueryWithGemini(text);

    const quoteItems: QuoteItem[] = await Promise.all(
      parsed.items.map(async (parsedItem) => {
        let product = null;
        let alternativeMatches: QuoteItem['alternativeMatches'] = undefined;
        let notFoundDiagnostic: QuoteItem['diagnosticCode'] = undefined;
        let notFoundReason: string | undefined;

        if (parsedItem.link) {
          try {
            const u = new URL(parsedItem.link);
            const slug = u.pathname.replace(/^\/|\/p\/?$/g, '');
            product = await getProductBySlug(slug);
          } catch {
            // ignore
          }
        }

        if (!product) {
          const recovery = await searchProductsWithRecovery(parsedItem.modelName);
          if (recovery.products.length > 0) {
            product = recovery.products[0];
            if (recovery.alternativeMatches.length > 0) {
              alternativeMatches = recovery.alternativeMatches;
            }
          } else {
            notFoundDiagnostic = recovery.diagnosticCode || 'NOT_FOUND_PUBLIC';
            notFoundReason =
              recovery.errorMessage ||
              'Producto inexistente en el catálogo público accesible de Chaide';
          }
        }

        // Also enrich alternative matches when user typed a broad query like "dreams"
        if (product && (!alternativeMatches || alternativeMatches.length === 0)) {
          const broadRanked = rankCatalogProducts(parsedItem.rawQuery || parsedItem.modelName, {
            stripVariants: true,
          });
          const alts = broadRanked
            .filter((r) => r.tier >= 3 && r.product.productId !== product!.productId)
            .slice(0, 5)
            .map((r) => ({
              productId: r.product.productId,
              productName: r.product.productName,
              category: r.product.category,
              skuId: r.product.skus[0]?.skuId || '',
              imageUrl: r.product.skus[0]?.imageUrl,
            }));
          if (alts.length > 0) {
            alternativeMatches = alts;
          }
        }

        if (!product) {
          const unverifiedTime = new Date().toLocaleTimeString('es-EC', { hour12: false });
          return {
            id: `unverified-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            productId: '0',
            productName: parsedItem.modelName,
            category: 'Sin coincidencia',
            skuId: '0',
            medida: parsedItem.size || 'No especificada',
            plazas: parsedItem.size || 'No especificada',
            dimensiones: '',
            color: parsedItem.color,
            diseno: parsedItem.design,
            cuerpos: parsedItem.bodies,
            quantity: parsedItem.quantity || 1,
            availableVariants: [],
            diagnosticCode: notFoundDiagnostic,
            pricing: {
              listPriceCents: 0,
              promoPriceCents: 0,
              discountPercent: 0,
              discountCalculated: false,
              isBlackFriday: false,
              ivaIncluded: true,
              verified: false,
              verificationTime: unverifiedTime,
              officialLink: 'https://www.chaide.com',
              diagnosticCode: notFoundDiagnostic,
              unverifiedReason: notFoundReason,
            },
            rawQuery: parsedItem.rawQuery,
          };
        }

        const { selectedSku, skuAdjustmentNote, assignedColorNote, needsVariantSelection } =
          selectBestSku(product, {
            size: parsedItem.size,
            color: parsedItem.color,
            bodies: parsedItem.bodies,
            design: parsedItem.design,
            anyColor: parsedItem.anyColor,
            originalSkuId: parsedItem.originalSkuId,
          });

        return buildQuoteItem(product, selectedSku, parsedItem.quantity, {
          rawQuery: parsedItem.rawQuery,
          originalPastedSkuId: parsedItem.originalSkuId,
          skuAdjustmentNote,
          assignedColorNote,
          needsVariantSelection,
          alternativeMatches,
        });
      })
    );

    res.json({
      items: quoteItems,
      requestedDelivery: parsed.requestedDelivery,
      requestedPickup: parsed.requestedPickup,
      explanation: parsed.explanation,
    });
  } catch (err) {
    console.error('Quote error:', err);
    res.status(500).json({ error: 'Error procesando la cotización' });
  }
});

/**
 * Re-verify SKU when user changes variant, size, color, design, or swaps related model
 */
app.post('/api/quote/verify-variant', async (req, res) => {
  const { productId, skuId, quantity } = req.body;
  if (!productId || !skuId) {
    return res.status(400).json({ error: 'productId and skuId are required' });
  }

  try {
    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const selectedSku = product.items.find((i) => i.itemId === String(skuId)) || product.items[0];
    if (!selectedSku) {
      return res.status(404).json({ error: 'Variante no encontrada' });
    }

    const quoteItem = await buildQuoteItem(product, selectedSku, quantity || 1);
    res.json(quoteItem);
  } catch (err) {
    console.error('Variant verification error:', err);
    res.status(500).json({ error: 'Error verificando variante' });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cotizador Chaide server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

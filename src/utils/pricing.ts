import { ClientQuoteLineItem, QuoteItem, QuoteSummary, ShippingCalculation } from '../types';

/**
 * Format cents to Ecuadorian currency string ($1.127,01)
 */
export function formatCurrencyEC(cents: number): string {
  const isNegative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const centavos = abs % 100;
  const formattedDollars = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formattedCentavos = centavos.toString().padStart(2, '0');
  return (isNegative ? '-$' : '$') + formattedDollars + ',' + formattedCentavos;
}

/**
 * Calculate 100% automatic shipping according to Section 8
 * Subtotal > $350.00 -> Envío gratis ($0.00)
 * Subtotal <= $350.00 -> Envío $6.90
 * Exception: Explicit pickup in store/factory -> Envío omitido ($0.00)
 */
export function calculateAutomaticShipping(params: {
  subtotalPromoCents: number;
  isPartialQuote: boolean;
  requestedPickup: boolean;
}): ShippingCalculation {
  const { subtotalPromoCents, isPartialQuote, requestedPickup } = params;

  if (isPartialQuote) {
    return {
      ruleApplied: 'PARTIAL_QUOTE_PENDING',
      shippingCents: 0,
      statusText: 'Pendiente de verificar',
      isFree: false,
      isOmitted: true,
      isPartial: true,
    };
  }

  // Explicit pickup exception
  if (requestedPickup) {
    return {
      ruleApplied: 'PICKUP_EXPLICIT',
      shippingCents: 0,
      statusText: 'Retiro en tienda (Sin envío)',
      isFree: true,
      isOmitted: true,
      isPartial: false,
    };
  }

  // Strictly over $350.00 (35000 cents) -> $350.01+ qualifies
  if (subtotalPromoCents > 35000) {
    return {
      ruleApplied: 'AUTO_FREE_OVER_350',
      shippingCents: 0,
      statusText: 'Gratis',
      isFree: true,
      isOmitted: false,
      isPartial: false,
    };
  }

  // Under or equal to $350.00 -> $6.90
  return {
    ruleApplied: 'STANDARD_DELIVERY',
    shippingCents: 690,
    statusText: '$6,90',
    isFree: false,
    isOmitted: false,
    isPartial: false,
  };
}

/**
 * Calculate full summary for quote items
 */
export function calculateQuoteSummary(
  items: QuoteItem[],
  options: {
    requestedPickup: boolean;
  }
): QuoteSummary {
  let subtotalNormalCents = 0;
  let subtotalPromoCents = 0;
  let totalSavingsCents = 0;
  let hasPartialSavings = false;
  let isPartialQuote = false;
  let ivaConfirmedAll = items.length > 0;

  for (const item of items) {
    if (!item.pricing.verified) {
      isPartialQuote = true;
      continue;
    }

    if (!item.pricing.ivaIncluded) {
      ivaConfirmedAll = false;
    }

    const qty = Math.max(1, item.quantity);
    const linePromo = item.pricing.promoPriceCents * qty;
    subtotalPromoCents += linePromo;

    if (item.pricing.listPriceCents > 0) {
      const lineNormal = item.pricing.listPriceCents * qty;
      subtotalNormalCents += lineNormal;
      totalSavingsCents += (item.pricing.listPriceCents - item.pricing.promoPriceCents) * qty;
    } else {
      hasPartialSavings = true;
      subtotalNormalCents += linePromo;
    }
  }

  const shipping = calculateAutomaticShipping({
    subtotalPromoCents,
    isPartialQuote,
    requestedPickup: options.requestedPickup,
  });

  const totalToPayCents = isPartialQuote
    ? null
    : subtotalPromoCents + shipping.shippingCents;

  const totalDiscountPercent =
    subtotalNormalCents > subtotalPromoCents && subtotalNormalCents > 0
      ? Math.round(((subtotalNormalCents - subtotalPromoCents) / subtotalNormalCents) * 100)
      : 0;

  return {
    subtotalNormalCents,
    subtotalPromoCents,
    totalSavingsCents,
    totalDiscountPercent,
    hasPartialSavings,
    isPartialQuote,
    shipping,
    totalToPayCents,
    ivaConfirmedAll,
  };
}

function getItemHeader(item: QuoteItem): string {
  const name = item.productName;
  if (/^Colchón/i.test(name)) return `🛏️ ${name}`;
  if (/^Base/i.test(name)) return `🛋️ ${name}`;
  if (/^Almohada/i.test(name)) return `🪶 ${name}`;
  if (/^Cama/i.test(name)) return `🛏️ ${name}`;
  if (/^Protector/i.test(name)) return `🛡️ ${name}`;
  if (item.category === 'Colchón') return `🛏️ Colchón ${name}`;
  if (item.category === 'Base') return `🛋️ Base ${name}`;
  return `📦 ${name}`;
}

/**
 * Generate formatted plain text message for WhatsApp conforming strictly to Section 9
 * Rules: Plain text only, Spanish, no bold markdown, NO links, NO SKUs.
 */
export function generateWhatsAppMessage(
  items: QuoteItem[],
  summary: QuoteSummary
): string {
  if (items.length === 0) return '';

  const isSingleUnitSingleProduct =
    items.length === 1 && items[0].quantity === 1;

  const lines: string[] = [];
  const shippingLabel = summary.shipping.isFree ? 'Gratis' : '$6,90';

  if (isSingleUnitSingleProduct) {
    const item = items[0];
    lines.push(getItemHeader(item));
    lines.push(`📏 Medida: ${item.medida || item.plazas || 'Estándar'}`);

    if (item.color) {
      lines.push(`🎨 Color: ${item.color}`);
    }
    if (item.diseno) {
      lines.push(`✨ Diseño: ${item.diseno}`);
    }
    if (item.cuerpos) {
      lines.push(`🪵 Cuerpos: ${item.cuerpos}`);
    }

    lines.push('');

    if (!item.pricing.verified) {
      lines.push(`⚠️ ${item.pricing.unverifiedReason || 'No se pudo verificar el precio actual en Chaide'}`);
      lines.push('');
      lines.push('Cotización parcial - pendiente de verificación.');
      return lines.join('\n');
    }

    if (item.pricing.listPriceCents > 0) {
      lines.push(`💰 Precio normal: ${formatCurrencyEC(item.pricing.listPriceCents)}`);
    }
    lines.push(`🔥 Precio promocional: ${formatCurrencyEC(item.pricing.promoPriceCents)}`);

    if (item.pricing.discountPercent > 0) {
      lines.push(`🏷️ Descuento: ${item.pricing.discountPercent}%`);
    }

    const savings = item.pricing.listPriceCents - item.pricing.promoPriceCents;
    if (savings > 0) {
      lines.push(`💸 Ahorras: ${formatCurrencyEC(savings)}`);
    }

    lines.push('');
    lines.push(`🚚 Envío: ${shippingLabel}`);
    lines.push('');

    if (summary.totalToPayCents !== null) {
      lines.push(`💳 Total a pagar: ${formatCurrencyEC(summary.totalToPayCents)}`);
    }

    lines.push('');
    if (summary.ivaConfirmedAll) {
      lines.push('Precios con IVA incluido.');
    }
  } else {
    // Multi-product or multi-unit quote
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      lines.push(getItemHeader(item));
      lines.push(`📏 Medida: ${item.medida || item.plazas || 'Estándar'}`);

      if (item.color) {
        lines.push(`🎨 Color: ${item.color}`);
      }
      if (item.diseno) {
        lines.push(`✨ Diseño: ${item.diseno}`);
      }
      if (item.cuerpos) {
        lines.push(`🪵 Cuerpos: ${item.cuerpos}`);
      }

      lines.push(`📦 Cantidad: ${item.quantity}`);
      lines.push('');

      if (!item.pricing.verified) {
        lines.push('⚠️ No se pudo verificar el precio actual en Chaide');
      } else {
        if (item.pricing.listPriceCents > 0) {
          lines.push(`💰 Precio normal unitario: ${formatCurrencyEC(item.pricing.listPriceCents)}`);
        }
        lines.push(`🔥 Precio promocional unitario: ${formatCurrencyEC(item.pricing.promoPriceCents)}`);

        if (item.pricing.discountPercent > 0) {
          lines.push(`🏷️ Descuento: ${item.pricing.discountPercent}%`);
        }

        const lineSavings =
          item.pricing.listPriceCents > item.pricing.promoPriceCents
            ? (item.pricing.listPriceCents - item.pricing.promoPriceCents) * item.quantity
            : 0;
        if (lineSavings > 0) {
          lines.push(`💸 Ahorro de la línea: ${formatCurrencyEC(lineSavings)}`);
        }

        lines.push(`Subtotal: ${formatCurrencyEC(item.pricing.promoPriceCents * item.quantity)}`);
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    }

    lines.push('🛒 RESUMEN DE TU COTIZACIÓN');
    lines.push('');

    if (summary.isPartialQuote) {
      lines.push(`🔥 Subtotal promocional verificado: ${formatCurrencyEC(summary.subtotalPromoCents)}`);
      lines.push('⚠️ Cotización parcial: algunas líneas están pendientes de verificación.');
    } else {
      lines.push(`💰 Subtotal normal: ${formatCurrencyEC(summary.subtotalNormalCents)}`);
      lines.push(`🔥 Subtotal promocional: ${formatCurrencyEC(summary.subtotalPromoCents)}`);

      if (summary.totalDiscountPercent > 0) {
        lines.push(`🏷️ Descuento total: ${summary.totalDiscountPercent}%`);
      }

      lines.push(`💸 Ahorro total: ${formatCurrencyEC(summary.totalSavingsCents)}`);
      lines.push(`🚚 Envío: ${shippingLabel}`);
      lines.push('');

      if (summary.totalToPayCents !== null) {
        lines.push(`💳 TOTAL A PAGAR: ${formatCurrencyEC(summary.totalToPayCents)}`);
      }
    }

    lines.push('');
    if (summary.ivaConfirmedAll) {
      lines.push('Precios con IVA incluido.');
    }
  }

  return lines.join('\n');
}

/**
 * Strip all internal VTEX identifiers (skuId, productId, referenceId) before rendering
 * commercial client quotes, PNG exports, or PDF exports.
 */
export function toClientQuoteLineItems(
  items: QuoteItem[],
  quoteGenerationId: number = 0
): ClientQuoteLineItem[] {
  return items.map((item, idx) => ({
    renderKey: `q${quoteGenerationId}-line-${idx}-${item.productName}-${item.medida || item.plazas || ''}-${item.color || ''}-${item.imageUrl || 'noimg'}`,
    productName: item.productName,
    imageUrl: item.imageUrl,
    medida: item.medida || item.plazas || 'Estándar',
    color: item.color,
    diseno: item.diseno,
    cuerpos: item.cuerpos,
    quantity: Math.max(1, item.quantity),
    unitPromoCents: item.pricing.promoPriceCents,
    unitNormalCents: item.pricing.listPriceCents,
  }));
}

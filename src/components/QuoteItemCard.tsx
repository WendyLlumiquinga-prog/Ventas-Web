import React, { useState, useEffect } from 'react';
import {
  ExternalLink,
  Clock,
  Trash2,
  Plus,
  Minus,
  Info,
  Sparkles,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';
import { QuoteItem } from '../types';
import { formatCurrencyEC } from '../utils/pricing';

const ProductThumbImage: React.FC<{ imageUrl?: string; alt: string }> = ({ imageUrl, alt }) => {
  const imgRef = React.useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    imageUrl ? 'loading' : 'error'
  );

  useEffect(() => {
    if (!imageUrl) {
      setStatus('error');
      return;
    }
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setStatus('loaded');
    } else {
      setStatus('loading');
    }
  }, [imageUrl]);

  if (!imageUrl || status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
        <ImageIcon className="w-6 h-6 stroke-1 mb-1" />
        <span className="text-[9px] font-medium leading-tight">
          Imagen no disponible
        </span>
      </div>
    );
  }

  return (
    <>
      {status === 'loading' && (
        <div className="absolute inset-0 bg-slate-100 animate-pulse" />
      )}
      <img
        ref={imgRef}
        src={imageUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        className={`w-full h-full object-contain object-center transition-opacity duration-150 ${
          status === 'loaded' ? 'opacity-100' : 'opacity-0'
        }`}
        loading="eager"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </>
  );
};

interface QuoteItemCardProps {
  item: QuoteItem;
  onUpdateQuantity: (id: string, qty: number) => void;
  onRemoveItem: (id: string) => void;
  onSelectVariant: (id: string, newSkuId: string) => void;
  onSwapProduct?: (id: string, newProductId: string, newSkuId: string) => void;
  isUpdatingVariant?: boolean;
}

export const QuoteItemCard: React.FC<QuoteItemCardProps> = ({
  item,
  onUpdateQuantity,
  onRemoveItem,
  onSelectVariant,
  onSwapProduct,
  isUpdatingVariant,
}) => {
  const [showDetails, setShowDetails] = useState(item.needsVariantSelection || false);

  const isVerified = item.pricing.verified;
  const unitPromo = item.pricing.promoPriceCents;
  const unitNormal = item.pricing.listPriceCents;
  const linePromo = unitPromo * item.quantity;
  const lineNormal = unitNormal * item.quantity;
  const lineSavings = lineNormal > linePromo ? lineNormal - linePromo : 0;
  const unitSavings = unitNormal > unitPromo ? unitNormal - unitPromo : 0;

  const availableVariants = item.availableVariants || [];
  const currentMeasure = item.medida || item.plazas || '';

  const getVariantMeasure = (v: (typeof availableVariants)[number]) =>
    v.medida || v.plazas || v.dimensiones || '';

  // Unique measures (supports plazas AND cm/puestos/cajones/etc.)
  const uniqueMeasures: string[] = Array.from(
    new Set(availableVariants.map(getVariantMeasure).filter((s): s is string => Boolean(s)))
  );

  // Filter variants matching current measure for cascading color/design/bodies
  const measureMatchedVariants = currentMeasure
    ? availableVariants.filter((v) => getVariantMeasure(v) === currentMeasure)
    : availableVariants;
  const poolForColor = measureMatchedVariants.length > 0 ? measureMatchedVariants : availableVariants;

  const uniqueColors: string[] = Array.from(
    new Set(poolForColor.map((v) => v.color).filter((c): c is string => Boolean(c)))
  );
  // Also fallback to ALL colors across product if measure-filtered only had 1 but product has more
  const allProductColors: string[] = Array.from(
    new Set(availableVariants.map((v) => v.color).filter((c): c is string => Boolean(c)))
  );
  const displayColors = allProductColors.length > uniqueColors.length ? allProductColors : uniqueColors;

  const uniqueDesigns: string[] = Array.from(
    new Set(availableVariants.map((v) => v.diseno).filter((d): d is string => Boolean(d)))
  );

  const colorMatchedVariants = item.color
    ? poolForColor.filter((v) => v.color?.toLowerCase() === item.color?.toLowerCase())
    : poolForColor;
  const poolForBodies = colorMatchedVariants.length > 0 ? colorMatchedVariants : availableVariants;
  const uniqueBodies: string[] = Array.from(
    new Set(poolForBodies.map((v) => v.cuerpos).filter((b): b is string => Boolean(b)))
  );

  const handleMeasureChange = (newMeasure: string) => {
    let target = availableVariants.find(
      (v) =>
        getVariantMeasure(v) === newMeasure &&
        (!item.color || v.color?.toLowerCase() === item.color?.toLowerCase()) &&
        (!item.cuerpos || v.cuerpos === item.cuerpos) &&
        (!item.diseno || v.diseno?.toLowerCase() === item.diseno?.toLowerCase())
    );
    if (!target) {
      target = availableVariants.find((v) => getVariantMeasure(v) === newMeasure);
    }
    if (target) {
      onSelectVariant(item.id, target.skuId);
    }
  };

  const handleColorChange = (newColor: string) => {
    let target = availableVariants.find(
      (v) =>
        v.color?.toLowerCase() === newColor.toLowerCase() &&
        (!currentMeasure || getVariantMeasure(v) === currentMeasure) &&
        (!item.cuerpos || v.cuerpos === item.cuerpos)
    );
    if (!target) {
      target = availableVariants.find((v) => v.color?.toLowerCase() === newColor.toLowerCase());
    }
    if (target) {
      onSelectVariant(item.id, target.skuId);
    }
  };

  const handleDesignChange = (newDesign: string) => {
    let target = availableVariants.find(
      (v) =>
        v.diseno?.toLowerCase() === newDesign.toLowerCase() &&
        (!currentMeasure || getVariantMeasure(v) === currentMeasure)
    );
    if (!target) {
      target = availableVariants.find((v) => v.diseno?.toLowerCase() === newDesign.toLowerCase());
    }
    if (target) {
      onSelectVariant(item.id, target.skuId);
    }
  };

  const handleCuerposChange = (newCuerpos: string) => {
    let target = availableVariants.find(
      (v) =>
        v.cuerpos === newCuerpos &&
        (!currentMeasure || getVariantMeasure(v) === currentMeasure) &&
        (!item.color || v.color?.toLowerCase() === item.color?.toLowerCase())
    );
    if (!target) {
      target = availableVariants.find((v) => v.cuerpos === newCuerpos);
    }
    if (target) {
      onSelectVariant(item.id, target.skuId);
    }
  };

  const siblingModels = item.relatedModels || [];
  const otherMatches = item.alternativeMatches || [];
  const hasVariantSelectors =
    availableVariants.length > 1 ||
    uniqueMeasures.length > 1 ||
    displayColors.length > 1 ||
    uniqueDesigns.length > 1 ||
    uniqueBodies.length > 1;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all p-3 sm:p-4 space-y-3 relative">
      {/* Notifications of automatic corrections */}
      {item.skuAdjustmentNote && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-sky-50 border border-sky-200/60 text-sky-900 text-xs">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-600" />
          <span>{item.skuAdjustmentNote}</span>
        </div>
      )}

      {item.assignedColorNote && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-indigo-50 border border-indigo-200/60 text-indigo-900 text-xs">
          <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-600" />
          <span>{item.assignedColorNote}</span>
        </div>
      )}

      {/* Alternative / sibling model switcher when multiple matching models exist (e.g. Golden Dreams series) */}
      {onSwapProduct && (otherMatches.length > 0 || siblingModels.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap pb-2 border-b border-slate-100 text-[11px]">
          <span className="text-slate-500 font-medium flex items-center gap-1">
            <Layers className="w-3 h-3 text-blue-600" />
            <span>Otras versiones encontradas:</span>
          </span>
          {(otherMatches.length > 0 ? otherMatches : siblingModels).slice(0, 5).map((alt) => (
            <button
              key={alt.productId}
              type="button"
              disabled={isUpdatingVariant}
              onClick={() => onSwapProduct(item.id, alt.productId, alt.skuId)}
              className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200/80 font-medium transition-colors cursor-pointer"
            >
              {alt.productName}
            </button>
          ))}
        </div>
      )}

      {/* Main Cart Row: Left (Photo + Details), Right (Prices & Subtotal) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        {/* Left: Official Photography + Info */}
        <div className="flex items-start gap-3 w-full sm:w-auto flex-1">
          {/* Photo */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-white border border-slate-200/80 shrink-0 overflow-hidden flex items-center justify-center relative shadow-2xs p-1">
            <ProductThumbImage
              key={`${item.productId}-${item.skuId}-${item.imageUrl || 'noimg'}`}
              imageUrl={item.imageUrl}
              alt={item.productName}
            />

            {isUpdatingVariant && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
              <span className="font-semibold text-blue-700 uppercase tracking-wide">
                {item.category}
              </span>

              {item.pricing.isBlackFriday && (
                <span className="text-[10px] font-bold text-amber-900 bg-amber-300 px-1.5 py-0.5 rounded">
                  Black Friday
                </span>
              )}
            </div>

            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
              {item.productName}
            </h3>

            {/* Commercial Measure & Variants */}
            <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap pt-0.5">
              <span className="font-bold text-slate-900">
                {currentMeasure || 'Medida estándar'}
              </span>
              {item.color && (
                <span className="text-slate-500">
                  · Color: <strong className="text-slate-700 capitalize">{item.color}</strong>
                </span>
              )}
              {item.diseno && (
                <span className="text-slate-500">
                  · Diseño: <strong className="text-slate-700">{item.diseno}</strong>
                </span>
              )}
              {item.cuerpos && (
                <span className="text-slate-500">
                  · <strong className="text-slate-700">{item.cuerpos}</strong>
                </span>
              )}
            </div>

            {/* Quantity Stepper & Variant selector trigger */}
            <div className="flex items-center gap-3 pt-1 flex-wrap">
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
                  disabled={item.quantity <= 1}
                  className="px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateQuantity(item.id, isNaN(val) ? 1 : Math.max(1, val));
                  }}
                  className="w-9 text-center font-bold text-xs text-slate-900 border-x border-slate-200 py-0.5 focus:outline-none tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                  className="px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              {hasVariantSelectors && (
                <button
                  type="button"
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <span>
                    {showDetails
                      ? 'Ocultar variantes'
                      : `Variantes (${availableVariants.length})`}
                  </span>
                  {showDetails ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Price & Savings Block */}
        <div className="text-left sm:text-right w-full sm:w-auto sm:min-w-[170px] border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 space-y-1 tabular-nums">
          {isVerified ? (
            <>
              <div className="flex items-baseline justify-start sm:justify-end gap-2">
                {unitNormal > unitPromo && (
                  <span className="text-xs text-slate-400 line-through">
                    {formatCurrencyEC(unitNormal)}
                  </span>
                )}
                <span className="text-lg sm:text-xl font-extrabold text-blue-700">
                  {formatCurrencyEC(unitPromo)}
                </span>
                {item.quantity > 1 && (
                  <span className="text-[11px] text-slate-400">c/u</span>
                )}
              </div>

              <div className="flex items-center justify-start sm:justify-end gap-1.5 flex-wrap">
                {item.pricing.discountPercent > 0 && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.2 rounded">
                    -{item.pricing.discountPercent}%
                  </span>
                )}
                {unitSavings > 0 && (
                  <span className="text-[11px] font-bold text-emerald-600">
                    Ahorras {formatCurrencyEC(item.quantity > 1 ? lineSavings : unitSavings)}
                  </span>
                )}
              </div>

              {item.quantity > 1 && (
                <div className="pt-1 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">Subtotal ({item.quantity} unids): </span>
                  <span className="font-black text-slate-900 text-sm">
                    {formatCurrencyEC(linePromo)}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs text-left">
              <p className="font-bold">
                {item.diagnosticCode === 'NOT_FOUND_PUBLIC'
                  ? 'Producto inexistente en el catálogo público'
                  : item.diagnosticCode === 'CONNECTION_ERROR'
                  ? 'Error de conexión con VTEX'
                  : item.diagnosticCode === 'RESTRICTED_ACCESS'
                  ? 'Acceso restringido'
                  : 'Producto sin precio verificable'}
              </p>
              {item.pricing.unverifiedReason && (
                <p className="text-[11px] text-amber-800 mt-0.5">
                  {item.pricing.unverifiedReason}
                </p>
              )}
            </div>
          )}

          {/* Delete item button */}
          <div className="flex items-center justify-end pt-0.5">
            <button
              type="button"
              onClick={() => onRemoveItem(item.id)}
              className="text-slate-400 hover:text-red-600 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Interactive Variant Selectors (Medida, Color, Diseño, Cuerpos) */}
      {showDetails && hasVariantSelectors && (
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/90 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 pb-1 border-b border-slate-200/60">
            <span>Variantes oficiales de Chaide ({availableVariants.length} disponibles)</span>
            <span className="text-[10px] text-slate-400 font-normal">
              Recálculo automático en vivo
            </span>
          </div>

          {/* 1. Medida Selector */}
          {uniqueMeasures.length > 1 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Medida / Presentación
              </label>
              <div className="flex flex-wrap gap-1.5">
                {uniqueMeasures.map((sz) => {
                  const isSelected = currentMeasure === sz;
                  return (
                    <button
                      key={sz}
                      type="button"
                      disabled={isUpdatingVariant}
                      onClick={() => handleMeasureChange(sz)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Color Selector */}
          {displayColors.length > 1 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Color ({displayColors.length} opciones)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {displayColors.map((col) => {
                  const isSelected = item.color?.toLowerCase() === col.toLowerCase();
                  return (
                    <button
                      key={col}
                      type="button"
                      disabled={isUpdatingVariant}
                      onClick={() => handleColorChange(col)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {col}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Diseño Selector */}
          {uniqueDesigns.length > 1 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Diseño
              </label>
              <div className="flex flex-wrap gap-1.5">
                {uniqueDesigns.map((des) => {
                  const isSelected = item.diseno?.toLowerCase() === des.toLowerCase();
                  return (
                    <button
                      key={des}
                      type="button"
                      disabled={isUpdatingVariant}
                      onClick={() => handleDesignChange(des)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {des}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Cuerpos Selector */}
          {uniqueBodies.length > 1 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Número de Cuerpos
              </label>
              <div className="flex flex-wrap gap-1.5">
                {uniqueBodies.map((b) => {
                  const isSelected = item.cuerpos === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      disabled={isUpdatingVariant}
                      onClick={() => handleCuerposChange(b)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {item.dimensiones && (
            <p className="text-[11px] text-slate-500 font-mono pt-1">
              Dimensiones oficiales Chaide: {item.dimensiones}
            </p>
          )}
        </div>
      )}

      {/* Footer bar: Verification time & Official Chaide link */}
      <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-slate-400" />
          <span>Verificado a las {item.pricing.verificationTime}</span>
        </div>

        <a
          href={item.pricing.officialLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          <span>Ficha oficial Chaide</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Copy,
  Check,
  PlusCircle,
  ExternalLink,
  RotateCcw,
  Image as ImageIcon,
  AlertTriangle,
  Loader2,
  Minus,
  Plus,
  Layers,
  Hash,
} from 'lucide-react';
import { ProductPricing, SkuGroupVariant, SkuProductGroup } from '../types';
import { formatCurrencyEC } from '../utils/pricing';
import { copyTextVerified } from '../utils/clipboard';

interface SkuFinderTabProps {
  onAddProductToQuote: (productId: string, skuId: string, quantity: number) => void;
}

const SKU_QUICK_EXAMPLES = [
  'Colchón Restapedic 1½ plazas',
  '20000287',
  'Base Chaide Tapiz',
  'dreams',
  'almohada back support',
  'protector panal soft',
  'cama montesorri 1.5 plaz',
  'titanium 2.5 plazas',
];

interface ResolvedSapVariantPayload {
  skuId: string; // Kept internally for VTEX pricing, images, and Add to Quote
  referenceId?: string; // Commercial SAP code (RefId)
  medida: string;
  plazas: string;
  dimensiones: string;
  color?: string;
  diseno?: string;
  cuerpos?: string;
  imageUrl?: string;
  link: string;
  inStock: boolean;
  availableQuantity: number;
  pricing: ProductPricing;
}

const SapVariantImage: React.FC<{ imageUrl?: string; alt: string }> = ({ imageUrl, alt }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    imageUrl ? 'loading' : 'error'
  );

  useEffect(() => {
    setStatus(imageUrl ? 'loading' : 'error');
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

function getVariantMeasure(v: SkuGroupVariant): string {
  return v.medida || v.plazas || v.dimensiones || 'Estándar';
}

interface SapProductGroupCardProps {
  group: SkuProductGroup;
  onAddProductToQuote: (productId: string, skuId: string, quantity: number) => void;
  onResolvedStateChange?: (groupKey: string, sapCode: string | null, label: string) => void;
  groupKey: string;
}

const SapProductGroupCard: React.FC<SapProductGroupCardProps> = ({
  group,
  onAddProductToQuote,
  onResolvedStateChange,
  groupKey,
}) => {
  const initialVariant = useMemo(
    () => group.variants.find((v) => v.skuId === group.selectedSkuId) || group.variants[0],
    [group]
  );

  const uniqueMeasures = useMemo(
    () => Array.from(new Set(group.variants.map(getVariantMeasure).filter(Boolean))),
    [group.variants]
  );

  const uniqueColors = useMemo(
    () =>
      Array.from(
        new Set(
          group.variants.map((v) => v.color).filter((c): c is string => Boolean(c))
        )
      ),
    [group.variants]
  );

  const uniqueDesigns = useMemo(
    () =>
      Array.from(
        new Set(
          group.variants.map((v) => v.diseno).filter((d): d is string => Boolean(d))
        )
      ),
    [group.variants]
  );

  const uniqueBodies = useMemo(
    () =>
      Array.from(
        new Set(
          group.variants.map((v) => v.cuerpos).filter((b): b is string => Boolean(b))
        )
      ),
    [group.variants]
  );

  // Any extra dynamic VTEX attribute keys (excluding Medida/Talla/Color/Diseño)
  const extraAttributeKeys = useMemo(() => {
    const ignored = new Set(['medida', 'talla', 'color', 'diseño', 'diseno']);
    const keysMap = new Map<string, Set<string>>();
    for (const v of group.variants) {
      for (const [k, val] of Object.entries(v.attributes || {})) {
        if (ignored.has(k.toLowerCase()) || !val) continue;
        if (!keysMap.has(k)) keysMap.set(k, new Set());
        keysMap.get(k)!.add(val);
      }
    }
    return Array.from(keysMap.entries())
      .filter(([, vals]) => vals.size > 1)
      .map(([key, vals]) => ({ key, values: Array.from(vals) }));
  }, [group.variants]);

  const [selectedMeasure, setSelectedMeasure] = useState<string>(
    initialVariant ? getVariantMeasure(initialVariant) : ''
  );
  const [selectedColor, setSelectedColor] = useState<string>(initialVariant?.color || '');
  const [selectedDesign, setSelectedDesign] = useState<string>(initialVariant?.diseno || '');
  const [selectedBodies, setSelectedBodies] = useState<string>(initialVariant?.cuerpos || '');
  const [selectedExtras, setSelectedExtras] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (initialVariant?.attributes) {
      for (const { key } of extraAttributeKeys) {
        if (initialVariant.attributes[key]) {
          init[key] = initialVariant.attributes[key];
        }
      }
    }
    return init;
  });
  // Tie-breaker SKU when two VTEX variants share identical measure/color/design/bodies (e.g. Restapedic 160X200X028 vs 160X200X027)
  const [preferredDuplicateSkuId, setPreferredDuplicateSkuId] = useState<string | null>(
    initialVariant?.skuId || null
  );

  const [quantity, setQuantity] = useState<number>(Math.max(1, group.quantity || 1));
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [resolvedPayload, setResolvedPayload] = useState<ResolvedSapVariantPayload | null>(() => {
    if (!initialVariant) return null;
    return {
      skuId: initialVariant.skuId,
      referenceId: initialVariant.referenceId,
      medida: initialVariant.medida,
      plazas: initialVariant.plazas,
      dimensiones: initialVariant.dimensiones,
      color: initialVariant.color,
      diseno: initialVariant.diseno,
      cuerpos: initialVariant.cuerpos,
      imageUrl: initialVariant.imageUrl,
      link: initialVariant.link,
      inStock: initialVariant.inStock,
      availableQuantity: initialVariant.availableQuantity,
      pricing: group.initialPricing,
    };
  });

  const [copiedSap, setCopiedSap] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [addedToQuote, setAddedToQuote] = useState(false);

  const requestSeqRef = useRef<number>(0);
  const hasInteractedRef = useRef<boolean>(false);

  // Sync initial selection if group prop changes completely
  useEffect(() => {
    requestSeqRef.current += 1;
    hasInteractedRef.current = false;
    const initV = group.variants.find((v) => v.skuId === group.selectedSkuId) || group.variants[0];
    setSelectedMeasure(initV ? getVariantMeasure(initV) : '');
    setSelectedColor(initV?.color || '');
    setSelectedDesign(initV?.diseno || '');
    setSelectedBodies(initV?.cuerpos || '');
    setPreferredDuplicateSkuId(initV?.skuId || null);
    const initEx: Record<string, string> = {};
    if (initV?.attributes) {
      for (const { key } of extraAttributeKeys) {
        if (initV.attributes[key]) initEx[key] = initV.attributes[key];
      }
    }
    setSelectedExtras(initEx);
    setQuantity(Math.max(1, group.quantity || 1));
    setIsResolving(false);
    setClipboardError(null);
    setCopiedSap(false);
    setResolvedPayload(
      initV
        ? {
            skuId: initV.skuId,
            referenceId: initV.referenceId,
            medida: initV.medida,
            plazas: initV.plazas,
            dimensiones: initV.dimensiones,
            color: initV.color,
            diseno: initV.diseno,
            cuerpos: initV.cuerpos,
            imageUrl: initV.imageUrl,
            link: initV.link,
            inStock: initV.inStock,
            availableQuantity: initV.availableQuantity,
            pricing: group.initialPricing,
          }
        : null
    );
  }, [group, extraAttributeKeys]);

  // All variants matching active selector combination
  const exactMatchedVariants = useMemo(() => {
    return group.variants.filter((v) => {
      if (uniqueMeasures.length > 0 && selectedMeasure && getVariantMeasure(v) !== selectedMeasure) {
        return false;
      }
      if (
        uniqueColors.length > 0 &&
        selectedColor &&
        (v.color || '').toLowerCase() !== selectedColor.toLowerCase()
      ) {
        return false;
      }
      if (
        uniqueDesigns.length > 0 &&
        selectedDesign &&
        (v.diseno || '').toLowerCase() !== selectedDesign.toLowerCase()
      ) {
        return false;
      }
      if (uniqueBodies.length > 0 && selectedBodies && v.cuerpos !== selectedBodies) {
        return false;
      }
      for (const { key } of extraAttributeKeys) {
        const wanted = selectedExtras[key];
        if (wanted && v.attributes?.[key] !== wanted) {
          return false;
        }
      }
      return true;
    });
  }, [
    group.variants,
    uniqueMeasures.length,
    uniqueColors.length,
    uniqueDesigns.length,
    uniqueBodies.length,
    extraAttributeKeys,
    selectedMeasure,
    selectedColor,
    selectedDesign,
    selectedBodies,
    selectedExtras,
  ]);

  const exactMatchedVariant = useMemo(() => {
    if (exactMatchedVariants.length === 0) return undefined;
    if (preferredDuplicateSkuId) {
      const preferred = exactMatchedVariants.find((v) => v.skuId === preferredDuplicateSkuId);
      if (preferred) return preferred;
    }
    return exactMatchedVariants[0];
  }, [exactMatchedVariants, preferredDuplicateSkuId]);

  const isUnavailableCombination = group.variants.length > 0 && !exactMatchedVariant;

  const suggestedValidVariants = useMemo(() => {
    if (!isUnavailableCombination) return [];
    const sameMeasure = group.variants.filter(
      (v) => !selectedMeasure || getVariantMeasure(v) === selectedMeasure
    );
    const sameBodies = selectedBodies
      ? group.variants.filter((v) => v.cuerpos === selectedBodies)
      : [];
    const sameColor = selectedColor
      ? group.variants.filter((v) => v.color?.toLowerCase() === selectedColor.toLowerCase())
      : [];
    const combined = [...sameMeasure, ...sameBodies, ...sameColor];
    const seen = new Set<string>();
    return combined
      .filter((v) => {
        if (seen.has(v.skuId)) return false;
        seen.add(v.skuId);
        return true;
      })
      .slice(0, 4);
  }, [isUnavailableCombination, group.variants, selectedMeasure, selectedBodies, selectedColor]);

  // Verify live whenever user switches variant to a valid SKU
  useEffect(() => {
    if (!hasInteractedRef.current) return;

    const mySeq = ++requestSeqRef.current;

    if (!exactMatchedVariant) {
      setIsResolving(false);
      setResolvedPayload(null);
      return;
    }

    // Clear previous SAP code while verifying newly selected VTEX variant
    setIsResolving(true);
    setResolvedPayload(null);
    setClipboardError(null);
    setCopiedSap(false);

    (async () => {
      try {
        const res = await fetch('/api/sku/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: group.productId,
            skuId: exactMatchedVariant.skuId,
          }),
        });

        if (mySeq !== requestSeqRef.current) return;

        if (res.ok) {
          const verified = await res.json();
          if (mySeq !== requestSeqRef.current) return;
          setResolvedPayload({
            skuId: String(verified.skuId),
            referenceId: verified.referenceId ? String(verified.referenceId).trim() : undefined,
            medida: verified.medida,
            plazas: verified.plazas,
            dimensiones: verified.dimensiones,
            color: verified.color,
            diseno: verified.diseno,
            cuerpos: verified.cuerpos,
            imageUrl: verified.imageUrl,
            link: verified.link,
            inStock: Boolean(verified.inStock),
            availableQuantity: verified.availableQuantity || 0,
            pricing: verified.pricing,
          });
        } else {
          setResolvedPayload({
            skuId: exactMatchedVariant.skuId,
            referenceId: exactMatchedVariant.referenceId,
            medida: exactMatchedVariant.medida,
            plazas: exactMatchedVariant.plazas,
            dimensiones: exactMatchedVariant.dimensiones,
            color: exactMatchedVariant.color,
            diseno: exactMatchedVariant.diseno,
            cuerpos: exactMatchedVariant.cuerpos,
            imageUrl: exactMatchedVariant.imageUrl,
            link: exactMatchedVariant.link,
            inStock: exactMatchedVariant.inStock,
            availableQuantity: exactMatchedVariant.availableQuantity,
            pricing: {
              ...exactMatchedVariant.catalogPricing,
              discountCalculated: exactMatchedVariant.catalogPricing.discountPercent > 0,
              isBlackFriday: false,
              ivaIncluded: true,
              verificationTime: new Date().toLocaleTimeString('es-EC', { hour12: false }),
              officialLink: exactMatchedVariant.link,
            },
          });
        }
      } catch {
        if (mySeq !== requestSeqRef.current) return;
        setResolvedPayload({
          skuId: exactMatchedVariant.skuId,
          referenceId: exactMatchedVariant.referenceId,
          medida: exactMatchedVariant.medida,
          plazas: exactMatchedVariant.plazas,
          dimensiones: exactMatchedVariant.dimensiones,
          color: exactMatchedVariant.color,
          diseno: exactMatchedVariant.diseno,
          cuerpos: exactMatchedVariant.cuerpos,
          imageUrl: exactMatchedVariant.imageUrl,
          link: exactMatchedVariant.link,
          inStock: exactMatchedVariant.inStock,
          availableQuantity: exactMatchedVariant.availableQuantity,
          pricing: {
            ...exactMatchedVariant.catalogPricing,
            discountCalculated: exactMatchedVariant.catalogPricing.discountPercent > 0,
            isBlackFriday: false,
            ivaIncluded: true,
            verificationTime: new Date().toLocaleTimeString('es-EC', { hour12: false }),
            officialLink: exactMatchedVariant.link,
          },
        });
      } finally {
        if (mySeq === requestSeqRef.current) {
          setIsResolving(false);
        }
      }
    })();
  }, [exactMatchedVariant, group.productId]);

  const activeSapCode =
    !isResolving &&
    !isUnavailableCombination &&
    resolvedPayload?.referenceId &&
    String(resolvedPayload.referenceId).trim() !== '0'
      ? String(resolvedPayload.referenceId).trim()
      : null;

  // Notify parent of active resolved SAP code for bulk copy
  useEffect(() => {
    if (!onResolvedStateChange) return;
    if (!activeSapCode || !resolvedPayload) {
      onResolvedStateChange(groupKey, null, group.productName);
    } else {
      const variantParts = [
        resolvedPayload.color ? `Color: ${resolvedPayload.color}` : null,
        resolvedPayload.diseno ? `Diseño: ${resolvedPayload.diseno}` : null,
        resolvedPayload.cuerpos || null,
      ].filter(Boolean);
      const variantText = variantParts.length > 0 ? variantParts.join(' · ') : 'Estándar';
      const measureText = resolvedPayload.medida || resolvedPayload.plazas || 'Estándar';
      onResolvedStateChange(
        groupKey,
        activeSapCode,
        `${group.productName} | ${measureText} | ${variantText} | Cant: ${quantity}`
      );
    }
  }, [groupKey, group.productName, activeSapCode, resolvedPayload, quantity, onResolvedStateChange]);

  const selectMeasure = (m: string) => {
    hasInteractedRef.current = true;
    setPreferredDuplicateSkuId(null);
    setSelectedMeasure(m);
  };
  const selectColor = (c: string) => {
    hasInteractedRef.current = true;
    setPreferredDuplicateSkuId(null);
    setSelectedColor(c);
  };
  const selectDesign = (d: string) => {
    hasInteractedRef.current = true;
    setPreferredDuplicateSkuId(null);
    setSelectedDesign(d);
  };
  const selectBodies = (b: string) => {
    hasInteractedRef.current = true;
    setPreferredDuplicateSkuId(null);
    setSelectedBodies(b);
  };
  const selectExtra = (key: string, val: string) => {
    hasInteractedRef.current = true;
    setPreferredDuplicateSkuId(null);
    setSelectedExtras((prev) => ({ ...prev, [key]: val }));
  };
  const selectDuplicateSku = (skuId: string) => {
    hasInteractedRef.current = true;
    setPreferredDuplicateSkuId(skuId);
  };

  const applySuggestedVariant = (v: SkuGroupVariant) => {
    hasInteractedRef.current = true;
    setPreferredDuplicateSkuId(v.skuId);
    setSelectedMeasure(getVariantMeasure(v));
    if (v.color !== undefined) setSelectedColor(v.color || '');
    if (v.diseno !== undefined) setSelectedDesign(v.diseno || '');
    if (v.cuerpos !== undefined) setSelectedBodies(v.cuerpos || '');
    const nextEx: Record<string, string> = {};
    for (const { key } of extraAttributeKeys) {
      if (v.attributes?.[key]) nextEx[key] = v.attributes[key];
    }
    setSelectedExtras(nextEx);
  };

  const isOptionCompatible = (check: {
    medida?: string;
    color?: string;
    diseno?: string;
    cuerpos?: string;
  }) => {
    return group.variants.some((v) => {
      if (check.medida && getVariantMeasure(v) !== check.medida) return false;
      if (
        !check.medida &&
        uniqueMeasures.length > 0 &&
        selectedMeasure &&
        getVariantMeasure(v) !== selectedMeasure
      ) {
        return false;
      }
      if (check.color && (v.color || '').toLowerCase() !== check.color.toLowerCase()) return false;
      if (
        !check.color &&
        uniqueColors.length > 0 &&
        selectedColor &&
        (v.color || '').toLowerCase() !== selectedColor.toLowerCase()
      ) {
        return false;
      }
      if (check.diseno && (v.diseno || '').toLowerCase() !== check.diseno.toLowerCase()) {
        return false;
      }
      if (
        !check.diseno &&
        uniqueDesigns.length > 0 &&
        selectedDesign &&
        (v.diseno || '').toLowerCase() !== selectedDesign.toLowerCase()
      ) {
        return false;
      }
      if (check.cuerpos && v.cuerpos !== check.cuerpos) return false;
      if (!check.cuerpos && uniqueBodies.length > 0 && selectedBodies && v.cuerpos !== selectedBodies) {
        return false;
      }
      return true;
    });
  };

  const canCopySap = Boolean(activeSapCode);
  const canAddToQuote =
    !isResolving &&
    !isUnavailableCombination &&
    Boolean(resolvedPayload?.skuId) &&
    resolvedPayload?.skuId !== '0';

  const handleCopySapCode = async () => {
    if (!activeSapCode) return;
    setClipboardError(null);
    const result = await copyTextVerified(activeSapCode);
    if (result.ok) {
      setCopiedSap(true);
      setTimeout(() => setCopiedSap(false), 2200);
    } else {
      setClipboardError(result.error || 'No se pudo copiar el código SAP al portapapeles.');
    }
  };

  const handleAdd = () => {
    if (!canAddToQuote || !resolvedPayload) return;
    // Always pass internal VTEX skuId so QuoteItemCard/VTEX pricing uses the exact variant
    onAddProductToQuote(group.productId, resolvedPayload.skuId, quantity);
    setAddedToQuote(true);
    setTimeout(() => setAddedToQuote(false), 2000);
  };

  const activeImageUrl =
    resolvedPayload?.imageUrl ||
    exactMatchedVariant?.imageUrl ||
    group.variants.find((v) => v.imageUrl)?.imageUrl;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
      <div className="flex flex-col md:flex-row items-start justify-between gap-4">
        {/* Left: Official Product Photo + Commercial SAP Reference + Selectors */}
        <div className="flex items-start gap-3.5 w-full flex-1 min-w-0">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-white border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center relative p-1">
            <SapVariantImage
              key={`${group.productId}-${resolvedPayload?.skuId || 'pending'}-${activeImageUrl || 'noimg'}`}
              imageUrl={activeImageUrl}
              alt={group.productName}
            />
            {isResolving && (
              <div className="absolute inset-0 bg-white/75 backdrop-blur-2xs flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              </div>
            )}
          </div>

          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
              <span className="font-semibold text-blue-700 uppercase tracking-wide">
                {group.category}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-500">
                {group.variants.length}{' '}
                {group.variants.length === 1 ? 'variante oficial' : 'variantes oficiales'}
              </span>
              {!isResolving && resolvedPayload && resolvedPayload.inStock === false && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-700 font-semibold">Sin stock reportado</span>
                </>
              )}
            </div>

            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
              {group.productName}
            </h3>

            {/* Quantity selector */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-500">Cantidad:</span>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 disabled:opacity-30 cursor-pointer"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setQuantity(isNaN(val) ? 1 : Math.max(1, val));
                  }}
                  className="w-10 text-center font-bold text-xs text-slate-900 border-x border-slate-200 py-0.5 focus:outline-none tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Primary SAP Code Display & Live Price */}
            <div className="pt-1">
              {isResolving ? (
                <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold px-3 py-1.5 rounded-lg">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  <span>Buscando código SAP…</span>
                </div>
              ) : isUnavailableCombination ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Variante no disponible</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    La combinación seleccionada ({selectedMeasure}
                    {selectedColor ? ` · ${selectedColor}` : ''}
                    {selectedDesign ? ` · ${selectedDesign}` : ''}
                    {selectedBodies ? ` · ${selectedBodies}` : ''}) no existe en Chaide.
                  </p>
                  {suggestedValidVariants.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-[10px] font-bold uppercase text-amber-800">
                        Opciones válidas:
                      </span>
                      {suggestedValidVariants.map((sv) => (
                        <button
                          key={sv.skuId}
                          type="button"
                          onClick={() => applySuggestedVariant(sv)}
                          className="px-2 py-1 rounded-md bg-white hover:bg-blue-50 border border-amber-300 text-slate-800 hover:text-blue-700 text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          {getVariantMeasure(sv)}
                          {sv.color ? ` · ${sv.color}` : ''}
                          {sv.cuerpos ? ` · ${sv.cuerpos}` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : resolvedPayload ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5 flex-wrap tabular-nums">
                    {activeSapCode ? (
                      <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-900 text-xs sm:text-sm font-mono font-bold px-3 py-1 rounded-lg">
                        <span>Código SAP:</span>
                        <span className="text-blue-700 font-black">{activeSapCode}</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold px-3 py-1 rounded-lg">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Código SAP no disponible</span>
                      </div>
                    )}

                    {resolvedPayload.pricing.verified &&
                    resolvedPayload.pricing.promoPriceCents > 0 ? (
                      <div className="flex items-baseline gap-1.5 text-xs">
                        {resolvedPayload.pricing.listPriceCents >
                          resolvedPayload.pricing.promoPriceCents && (
                          <span className="text-slate-400 line-through">
                            {formatCurrencyEC(resolvedPayload.pricing.listPriceCents)}
                          </span>
                        )}
                        <span className="font-extrabold text-slate-900 text-sm">
                          {formatCurrencyEC(resolvedPayload.pricing.promoPriceCents)}
                        </span>
                        {resolvedPayload.pricing.discountPercent > 0 && (
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.2 rounded">
                            -{resolvedPayload.pricing.discountPercent}%
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-700">
                        Sin precio verificable
                      </span>
                    )}
                  </div>

                  {resolvedPayload.dimensiones && (
                    <p className="text-[11px] text-slate-500 font-mono">
                      Dimensiones oficiales: {resolvedPayload.dimensiones}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right: Primary Actions */}
        <div className="flex md:flex-col items-center md:items-end justify-between md:justify-start gap-2 w-full md:w-44 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
          <button
            type="button"
            onClick={handleCopySapCode}
            disabled={!canCopySap}
            className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              copiedSap
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
            }`}
          >
            {copiedSap ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Código copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copiar código SAP</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAddToQuote}
            className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              addedToQuote
                ? 'bg-emerald-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
            }`}
          >
            {addedToQuote ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>¡Agregado!</span>
              </>
            ) : (
              <>
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Agregar a cotización</span>
              </>
            )}
          </button>

          {resolvedPayload?.link && !isResolving && !isUnavailableCombination && (
            <a
              href={resolvedPayload.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-slate-400 hover:text-blue-600 inline-flex items-center gap-1 pt-0.5"
            >
              <span>Ficha oficial</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Clipboard manual fallback when blocked */}
      {clipboardError && activeSapCode && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>{clipboardError} Copia manualmente:</span>
          </div>
          <input
            type="text"
            readOnly
            value={activeSapCode}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs font-bold bg-white border border-amber-300 rounded-md px-2.5 py-1 text-slate-900 w-40"
          />
        </div>
      )}

      {/* Dynamic Variant Selectors (Strict VTEX Attributes) */}
      {(uniqueMeasures.length > 1 ||
        uniqueColors.length > 1 ||
        uniqueDesigns.length > 1 ||
        uniqueBodies.length > 1 ||
        extraAttributeKeys.length > 0 ||
        exactMatchedVariants.length > 1) && (
        <div className="bg-slate-50/90 p-3.5 rounded-xl border border-slate-200/80 space-y-3">
          {uniqueMeasures.length > 1 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Medida
              </label>
              <div className="flex flex-wrap gap-1.5">
                {uniqueMeasures.map((m) => {
                  const isSelected = selectedMeasure === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => selectMeasure(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {uniqueColors.length > 1 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Color
              </label>
              <div className="flex flex-wrap gap-1.5">
                {uniqueColors.map((col) => {
                  const isSelected = selectedColor.toLowerCase() === col.toLowerCase();
                  const compatible = isOptionCompatible({ color: col });
                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => selectColor(col)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : compatible
                          ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                          : 'bg-slate-100 text-slate-400 border border-dashed border-slate-300 hover:text-slate-600'
                      }`}
                    >
                      {col}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {uniqueDesigns.length > 1 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Diseño
              </label>
              <div className="flex flex-wrap gap-1.5">
                {uniqueDesigns.map((des) => {
                  const isSelected = selectedDesign.toLowerCase() === des.toLowerCase();
                  const compatible = isOptionCompatible({ diseno: des });
                  return (
                    <button
                      key={des}
                      type="button"
                      onClick={() => selectDesign(des)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : compatible
                          ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                          : 'bg-slate-100 text-slate-400 border border-dashed border-slate-300 hover:text-slate-600'
                      }`}
                    >
                      {des}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {uniqueBodies.length > 1 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Cuerpos
              </label>
              <div className="flex flex-wrap gap-1.5">
                {uniqueBodies.map((b) => {
                  const isSelected = selectedBodies === b;
                  const compatible = isOptionCompatible({ cuerpos: b });
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => selectBodies(b)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : compatible
                          ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                          : 'bg-slate-100 text-slate-400 border border-dashed border-slate-300 hover:text-slate-600'
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {extraAttributeKeys.map(({ key, values }) => (
            <div key={key}>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                {key}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {values.map((val) => {
                  const isSelected = selectedExtras[key] === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => selectExtra(key, val)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Tie-breaker selector ONLY if VTEX exposes multiple distinct references for the exact same attribute tuple */}
          {exactMatchedVariants.length > 1 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Versión / Presentación SAP
              </label>
              <div className="flex flex-wrap gap-1.5">
                {exactMatchedVariants.map((ev) => {
                  const isSelected = exactMatchedVariant?.skuId === ev.skuId;
                  return (
                    <button
                      key={ev.skuId}
                      type="button"
                      onClick={() => selectDuplicateSku(ev.skuId)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {ev.name}
                      {ev.referenceId ? ` (${ev.referenceId})` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const SkuFinderTab: React.FC<SkuFinderTabProps> = ({ onAddProductToQuote }) => {
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<SkuProductGroup[]>([]);
  const [totalSkusMatched, setTotalSkusMatched] = useState<number>(0);
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>('Todos');
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [copiedBulkKey, setCopiedBulkKey] = useState<string | null>(null);
  const [bulkFallback, setBulkFallback] = useState<{ error: string; value: string } | null>(null);

  // Track currently active resolved SAP reference code per visible group card for bulk copy
  const activeResolvedRef = useRef<Map<string, { sapCode: string; summary: string }>>(new Map());

  const handleResolvedStateChange = React.useCallback(
    (groupKey: string, sapCode: string | null, label: string) => {
      if (!sapCode) {
        activeResolvedRef.current.delete(groupKey);
      } else {
        activeResolvedRef.current.set(groupKey, { sapCode, summary: label });
      }
    },
    []
  );

  const handleSearch = async (textToSearch?: string) => {
    const q = (textToSearch ?? query).trim();
    if (!q) return;

    setIsLoading(true);
    setSearchError(null);
    setSelectedModelFilter('Todos');
    activeResolvedRef.current.clear();

    try {
      const res = await fetch('/api/sku/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      if (!res.ok) {
        throw new Error('No se pudo consultar el catálogo de Chaide.');
      }

      const data = await res.json();
      setGroups(data.groups || []);
      setTotalSkusMatched(data.totalSkusMatched || 0);
    } catch (err: any) {
      console.error('Error in SAP reference search:', err);
      setSearchError(err.message || 'Error buscando código SAP en Chaide.');
    } finally {
      setIsLoading(false);
    }
  };

  const displayedGroups = useMemo(() => {
    if (selectedModelFilter === 'Todos') return groups;
    return groups.filter((g) => g.productId === selectedModelFilter);
  }, [groups, selectedModelFilter]);

  const distinctModels = useMemo(() => {
    const seen = new Set<string>();
    return groups.filter((g) => {
      if (seen.has(g.productId)) return false;
      seen.add(g.productId);
      return true;
    });
  }, [groups]);

  const handleBulkCopy = async (mode: 'details' | 'codes') => {
    setBulkFallback(null);
    const orderedKeys = displayedGroups.map(
      (g, idx) => `${g.productId}-${g.selectedSkuId}-${idx}`
    );
    const activeEntries = orderedKeys
      .map((k) => activeResolvedRef.current.get(k))
      .filter((entry): entry is { sapCode: string; summary: string } => Boolean(entry));

    if (activeEntries.length === 0) return;

    const text =
      mode === 'codes'
        ? activeEntries.map((e) => e.sapCode).join('\n')
        : activeEntries.map((e) => `${e.summary} | Código SAP: ${e.sapCode}`).join('\n');

    const res = await copyTextVerified(text);
    if (res.ok) {
      setCopiedBulkKey(mode);
      setTimeout(() => setCopiedBulkKey(null), 2200);
    } else {
      setBulkFallback({
        error: res.error || 'No se pudo copiar al portapapeles.',
        value: text,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Input Box */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <label
            htmlFor="sap-search-input"
            className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2"
          >
            <Search className="w-4 h-4 text-blue-600" />
            <span>Buscar producto o código SAP (Ingreso de Pedidos)</span>
          </label>
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setGroups([]);
                setTotalSkusMatched(0);
                setSearchError(null);
                activeResolvedRef.current.clear();
              }}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpiar</span>
            </button>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            id="sap-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca por nombre, abreviatura, medida, color, modelo o código SAP... Ej: Colchón Restapedic 1½ plazas, 20000287"
            className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white"
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Buscando...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Buscar código SAP</span>
              </>
            )}
          </button>
        </form>

        {/* Quick query chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-slate-500 font-medium whitespace-nowrap text-[11px] pr-1">
            Consultas rápidas:
          </span>
          {SKU_QUICK_EXAMPLES.map((ex, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQuery(ex);
                handleSearch(ex);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-[11px] font-medium whitespace-nowrap border border-slate-200/70 transition-colors cursor-pointer"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {searchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{searchError}</span>
        </div>
      )}

      {/* Results Header + Model Filter Strip */}
      {groups.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-700 tabular-nums">
              {displayedGroups.length}{' '}
              {displayedGroups.length === 1 ? 'producto encontrado' : 'productos encontrados'} ·{' '}
              {totalSkusMatched} variantes totales indexadas
            </p>

            {displayedGroups.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleBulkCopy('details')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    copiedBulkKey === 'details'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  {copiedBulkKey === 'details' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Códigos copiados</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar todos los códigos</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkCopy('codes')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                    copiedBulkKey === 'codes'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
                  }`}
                >
                  {copiedBulkKey === 'codes' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Códigos copiados</span>
                    </>
                  ) : (
                    <>
                      <Hash className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copiar solo códigos</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {bulkFallback && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 space-y-1.5">
              <p className="font-semibold">{bulkFallback.error}</p>
              <textarea
                readOnly
                value={bulkFallback.value}
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full font-mono text-[11px] bg-white border border-amber-300 rounded px-2 py-1"
              />
            </div>
          )}

          {/* Distinct models selector when >1 product model matches (e.g. Golden Dreams series) */}
          {distinctModels.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-500 font-semibold whitespace-nowrap flex items-center gap-1 pr-1">
                <Layers className="w-3 h-3 text-blue-600" />
                <span>Modelos:</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedModelFilter('Todos')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                  selectedModelFilter === 'Todos'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todos ({distinctModels.length})
              </button>
              {distinctModels.map((m) => (
                <button
                  key={m.productId}
                  type="button"
                  onClick={() => setSelectedModelFilter(m.productId)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                    selectedModelFilter === m.productId
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {m.productName} ({m.variants.length})
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grouped Product Cards */}
      <div className="space-y-3">
        {displayedGroups.map((group, idx) => {
          const gKey = `${group.productId}-${group.selectedSkuId}-${idx}`;
          return (
            <SapProductGroupCard
              key={gKey}
              groupKey={gKey}
              group={group}
              onAddProductToQuote={onAddProductToQuote}
              onResolvedStateChange={handleResolvedStateChange}
            />
          );
        })}
      </div>

      {groups.length === 0 && !isLoading && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center space-y-2">
          <Search className="w-8 h-8 text-slate-400 mx-auto stroke-1" />
          <p className="text-sm font-bold text-slate-800">
            Buscador de códigos SAP para ingreso de pedidos
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Busca por modelo, abreviatura, medida, color, diseño o código SAP para consultar la referencia comercial oficial de cada variante en Chaide y agregarla directo a la cotización.
          </p>
        </div>
      )}
    </div>
  );
};

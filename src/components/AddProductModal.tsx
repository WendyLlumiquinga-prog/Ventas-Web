import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  X,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Plus,
  Minus,
  PlusCircle,
  Image as ImageIcon,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import {
  CatalogSuggestionItem,
  ProductPricing,
  QuoteItem,
  SkuGroupVariant,
  SkuProductGroup,
} from '../types';
import { useCatalogSuggestions } from '../hooks/useCatalogSuggestions';
import { CatalogSuggestionsPanel } from './CatalogSuggestionsPanel';
import { formatCurrencyEC } from '../utils/pricing';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingItems: QuoteItem[];
  onAddVerifiedItem: (item: QuoteItem) => void;
}

const MODAL_QUICK_CHIPS = [
  'Continental',
  'Titanium',
  'Restapedic',
  'Base Chaide Tapiz',
  'Golden Dreams',
  'Almohada',
];

function getVariantMeasure(v: SkuGroupVariant): string {
  return v.medida || v.plazas || v.dimensiones || 'Estándar';
}

const VariantPreviewThumb: React.FC<{ imageUrl?: string; alt: string }> = ({ imageUrl, alt }) => {
  const imgRef = useRef<HTMLImageElement>(null);
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
        <span className="text-[9px] font-medium leading-tight">Sin imagen</span>
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
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        className={`w-full h-full object-contain object-center transition-opacity duration-150 ${
          status === 'loaded' ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </>
  );
};

export const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
  existingItems,
  onAddVerifiedItem,
}) => {
  const [step, setStep] = useState<'search' | 'variant'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  // Selected product & variant state
  const [isLoadingGroup, setIsLoadingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<SkuProductGroup | null>(null);
  const [selectedMeasure, setSelectedMeasure] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedDesign, setSelectedDesign] = useState<string>('');
  const [selectedBodies, setSelectedBodies] = useState<string>('');
  const [selectedExtras, setSelectedExtras] = useState<Record<string, string>>({});
  const [preferredDuplicateSkuId, setPreferredDuplicateSkuId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);

  const [isVerifyingSku, setIsVerifyingSku] = useState(false);
  const [verifiedPricing, setVerifiedPricing] = useState<ProductPricing | null>(null);
  const [verifiedImageUrl, setVerifiedImageUrl] = useState<string | undefined>(undefined);
  const [verifiedInStock, setVerifiedInStock] = useState<boolean>(true);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const groupRequestSeqRef = useRef<number>(0);
  const verifySeqRef = useRef<number>(0);
  const hasInteractedVariantRef = useRef<boolean>(false);

  const {
    suggestionData,
    exactMatches,
    relatedMatches,
    totalDisplayed,
    selectedCategory,
    setSelectedCategory,
    loadMore,
    resetSuggestions,
    isLoading: isSuggestionsLoading,
  } = useCatalogSuggestions({
    query: searchQuery,
    enabled: isOpen && step === 'search',
    debounceMs: 140,
    initialLimit: 12,
    skipUrlsAndMultiline: true,
  });

  const flatSuggestions = useMemo(
    () => [...exactMatches, ...relatedMatches],
    [exactMatches, relatedMatches]
  );

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [totalDisplayed, suggestionData]);

  // Reset modal & auto-focus input on open
  useEffect(() => {
    if (!isOpen) return;
    setStep('search');
    setSearchQuery('');
    setSelectedGroup(null);
    setGroupError(null);
    setAddError(null);
    setQuantity(1);
    setHighlightedIndex(-1);
    resetSuggestions();

    const t = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [isOpen, resetSuggestions]);

  // Global Escape handler while modal open
  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, onClose]);

  const initializeVariantSelectors = (group: SkuProductGroup) => {
    const initV =
      group.variants.find((v) => v.skuId === group.selectedSkuId) || group.variants[0];
    hasInteractedVariantRef.current = false;
    setSelectedMeasure(initV ? getVariantMeasure(initV) : '');
    setSelectedColor(initV?.color || '');
    setSelectedDesign(initV?.diseno || '');
    setSelectedBodies(initV?.cuerpos || '');
    setPreferredDuplicateSkuId(initV?.skuId || null);

    const ignored = new Set(['medida', 'talla', 'color', 'diseño', 'diseno']);
    const initExtras: Record<string, string> = {};
    if (initV?.attributes) {
      for (const [k, val] of Object.entries(initV.attributes)) {
        if (!ignored.has(k.toLowerCase()) && val) {
          initExtras[k] = val;
        }
      }
    }
    setSelectedExtras(initExtras);
    setQuantity(1);
    setVerifiedPricing(group.initialPricing);
    setVerifiedImageUrl(initV?.imageUrl);
    setVerifiedInStock(initV?.inStock ?? true);
    setAddError(null);
  };

  const handleSelectSuggestion = async (suggestion: CatalogSuggestionItem) => {
    const reqSeq = ++groupRequestSeqRef.current;
    setStep('variant');
    setIsLoadingGroup(true);
    setGroupError(null);
    setSelectedGroup(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.set('hint', searchQuery.trim());
      }
      if (suggestion.defaultSkuId) {
        params.set('skuId', suggestion.defaultSkuId);
      }
      const res = await fetch(
        `/api/catalog/product/${encodeURIComponent(suggestion.productId)}/group?${params.toString()}`
      );
      if (reqSeq !== groupRequestSeqRef.current) return;

      if (!res.ok) {
        throw new Error('No se pudieron cargar las variantes del producto seleccionado.');
      }

      const group: SkuProductGroup = await res.json();
      if (reqSeq !== groupRequestSeqRef.current) return;

      setSelectedGroup(group);
      initializeVariantSelectors(group);
    } catch (err: any) {
      if (reqSeq !== groupRequestSeqRef.current) return;
      setGroupError(err?.message || 'Error al cargar variantes oficiales.');
    } finally {
      if (reqSeq === groupRequestSeqRef.current) {
        setIsLoadingGroup(false);
      }
    }
  };

  const uniqueMeasures = useMemo(
    () =>
      selectedGroup
        ? Array.from(new Set(selectedGroup.variants.map(getVariantMeasure).filter(Boolean)))
        : [],
    [selectedGroup]
  );

  const uniqueColors = useMemo(
    () =>
      selectedGroup
        ? Array.from(
            new Set(
              selectedGroup.variants
                .map((v) => v.color)
                .filter((c): c is string => Boolean(c))
            )
          )
        : [],
    [selectedGroup]
  );

  const uniqueDesigns = useMemo(
    () =>
      selectedGroup
        ? Array.from(
            new Set(
              selectedGroup.variants
                .map((v) => v.diseno)
                .filter((d): d is string => Boolean(d))
            )
          )
        : [],
    [selectedGroup]
  );

  const uniqueBodies = useMemo(
    () =>
      selectedGroup
        ? Array.from(
            new Set(
              selectedGroup.variants
                .map((v) => v.cuerpos)
                .filter((b): b is string => Boolean(b))
            )
          )
        : [],
    [selectedGroup]
  );

  const extraAttributeKeys = useMemo(() => {
    if (!selectedGroup) return [];
    const ignored = new Set(['medida', 'talla', 'color', 'diseño', 'diseno']);
    const keysMap = new Map<string, Set<string>>();
    for (const v of selectedGroup.variants) {
      for (const [k, val] of Object.entries(v.attributes || {})) {
        if (ignored.has(k.toLowerCase()) || !val) continue;
        if (!keysMap.has(k)) keysMap.set(k, new Set());
        keysMap.get(k)!.add(val);
      }
    }
    return Array.from(keysMap.entries())
      .filter(([, vals]) => vals.size > 1)
      .map(([key, vals]) => ({ key, values: Array.from(vals) }));
  }, [selectedGroup]);

  const exactMatchedVariants = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.variants.filter((v) => {
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
        if (wanted && v.attributes?.[key] !== wanted) return false;
      }
      return true;
    });
  }, [
    selectedGroup,
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
      const match = exactMatchedVariants.find((v) => v.skuId === preferredDuplicateSkuId);
      if (match) return match;
    }
    return exactMatchedVariants[0];
  }, [exactMatchedVariants, preferredDuplicateSkuId]);

  const isUnavailableCombination =
    Boolean(selectedGroup) &&
    (selectedGroup?.variants.length || 0) > 0 &&
    !exactMatchedVariant;

  const suggestedValidVariants = useMemo(() => {
    if (!selectedGroup || !isUnavailableCombination) return [];
    const sameMeasure = selectedGroup.variants.filter(
      (v) => !selectedMeasure || getVariantMeasure(v) === selectedMeasure
    );
    const sameColor = selectedColor
      ? selectedGroup.variants.filter(
          (v) => v.color?.toLowerCase() === selectedColor.toLowerCase()
        )
      : [];
    const sameBodies = selectedBodies
      ? selectedGroup.variants.filter((v) => v.cuerpos === selectedBodies)
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
  }, [selectedGroup, isUnavailableCombination, selectedMeasure, selectedBodies, selectedColor]);

  // Verify live price & photo when user changes variant attributes
  useEffect(() => {
    if (!selectedGroup || !hasInteractedVariantRef.current) return;
    const seq = ++verifySeqRef.current;

    if (!exactMatchedVariant) {
      setIsVerifyingSku(false);
      return;
    }

    setIsVerifyingSku(true);
    setAddError(null);

    (async () => {
      try {
        const res = await fetch('/api/sku/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: selectedGroup.productId,
            skuId: exactMatchedVariant.skuId,
          }),
        });
        if (seq !== verifySeqRef.current) return;
        if (res.ok) {
          const verified = await res.json();
          if (seq !== verifySeqRef.current) return;
          setVerifiedPricing(verified.pricing);
          setVerifiedImageUrl(verified.imageUrl || exactMatchedVariant.imageUrl);
          setVerifiedInStock(Boolean(verified.inStock));
        }
      } catch {
        if (seq !== verifySeqRef.current) return;
        setVerifiedImageUrl(exactMatchedVariant.imageUrl);
        setVerifiedInStock(exactMatchedVariant.inStock);
      } finally {
        if (seq === verifySeqRef.current) {
          setIsVerifyingSku(false);
        }
      }
    })();
  }, [exactMatchedVariant, selectedGroup]);

  const isOptionCompatible = (check: {
    medida?: string;
    color?: string;
    diseno?: string;
    cuerpos?: string;
  }) => {
    if (!selectedGroup) return false;
    return selectedGroup.variants.some((v) => {
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
      if (
        !check.cuerpos &&
        uniqueBodies.length > 0 &&
        selectedBodies &&
        v.cuerpos !== selectedBodies
      ) {
        return false;
      }
      return true;
    });
  };

  const applySuggestedVariant = (v: SkuGroupVariant) => {
    hasInteractedVariantRef.current = true;
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

  // Detect if exact productId + skuId already exists in current quote
  const duplicateInQuote = useMemo(() => {
    if (!selectedGroup || !exactMatchedVariant) return undefined;
    return existingItems.find(
      (it) =>
        String(it.productId) === String(selectedGroup.productId) &&
        String(it.skuId) === String(exactMatchedVariant.skuId)
    );
  }, [existingItems, selectedGroup, exactMatchedVariant]);

  const handleConfirmAdd = async () => {
    if (!selectedGroup || !exactMatchedVariant || isVerifyingSku || isAdding) return;

    setIsAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/api/quote/verify-variant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedGroup.productId,
          skuId: exactMatchedVariant.skuId,
          quantity: Math.max(1, quantity),
        }),
      });

      if (!res.ok) {
        throw new Error('No se pudo verificar el producto en Chaide.');
      }

      const verifiedQuoteItem: QuoteItem = await res.json();
      onAddVerifiedItem(verifiedQuoteItem);
      onClose();
    } catch (err: any) {
      setAddError(err?.message || 'Error al agregar producto a la cotización.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % flatSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? flatSuggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0 && flatSuggestions[highlightedIndex]) {
      e.preventDefault();
      handleSelectSuggestion(flatSuggestions[highlightedIndex]);
    }
  };

  if (!isOpen) return null;

  const activeImageUrl =
    verifiedImageUrl ||
    exactMatchedVariant?.imageUrl ||
    selectedGroup?.variants.find((v) => v.imageUrl)?.imageUrl;

  const activePricing = verifiedPricing || selectedGroup?.initialPricing;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/55 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Agregar otro producto a la cotización"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {step === 'variant' && (
              <button
                type="button"
                onClick={() => {
                  setStep('search');
                  setTimeout(() => searchInputRef.current?.focus(), 40);
                }}
                className="p-1 rounded-lg hover:bg-slate-200/70 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                title="Volver a resultados"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <Search className="w-4 h-4 text-blue-600 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              {step === 'search'
                ? 'Agregar otro producto del catálogo Chaide'
                : 'Seleccionar variante y cantidad'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {step === 'search' ? (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Escribe el modelo, medida o categoría (ej: contin, titanium, base tapiz, dreams...)"
                  className="w-full pl-9 pr-20 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      resetSuggestions();
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Limpiar</span>
                  </button>
                )}
              </div>

              {searchQuery.trim().length < 2 ? (
                <div className="space-y-2.5 py-2">
                  <p className="text-xs text-slate-500">
                    Búsqueda inteligente en tiempo real sobre todo el catálogo oficial de Chaide. Puedes usar ↑ ↓ y Enter para seleccionar rápido.
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold text-slate-400 mr-1">
                      Búsquedas frecuentes:
                    </span>
                    {MODAL_QUICK_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          setSearchQuery(chip);
                          searchInputRef.current?.focus();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-medium border border-slate-200/70 transition-colors cursor-pointer"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <CatalogSuggestionsPanel
                  suggestionData={suggestionData}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  onSelectItem={handleSelectSuggestion}
                  onLoadMore={loadMore}
                  highlightedIndex={highlightedIndex}
                  onHighlightIndex={setHighlightedIndex}
                  actionLabel="Elegir variante"
                  isLoading={isSuggestionsLoading}
                  query={searchQuery}
                  variant="inline"
                  maxListHeightClass="max-h-[380px]"
                />
              )}
            </>
          ) : isLoadingGroup ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-slate-500">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              <p className="text-xs font-medium">
                Cargando variantes oficiales y precios en Chaide...
              </p>
            </div>
          ) : groupError ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{groupError}</span>
            </div>
          ) : selectedGroup ? (
            <div className="space-y-4">
              {/* Product Summary Header */}
              <div className="flex items-start gap-3.5 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-white border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center relative p-1">
                  <VariantPreviewThumb
                    key={`${selectedGroup.productId}-${exactMatchedVariant?.skuId || 'none'}-${activeImageUrl || 'noimg'}`}
                    imageUrl={activeImageUrl}
                    alt={selectedGroup.productName}
                  />
                  {isVerifyingSku && (
                    <div className="absolute inset-0 bg-white/75 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                    <span className="font-bold uppercase tracking-wide text-blue-700">
                      {selectedGroup.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {selectedGroup.variants.length}{' '}
                      {selectedGroup.variants.length === 1
                        ? 'variante oficial'
                        : 'variantes oficiales'}
                    </span>
                    {!verifiedInStock && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-700 font-semibold">Sin stock reportado</span>
                      </>
                    )}
                  </div>

                  <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    {selectedGroup.productName}
                  </h4>

                  {isUnavailableCombination ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-1.5">
                      <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Combinación no disponible</span>
                      </p>
                      {suggestedValidVariants.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold uppercase text-amber-800">
                            Opciones válidas:
                          </span>
                          {suggestedValidVariants.map((sv) => (
                            <button
                              key={sv.skuId}
                              type="button"
                              onClick={() => applySuggestedVariant(sv)}
                              className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 border border-amber-300 text-slate-800 text-[11px] font-semibold cursor-pointer"
                            >
                              {getVariantMeasure(sv)}
                              {sv.color ? ` · ${sv.color}` : ''}
                              {sv.cuerpos ? ` · ${sv.cuerpos}` : ''}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : activePricing?.verified && activePricing.promoPriceCents > 0 ? (
                    <div className="flex items-baseline gap-2 flex-wrap tabular-nums pt-0.5">
                      {activePricing.listPriceCents > activePricing.promoPriceCents && (
                        <span className="text-xs text-slate-400 line-through">
                          {formatCurrencyEC(activePricing.listPriceCents)}
                        </span>
                      )}
                      <span className="text-base font-extrabold text-slate-900">
                        {formatCurrencyEC(activePricing.promoPriceCents)}
                      </span>
                      {activePricing.discountPercent > 0 && (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                          -{activePricing.discountPercent}%
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-amber-700">
                      Precio pendiente de verificación en Chaide
                    </p>
                  )}

                  {exactMatchedVariant?.dimensiones && !isUnavailableCombination && (
                    <p className="text-[11px] text-slate-500">
                      Dimensiones: {exactMatchedVariant.dimensiones}
                    </p>
                  )}
                </div>
              </div>

              {/* Duplicate SKU Info Banner */}
              {duplicateInQuote && !isUnavailableCombination && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Esta variante ya está en tu cotización (cantidad actual:{' '}
                    <strong>{duplicateInQuote.quantity}</strong>). Al confirmar se sumará{' '}
                    <strong>{quantity}</strong> para evitar filas duplicadas.
                  </span>
                </div>
              )}

              {/* Variant Selectors */}
              {(uniqueMeasures.length > 0 ||
                uniqueColors.length > 0 ||
                uniqueDesigns.length > 0 ||
                uniqueBodies.length > 0 ||
                extraAttributeKeys.length > 0 ||
                exactMatchedVariants.length > 1) && (
                <div className="bg-slate-50/90 p-3.5 rounded-xl border border-slate-200/80 space-y-3">
                  {uniqueMeasures.length > 0 && (
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                        Medida
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {uniqueMeasures.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              hasInteractedVariantRef.current = true;
                              setPreferredDuplicateSkuId(null);
                              setSelectedMeasure(m);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              selectedMeasure === m
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {uniqueColors.length > 0 && (
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
                              onClick={() => {
                                hasInteractedVariantRef.current = true;
                                setPreferredDuplicateSkuId(null);
                                setSelectedColor(col);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : compatible
                                  ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                                  : 'bg-slate-100 text-slate-400 border border-dashed border-slate-300'
                              }`}
                            >
                              {col}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {uniqueDesigns.length > 0 && (
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
                              onClick={() => {
                                hasInteractedVariantRef.current = true;
                                setPreferredDuplicateSkuId(null);
                                setSelectedDesign(des);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : compatible
                                  ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                                  : 'bg-slate-100 text-slate-400 border border-dashed border-slate-300'
                              }`}
                            >
                              {des}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {uniqueBodies.length > 0 && (
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
                              onClick={() => {
                                hasInteractedVariantRef.current = true;
                                setPreferredDuplicateSkuId(null);
                                setSelectedBodies(b);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : compatible
                                  ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                                  : 'bg-slate-100 text-slate-400 border border-dashed border-slate-300'
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
                        {values.map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              hasInteractedVariantRef.current = true;
                              setPreferredDuplicateSkuId(null);
                              setSelectedExtras((prev) => ({ ...prev, [key]: val }));
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              selectedExtras[key] === val
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {exactMatchedVariants.length > 1 && (
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                        Versión / Presentación
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {exactMatchedVariants.map((ev) => (
                          <button
                            key={ev.skuId}
                            type="button"
                            onClick={() => {
                              hasInteractedVariantRef.current = true;
                              setPreferredDuplicateSkuId(ev.skuId);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              exactMatchedVariant?.skuId === ev.skuId
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {ev.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Quantity & Error Row */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-semibold text-slate-600">Cantidad a agregar:</span>
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="px-2.5 py-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 disabled:opacity-30 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setQuantity(isNaN(val) ? 1 : Math.max(1, val));
                    }}
                    className="w-12 text-center font-bold text-xs text-slate-900 border-x border-slate-200 py-1.5 focus:outline-none tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="px-2.5 py-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {addError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{addError}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2 shrink-0">
          {step === 'variant' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep('search');
                  setTimeout(() => searchInputRef.current?.focus(), 40);
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                ← Cambiar producto
              </button>
              <button
                type="button"
                onClick={handleConfirmAdd}
                disabled={
                  !selectedGroup ||
                  !exactMatchedVariant ||
                  isUnavailableCombination ||
                  isVerifyingSku ||
                  isAdding
                }
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {isAdding ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Agregando...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>
                      {duplicateInQuote ? 'Sumar a cotización' : 'Agregar a cotización'}
                    </span>
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-between text-[11px] text-slate-400">
              <span>Los productos actuales de tu cotización se conservarán intactos.</span>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

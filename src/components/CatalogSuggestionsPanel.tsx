import React, { useEffect, useRef } from 'react';
import { Layers, ArrowRight, ChevronDown, Loader2, SearchX } from 'lucide-react';
import { CatalogSuggestionItem, CatalogSuggestionsResponse } from '../types';

interface CatalogSuggestionsPanelProps {
  suggestionData: CatalogSuggestionsResponse | null;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  onSelectItem: (item: CatalogSuggestionItem) => void;
  onLoadMore: () => void;
  onClose?: () => void;
  highlightedIndex?: number;
  onHighlightIndex?: (index: number) => void;
  actionLabel?: string;
  isLoading?: boolean;
  query?: string;
  maxListHeightClass?: string;
  variant?: 'popover' | 'inline';
}

export const CatalogSuggestionsPanel: React.FC<CatalogSuggestionsPanelProps> = ({
  suggestionData,
  selectedCategory,
  onSelectCategory,
  onSelectItem,
  onLoadMore,
  onClose,
  highlightedIndex = -1,
  onHighlightIndex,
  actionLabel = 'Cotizar',
  isLoading = false,
  query = '',
  maxListHeightClass = 'max-h-[340px]',
  variant = 'popover',
}) => {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const exactMatches = suggestionData?.exactMatches || [];
  const relatedMatches = suggestionData?.relatedMatches || [];
  const availableCategories = suggestionData?.availableCategories || [];
  const totalAvailable = (suggestionData?.totalExact || 0) + (suggestionData?.totalRelated || 0);
  const totalDisplayed = exactMatches.length + relatedMatches.length;
  const hasMoreResults = totalAvailable > totalDisplayed;

  // Scroll highlighted keyboard item into view smoothly
  useEffect(() => {
    if (highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const renderRow = (s: CatalogSuggestionItem, flatIndex: number) => {
    const isHighlighted = flatIndex === highlightedIndex;
    return (
      <button
        key={s.productId}
        ref={(el) => {
          itemRefs.current[flatIndex] = el;
        }}
        type="button"
        onMouseEnter={() => onHighlightIndex?.(flatIndex)}
        onClick={() => onSelectItem(s)}
        className={`w-full text-left px-3 py-2.5 transition-colors flex items-center justify-between gap-3 cursor-pointer group ${
          isHighlighted ? 'bg-blue-50/90' : 'hover:bg-blue-50/60 bg-white'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {s.image ? (
            <img
              src={s.image}
              alt={s.productName}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-200 shrink-0 p-0.5"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h4
                className={`text-xs font-bold truncate ${
                  isHighlighted
                    ? 'text-blue-700'
                    : 'text-slate-900 group-hover:text-blue-700'
                }`}
              >
                {s.productName}
              </h4>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate mt-0.5">
              <span className="font-medium text-slate-600">{s.category}</span>
              {s.sizes.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">
                    {s.sizes.slice(0, 3).join(', ')}
                    {s.sizes.length > 3 ? ` (+${s.sizes.length - 3})` : ''}
                  </span>
                </>
              )}
              {s.colors.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {s.colors.length} {s.colors.length === 1 ? 'color' : 'colores'}
                  </span>
                </>
              )}
              {s.designs.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {s.designs.length} {s.designs.length === 1 ? 'diseño' : 'diseños'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <span
          className={`shrink-0 text-xs font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
            isHighlighted
              ? 'bg-blue-600 text-white'
              : 'text-blue-600 group-hover:text-blue-700 bg-blue-50 group-hover:bg-blue-100'
          }`}
        >
          <span>{actionLabel}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </button>
    );
  };

  if (variant === 'inline' && query.trim().length >= 2 && totalDisplayed === 0) {
    if (isLoading) {
      return (
        <div className="border border-slate-200 rounded-xl bg-slate-50/70 p-6 text-center flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          <span>Buscando en el catálogo oficial de Chaide...</span>
        </div>
      );
    }

    return (
      <div className="border border-dashed border-slate-200 rounded-xl bg-slate-50/50 p-6 text-center space-y-1.5">
        <SearchX className="w-5 h-5 text-slate-400 mx-auto" />
        <p className="text-xs font-semibold text-slate-700">
          No encontramos coincidencias para «{query.trim()}»
        </p>
        <p className="text-[11px] text-slate-400">
          Prueba con otro modelo (ej. Continental, Titanium, Restapedic, Dreams o Base Tapiz).
        </p>
      </div>
    );
  }

  if (totalDisplayed === 0) return null;

  return (
    <div
      className={
        variant === 'popover'
          ? 'bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col'
          : 'bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col'
      }
    >
      {/* Top header + Category Filter bar */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
          <span className="flex items-center gap-1.5">
            <span>
              Catálogo Chaide ({totalAvailable}{' '}
              {totalAvailable === 1 ? 'resultado' : 'resultados'})
            </span>
            {isLoading && <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-[11px] font-medium cursor-pointer"
            >
              Cerrar
            </button>
          )}
        </div>

        {availableCategories.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {['Todos', ...availableCategories].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => onSelectCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable Results Separated into Exact vs Related */}
      <div className={`overflow-y-auto divide-y divide-slate-100 ${maxListHeightClass}`}>
        {exactMatches.length > 0 && (
          <>
            <div className="px-3 py-1 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-blue-700 sticky top-0 z-10">
              Coincidencias directas ({suggestionData?.totalExact || exactMatches.length})
            </div>
            {exactMatches.map((item, idx) => renderRow(item, idx))}
          </>
        )}

        {relatedMatches.length > 0 && (
          <>
            <div className="px-3 py-1 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky top-0 z-10">
              Resultados relacionados ({suggestionData?.totalRelated || relatedMatches.length})
            </div>
            {relatedMatches.map((item, idx) => renderRow(item, exactMatches.length + idx))}
          </>
        )}
      </div>

      {/* Expand button: never permanently truncated at 5 */}
      {hasMoreResults && (
        <button
          type="button"
          onClick={onLoadMore}
          className="w-full py-2 bg-slate-50 hover:bg-blue-50 text-blue-700 text-xs font-semibold border-t border-slate-200 flex items-center justify-center gap-1 transition-colors shrink-0 cursor-pointer"
        >
          <span>Ver más resultados ({totalAvailable - totalDisplayed} adicionales)</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

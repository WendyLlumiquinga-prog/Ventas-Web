import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, RotateCcw } from 'lucide-react';
import { CatalogSuggestionItem } from '../types';
import { useCatalogSuggestions } from '../hooks/useCatalogSuggestions';
import { CatalogSuggestionsPanel } from './CatalogSuggestionsPanel';

interface QuoteInputFormProps {
  inputQuery: string;
  setInputQuery: (val: string) => void;
  onConsultarPrecios: (overrideQuery?: string) => void;
  isLoading: boolean;
}

const QUICK_EXAMPLES = [
  {
    label: 'Cama Montessori 1.5 plazas',
    query: 'cama montesorri 1.5 plaz',
  },
  {
    label: 'Titanium 2.5 plazas',
    query: 'titaniun 2.5 plazas',
  },
  {
    label: 'Continental FB 2 plazas',
    query: 'fb 2 pl',
  },
  {
    label: '2 FB + 1 Base Tapiz Chocolate',
    query: '2 FB de 2 plazas y 1 Base Chaide Tapiz chocolate de 2 plazas, un cuerpo',
  },
  {
    label: 'Continental Tradicional Nueva Gen 2 pl',
    query: 'Continental Tradicional de Lujo Nueva Generación, 2 plazas',
  },
  {
    label: 'Con entrega a domicilio',
    query: '1 Colchón Restapedic de 2 plazas con entrega a domicilio',
  },
];

export const QuoteInputForm: React.FC<QuoteInputFormProps> = ({
  inputQuery,
  setInputQuery,
  onConsultarPrecios,
  isLoading,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    query: inputQuery,
    enabled: true,
    debounceMs: 160,
    initialLimit: 12,
    skipUrlsAndMultiline: true,
  });

  const flatSuggestions = useMemo(
    () => [...exactMatches, ...relatedMatches],
    [exactMatches, relatedMatches]
  );

  // Open dropdown automatically when fresh suggestions arrive
  useEffect(() => {
    setShowSuggestions(totalDisplayed > 0);
    setHighlightedIndex(-1);
  }, [totalDisplayed, suggestionData]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isLoading) return;
    setShowSuggestions(false);
    onConsultarPrecios();
  };

  const handleSelectSuggestion = (s: CatalogSuggestionItem) => {
    const newQuery = s.productName;
    setInputQuery(newQuery);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    onConsultarPrecios(newQuery);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setShowSuggestions(false);
      onConsultarPrecios();
      return;
    }

    if (!showSuggestions || flatSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % flatSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? flatSuggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0 && flatSuggestions[highlightedIndex]) {
      e.preventDefault();
      handleSelectSuggestion(flatSuggestions[highlightedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSuggestions(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5 relative">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between">
          <label
            htmlFor="quote-input"
            className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-2"
          >
            <Search className="w-4 h-4 text-blue-600" />
            <span>¿Qué quieres cotizar?</span>
          </label>
          {inputQuery && (
            <button
              type="button"
              onClick={() => {
                setInputQuery('');
                resetSuggestions();
                setShowSuggestions(false);
              }}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 font-medium cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpiar</span>
            </button>
          )}
        </div>

        <div className="relative" ref={dropdownRef}>
          <textarea
            id="quote-input"
            rows={3}
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onFocus={() => {
              if (totalDisplayed > 0) setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Escribe uno o varios productos, modelos, colores o pega enlaces de www.chaide.com...&#10;Ej: dreams, cama montesorri 1.5 plaz, almohada back support negro, 2 fb de 2 plazas..."
            className="w-full text-sm text-slate-800 placeholder:text-slate-400 bg-slate-50/70 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all resize-y"
          />

          {/* Ranked Real-Time Suggestions Popover (shared engine) */}
          {showSuggestions && totalDisplayed > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30">
              <CatalogSuggestionsPanel
                suggestionData={suggestionData}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onSelectItem={handleSelectSuggestion}
                onLoadMore={loadMore}
                onClose={() => setShowSuggestions(false)}
                highlightedIndex={highlightedIndex}
                onHighlightIndex={setHighlightedIndex}
                actionLabel="Cotizar"
                isLoading={isSuggestionsLoading}
                query={inputQuery}
                variant="popover"
                maxListHeightClass="max-h-[340px]"
              />
            </div>
          )}
        </div>

        {/* Quick Example Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-slate-500 font-medium whitespace-nowrap text-[11px] pr-1">
            Ejemplos:
          </span>
          {QUICK_EXAMPLES.map((ex, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setInputQuery(ex.query);
                setShowSuggestions(false);
                onConsultarPrecios(ex.query);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-[11px] font-medium whitespace-nowrap border border-slate-200/70 transition-colors cursor-pointer"
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Presiona <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border text-slate-600 font-mono text-[10px]">Ctrl+Enter</kbd> para cotizar
          </p>
          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
              isLoading || !inputQuery.trim()
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-[0.98] cursor-pointer'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Consultando precios en Chaide...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Consultar precios</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

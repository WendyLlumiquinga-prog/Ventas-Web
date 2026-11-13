import { useState, useEffect, useRef, useCallback } from 'react';
import { CatalogSuggestionItem, CatalogSuggestionsResponse } from '../types';

export interface UseCatalogSuggestionsOptions {
  query: string;
  enabled?: boolean;
  debounceMs?: number;
  initialLimit?: number;
  skipUrlsAndMultiline?: boolean;
}

export interface UseCatalogSuggestionsResult {
  suggestionData: CatalogSuggestionsResponse | null;
  exactMatches: CatalogSuggestionItem[];
  relatedMatches: CatalogSuggestionItem[];
  availableCategories: string[];
  totalAvailable: number;
  totalDisplayed: number;
  hasMoreResults: boolean;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  limit: number;
  loadMore: () => void;
  resetSuggestions: () => void;
  isLoading: boolean;
  error: string | null;
}

export function useCatalogSuggestions({
  query,
  enabled = true,
  debounceMs = 150,
  initialLimit = 12,
  skipUrlsAndMultiline = true,
}: UseCatalogSuggestionsOptions): UseCatalogSuggestionsResult {
  const [suggestionData, setSuggestionData] = useState<CatalogSuggestionsResponse | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [limit, setLimit] = useState<number>(initialLimit);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef<number>(0);

  // Reset pagination & category filter when query text changes
  useEffect(() => {
    setLimit(initialLimit);
    setSelectedCategory('Todos');
  }, [query, initialLimit]);

  useEffect(() => {
    const trimmed = query.trim();
    const looksLikeUrl = /chaide\.com/i.test(trimmed);
    const looksLikeMultiLine = trimmed.includes('\n');

    if (
      !enabled ||
      trimmed.length < 2 ||
      (skipUrlsAndMultiline && (looksLikeMultiLine || looksLikeUrl))
    ) {
      requestSeqRef.current += 1;
      setSuggestionData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const seq = ++requestSeqRef.current;
    setIsLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: trimmed,
          limit: String(limit),
        });
        if (selectedCategory !== 'Todos') {
          params.set('category', selectedCategory);
        }

        const res = await fetch(`/api/catalog/suggestions?${params.toString()}`);
        if (seq !== requestSeqRef.current) return;

        if (!res.ok) {
          throw new Error('No se pudieron cargar las sugerencias del catálogo');
        }

        const data: CatalogSuggestionsResponse = await res.json();
        if (seq !== requestSeqRef.current) return;

        setSuggestionData(data);
        setError(null);
      } catch (err: any) {
        if (seq !== requestSeqRef.current) return;
        setError(err?.message || 'Error al consultar sugerencias');
      } finally {
        if (seq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, enabled, debounceMs, limit, selectedCategory, skipUrlsAndMultiline]);

  const loadMore = useCallback(() => {
    setLimit((prev) => prev + 20);
  }, []);

  const resetSuggestions = useCallback(() => {
    requestSeqRef.current += 1;
    setSuggestionData(null);
    setSelectedCategory('Todos');
    setLimit(initialLimit);
    setIsLoading(false);
    setError(null);
  }, [initialLimit]);

  const exactMatches = suggestionData?.exactMatches || [];
  const relatedMatches = suggestionData?.relatedMatches || [];
  const availableCategories = suggestionData?.availableCategories || [];
  const totalAvailable = (suggestionData?.totalExact || 0) + (suggestionData?.totalRelated || 0);
  const totalDisplayed = exactMatches.length + relatedMatches.length;
  const hasMoreResults = totalAvailable > totalDisplayed;

  return {
    suggestionData,
    exactMatches,
    relatedMatches,
    availableCategories,
    totalAvailable,
    totalDisplayed,
    hasMoreResults,
    selectedCategory,
    setSelectedCategory,
    limit,
    loadMore,
    resetSuggestions,
    isLoading,
    error,
  };
}

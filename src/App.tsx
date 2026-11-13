import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { QuoteInputForm } from './components/QuoteInputForm';
import { QuoteItemCard } from './components/QuoteItemCard';
import { SummaryCard } from './components/SummaryCard';
import { WhatsAppPreview } from './components/WhatsAppPreview';
import { AcceptanceTestsModal } from './components/AcceptanceTestsModal';
import { CatalogStatusModal } from './components/CatalogStatusModal';
import { SkuFinderTab } from './components/SkuFinderTab';
import { InternalSkuList } from './components/InternalSkuList';
import { ClientQuoteModal } from './components/ClientQuoteModal';
import { ClientQuoteView } from './components/ClientQuoteView';
import { AddProductModal } from './components/AddProductModal';
import { exportElementToPng, exportElementToPdf } from './utils/exportQuote';
import { QuoteItem, QuoteSummary } from './types';
import { calculateQuoteSummary, toClientQuoteLineItems } from './utils/pricing';
import {
  Plus,
  Layers,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'cotizaciones' | 'sku-finder'>('cotizaciones');

  // Quotation state
  const [inputQuery, setInputQuery] = useState('titanium 2.5 plazas');
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [requestedPickup, setRequestedPickup] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingVariant, setIsUpdatingVariant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAcceptanceModalOpen, setIsAcceptanceModalOpen] = useState(false);
  const [isCatalogStatusOpen, setIsCatalogStatusOpen] = useState(false);
  const [isClientQuoteModalOpen, setIsClientQuoteModalOpen] = useState(false);
  const [isDirectExportingPng, setIsDirectExportingPng] = useState(false);
  const [isDirectExportingPdf, setIsDirectExportingPdf] = useState(false);
  const [directExportError, setDirectExportError] = useState<string | null>(null);
  const [toastNotification, setToastNotification] = useState<string | null>(null);
  const [quoteGenerationId, setQuoteGenerationId] = useState<number>(1);

  // Add Product Modal
  const [manualAddOpen, setManualAddOpen] = useState(false);

  // Monotonic guards so switching quotes discards stale async responses
  const quoteRequestSeqRef = useRef<number>(0);
  const variantRequestSeqRef = useRef<number>(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastNotification(message);
    toastTimerRef.current = setTimeout(() => setToastNotification(null), 3200);
  }, []);

  // Perform quotation query
  const performQuotation = async (queryText: string) => {
    if (!queryText.trim()) return;
    const reqSeq = ++quoteRequestSeqRef.current;
    variantRequestSeqRef.current += 1;

    setIsLoading(true);
    setError(null);
    setDirectExportError(null);
    setItems([]);
    setQuoteGenerationId((g) => g + 1);

    try {
      const res = await fetch('/api/quote/parse-and-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: queryText }),
      });

      if (reqSeq !== quoteRequestSeqRef.current) return;

      if (!res.ok) {
        throw new Error('Error al consultar precios en Chaide');
      }

      const data = await res.json();
      if (reqSeq !== quoteRequestSeqRef.current) return;

      setItems(data.items || []);
      setQuoteGenerationId((g) => g + 1);

      // If text explicitly requested pickup, sync state
      if (data.requestedPickup) {
        setRequestedPickup(true);
      } else {
        setRequestedPickup(false);
      }
    } catch (err: any) {
      if (reqSeq !== quoteRequestSeqRef.current) return;
      console.error('Error performing quotation:', err);
      setError(
        err.message || 'No se pudo conectar con el catálogo de Chaide. Intenta nuevamente.'
      );
    } finally {
      if (reqSeq === quoteRequestSeqRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Initial load: quote default Titanium 2.5 plazas
  useEffect(() => {
    performQuotation(inputQuery);
  }, []);

  // Update item quantity
  const handleUpdateQuantity = (id: string, qty: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity: Math.max(1, qty) } : item))
    );
  };

  // Remove line item
  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Variant selector change: re-verify SKU with backend
  const handleSelectVariant = async (itemId: string, newSkuId: string) => {
    const current = items.find((i) => i.id === itemId);
    if (!current) return;

    const vSeq = ++variantRequestSeqRef.current;
    const activeQuoteSeq = quoteRequestSeqRef.current;
    setIsUpdatingVariant(true);
    try {
      const res = await fetch('/api/quote/verify-variant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: current.productId,
          skuId: newSkuId,
          quantity: current.quantity,
        }),
      });

      if (vSeq !== variantRequestSeqRef.current || activeQuoteSeq !== quoteRequestSeqRef.current) {
        return;
      }

      if (res.ok) {
        const updatedItem = await res.json();
        setDirectExportError(null);
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? { ...updatedItem, id: itemId, alternativeMatches: it.alternativeMatches }
              : it
          )
        );
      }
    } catch (err) {
      console.error('Error verifying variant:', err);
    } finally {
      if (vSeq === variantRequestSeqRef.current) {
        setIsUpdatingVariant(false);
      }
    }
  };

  // Swap product to an alternative/sibling model (e.g. Golden Dreams -> Golden Dreams Dark)
  const handleSwapProduct = async (itemId: string, newProductId: string, newSkuId: string) => {
    const current = items.find((i) => i.id === itemId);
    if (!current) return;

    const vSeq = ++variantRequestSeqRef.current;
    const activeQuoteSeq = quoteRequestSeqRef.current;
    setIsUpdatingVariant(true);
    try {
      const res = await fetch('/api/quote/verify-variant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: newProductId,
          skuId: newSkuId,
          quantity: current.quantity,
        }),
      });

      if (vSeq !== variantRequestSeqRef.current || activeQuoteSeq !== quoteRequestSeqRef.current) {
        return;
      }

      if (res.ok) {
        const updatedItem = await res.json();
        setDirectExportError(null);
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== itemId) return it;
            const prevCurrentAsAlt = {
              productId: it.productId,
              productName: it.productName,
              category: it.category,
              skuId: it.skuId,
              imageUrl: it.imageUrl,
            };
            const mergedAlts = [
              prevCurrentAsAlt,
              ...(it.alternativeMatches || []).filter((a) => a.productId !== newProductId),
            ].slice(0, 5);
            return { ...updatedItem, id: itemId, alternativeMatches: mergedAlts };
          })
        );
      }
    } catch (err) {
      console.error('Error swapping product:', err);
    } finally {
      if (vSeq === variantRequestSeqRef.current) {
        setIsUpdatingVariant(false);
      }
    }
  };

  // Shared merge helper: increments quantity if exact (productId, skuId) already exists, else appends
  const mergeOrAppendQuoteItem = useCallback(
    (incomingItem: QuoteItem) => {
      const addedQty = Math.max(1, incomingItem.quantity || 1);
      let mergedTotalQty: number | null = null;

      setDirectExportError(null);
      setItems((prev) => {
        const existingIdx = prev.findIndex(
          (it) =>
            String(it.productId) === String(incomingItem.productId) &&
            String(it.skuId) === String(incomingItem.skuId)
        );

        if (existingIdx >= 0) {
          const existing = prev[existingIdx];
          mergedTotalQty = existing.quantity + addedQty;
          const updatedList = [...prev];
          updatedList[existingIdx] = {
            ...incomingItem,
            id: existing.id,
            quantity: mergedTotalQty,
            alternativeMatches: existing.alternativeMatches || incomingItem.alternativeMatches,
          };
          return updatedList;
        }

        return [...prev, { ...incomingItem, quantity: addedQty }];
      });

      if (mergedTotalQty !== null) {
        showToast(`Cantidad actualizada: ${incomingItem.productName} (${mergedTotalQty})`);
      } else {
        showToast(`Producto agregado: ${incomingItem.productName}`);
      }
    },
    [showToast]
  );

  // Add verified item from "+ Agregar otro producto" modal
  const handleAddVerifiedItem = useCallback(
    (newItem: QuoteItem) => {
      mergeOrAppendQuoteItem(newItem);
    },
    [mergeOrAppendQuoteItem]
  );

  // Add product from SkuFinderTab into Cotizaciones tab
  const handleAddProductFromSkuFinder = async (
    productId: string,
    skuId: string,
    quantity: number = 1
  ) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/quote/verify-variant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productId, skuId, quantity }),
      });

      if (res.ok) {
        const newItem: QuoteItem = await res.json();
        mergeOrAppendQuoteItem(newItem);
        setActiveTab('cotizaciones');
      }
    } catch (err) {
      console.error('Error adding SKU to quote:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load Acceptance Test Case
  const handleLoadTestCase = (testCase: {
    query: string;
    targetTab?: 'cotizaciones' | 'sku-finder';
  }) => {
    if (testCase.targetTab === 'sku-finder') {
      setActiveTab('sku-finder');
      return;
    }

    setActiveTab('cotizaciones');
    setInputQuery(testCase.query);

    // If query has explicit pickup in factory/store
    if (
      testCase.query.toLowerCase().includes('retiro') ||
      testCase.query.toLowerCase().includes('retirar')
    ) {
      setRequestedPickup(true);
    } else {
      setRequestedPickup(false);
    }

    performQuotation(testCase.query);
  };

  // Calculate live summary (100% automatic shipping)
  const summary: QuoteSummary = calculateQuoteSummary(items, {
    requestedPickup,
  });

  // Strictly sanitized line items for customer-facing PNG/PDF/preview (zero SKU codes)
  const clientItems = toClientQuoteLineItems(items, quoteGenerationId);

  // Direct export handlers from SummaryCard
  const handleDirectDownloadPng = async () => {
    if (summary.isPartialQuote || items.length === 0) return;
    const el = document.getElementById('client-quote-printable');
    if (!el) {
      setDirectExportError(null);
      setIsClientQuoteModalOpen(true);
      return;
    }
    setIsDirectExportingPng(true);
    setDirectExportError(null);
    try {
      await exportElementToPng(el);
      showToast('¡Imagen PNG de cotización descargada con éxito!');
    } catch (err: any) {
      console.error('Error direct PNG export:', err);
      setDirectExportError(
        err?.message || 'No se pudo generar la imagen PNG. Verifica las fotografías de los productos.'
      );
      setIsClientQuoteModalOpen(true);
    } finally {
      setIsDirectExportingPng(false);
    }
  };

  const handleDirectDownloadPdf = async () => {
    if (summary.isPartialQuote || items.length === 0) return;
    const el = document.getElementById('client-quote-printable');
    if (!el) {
      setDirectExportError(null);
      setIsClientQuoteModalOpen(true);
      return;
    }
    setIsDirectExportingPdf(true);
    setDirectExportError(null);
    try {
      await exportElementToPdf(el);
      showToast('¡PDF comercial de cotización descargado con éxito!');
    } catch (err: any) {
      console.error('Error direct PDF export:', err);
      setDirectExportError(
        err?.message || 'No se pudo generar el PDF. Verifica las fotografías de los productos.'
      );
      setIsClientQuoteModalOpen(true);
    } finally {
      setIsDirectExportingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAcceptanceTests={() => setIsAcceptanceModalOpen(true)}
        onOpenCatalogStatus={() => setIsCatalogStatusOpen(true)}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-5 space-y-4">
        {/* Error message */}
        {error && (
          <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs sm:text-sm flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => performQuotation(inputQuery)}
              className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reintentar</span>
            </button>
          </div>
        )}

        {/* PESTAÑA 1: COTIZACIONES */}
        {activeTab === 'cotizaciones' && (
          <>
            {/* Input Form Section */}
            <QuoteInputForm
              inputQuery={inputQuery}
              setInputQuery={setInputQuery}
              onConsultarPrecios={(override) => performQuotation(override || inputQuery)}
              isLoading={isLoading}
            />

            {/* Main Checkout Grid: Left (Products Cart), Right (Summary & WhatsApp) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left Column: Product Cards */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>Productos Cotizados ({items.length})</span>
                  </h2>

                  <button
                    type="button"
                    onClick={() => setManualAddOpen(true)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar otro producto</span>
                  </button>
                </div>

                {/* List of Product Cards */}
                {items.length > 0 ? (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <QuoteItemCard
                        key={item.id}
                        item={item}
                        onUpdateQuantity={handleUpdateQuantity}
                        onRemoveItem={handleRemoveItem}
                        onSelectVariant={handleSelectVariant}
                        onSwapProduct={handleSwapProduct}
                        isUpdatingVariant={isUpdatingVariant}
                      />
                    ))}

                    {/* Listado interno exclusivo para asesores: SKU para ingreso de pedidos */}
                    <InternalSkuList items={items} />
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center space-y-2">
                    <p className="text-sm font-semibold text-slate-700">
                      No hay productos en la cotización
                    </p>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Escribe en el campo superior o selecciona uno de los ejemplos para consultar precios en vivo.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Column: Cart-style Summary & WhatsApp Preview (Sticky on desktop) */}
              <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
                <SummaryCard
                  summary={summary}
                  itemCount={items.length}
                  onOpenClientQuote={() => {
                    setDirectExportError(null);
                    setIsClientQuoteModalOpen(true);
                  }}
                  onDownloadPng={handleDirectDownloadPng}
                  onDownloadPdf={handleDirectDownloadPdf}
                  isExportingPng={isDirectExportingPng}
                  isExportingPdf={isDirectExportingPdf}
                />
                <WhatsAppPreview items={items} summary={summary} />
              </div>
            </div>
          </>
        )}

        {/* PESTAÑA 2: BUSCADOR SKU */}
        {activeTab === 'sku-finder' && (
          <SkuFinderTab onAddProductToQuote={handleAddProductFromSkuFinder} />
        )}
      </main>

      {/* Add Product Modal sharing smart catalog search */}
      <AddProductModal
        isOpen={manualAddOpen}
        onClose={() => setManualAddOpen(false)}
        existingItems={items}
        onAddVerifiedItem={handleAddVerifiedItem}
      />

      {/* Acceptance Tests Modal */}
      <AcceptanceTestsModal
        isOpen={isAcceptanceModalOpen}
        onClose={() => setIsAcceptanceModalOpen(false)}
        onLoadTestCase={handleLoadTestCase}
      />

      {/* Catalog Status Diagnostic Modal */}
      <CatalogStatusModal
        isOpen={isCatalogStatusOpen}
        onClose={() => setIsCatalogStatusOpen(false)}
      />

      {/* Modal de Cotización Visual para Cliente */}
      <ClientQuoteModal
        isOpen={isClientQuoteModalOpen}
        onClose={() => {
          setIsClientQuoteModalOpen(false);
          setDirectExportError(null);
        }}
        items={clientItems}
        summary={summary}
        initialExportError={directExportError}
      />

      {/* Renderizado fuera de pantalla (680px ideal para WhatsApp y PDF A4) */}
      {clientItems.length > 0 && !summary.isPartialQuote && (
        <div
          className="fixed -left-[9999px] top-0 pointer-events-none select-none overflow-hidden"
          aria-hidden="true"
          style={{ width: '680px' }}
        >
          <ClientQuoteView
            key={clientItems.map((it) => `${it.renderKey}-${it.quantity}`).join('|')}
            id="client-quote-printable"
            items={clientItems}
            summary={summary}
          />
        </div>
      )}

      {/* Toast Notification */}
      {toastNotification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastNotification}</span>
        </div>
      )}
    </div>
  );
}

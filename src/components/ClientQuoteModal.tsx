import React, { useState } from 'react';
import { X, Download, FileText, Image as ImageIcon, Check, AlertCircle } from 'lucide-react';
import { ClientQuoteLineItem, QuoteSummary } from '../types';
import { ClientQuoteView } from './ClientQuoteView';
import { exportElementToPdf, exportElementToPng } from '../utils/exportQuote';

interface ClientQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ClientQuoteLineItem[];
  summary: QuoteSummary;
  initialExportError?: string | null;
}

export const ClientQuoteModal: React.FC<ClientQuoteModalProps> = ({
  isOpen,
  onClose,
  items,
  summary,
  initialExportError = null,
}) => {
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(initialExportError);

  React.useEffect(() => {
    if (isOpen) {
      setExportError(initialExportError || null);
      setExportSuccess(null);
    }
  }, [isOpen, initialExportError]);

  if (!isOpen) return null;

  // Unique key ensures complete visual reset when quote items change
  const quoteRenderKey = items
    .map((it) => `${it.renderKey}-${it.quantity}`)
    .join('|');

  const handleDownloadPng = async () => {
    const el =
      document.getElementById('client-quote-modal-view') ||
      document.getElementById('client-quote-printable');
    if (!el) return;

    setIsExportingPng(true);
    setExportError(null);
    try {
      await exportElementToPng(el);
      setExportSuccess('¡Imagen PNG descargada con éxito!');
      setTimeout(() => setExportSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error exporting PNG:', err);
      setExportError(err?.message || 'No se pudo generar la imagen PNG. Intenta de nuevo.');
    } finally {
      setIsExportingPng(false);
    }
  };

  const handleDownloadPdf = async () => {
    const el =
      document.getElementById('client-quote-modal-view') ||
      document.getElementById('client-quote-printable');
    if (!el) return;

    setIsExportingPdf(true);
    setExportError(null);
    try {
      await exportElementToPdf(el);
      setExportSuccess('¡PDF comercial descargado con éxito!');
      setTimeout(() => setExportSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error exporting PDF:', err);
      setExportError(err?.message || 'No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Cotización para cliente"
    >
      <div className="bg-slate-100 rounded-2xl shadow-2xl border border-slate-300 w-full max-w-4xl h-[92vh] sm:h-[94vh] flex flex-col overflow-hidden">
        {/* Top Control Header (Fixed inside modal, never overlaps scroll body) */}
        <div className="shrink-0 bg-slate-900 text-white px-4 py-3 sm:px-5 sm:py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div>
            <h2 className="text-sm sm:text-base font-bold flex items-center gap-2 text-white">
              <FileText className="w-4 h-4 text-blue-400" />
              <span>Cotización para cliente</span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Vista previa completa lista para descargar y compartir con el cliente
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isExportingPng || isExportingPdf || summary.isPartialQuote}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-40 cursor-pointer"
              title="Descargar imagen PNG de alta resolución"
            >
              {isExportingPng ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Generando PNG...</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Descargar imagen PNG</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPng || isExportingPdf || summary.isPartialQuote}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-40 cursor-pointer"
              title="Descargar cotización en formato PDF A4"
            >
              {isExportingPdf ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Generando PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar PDF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cerrar vista previa"
              aria-label="Cerrar vista previa"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notifications toast */}
        {exportSuccess && (
          <div className="shrink-0 bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-center gap-2">
            <Check className="w-4 h-4" />
            <span>{exportSuccess}</span>
          </div>
        )}
        {exportError && (
          <div className="shrink-0 bg-red-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{exportError}</span>
          </div>
        )}

        {/* Partial Quote Alert */}
        {summary.isPartialQuote && (
          <div className="shrink-0 bg-amber-100 text-amber-900 border-b border-amber-200 px-4 py-2 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Hay productos pendientes de verificación en Chaide. Valida todos los precios antes de exportar la cotización definitiva.
            </span>
          </div>
        )}

        {/* Scrollable Full-Document Container (Block layout + min-h-0 guarantees full vertical scrolling without clipping) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6 pb-8 bg-slate-200/70">
          <div className="pb-4">
            <ClientQuoteView
              key={quoteRenderKey}
              items={items}
              summary={summary}
              id="client-quote-modal-view"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

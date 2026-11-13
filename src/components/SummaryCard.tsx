import React from 'react';
import {
  DollarSign,
  TrendingDown,
  Truck,
  AlertCircle,
  Tag,
  CheckCircle2,
  FileText,
  Download,
  Image as ImageIcon,
} from 'lucide-react';
import { QuoteSummary } from '../types';
import { formatCurrencyEC } from '../utils/pricing';

interface SummaryCardProps {
  summary: QuoteSummary;
  itemCount: number;
  onOpenClientQuote?: () => void;
  onDownloadPng?: () => void;
  onDownloadPdf?: () => void;
  isExportingPng?: boolean;
  isExportingPdf?: boolean;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  summary,
  itemCount,
  onOpenClientQuote,
  onDownloadPng,
  onDownloadPdf,
  isExportingPng = false,
  isExportingPdf = false,
}) => {
  if (itemCount === 0) {
    return null;
  }

  const shippingText = summary.shipping.isFree
    ? 'Gratis'
    : summary.shipping.shippingCents > 0
    ? '$6,90'
    : 'Sin envío';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-blue-600" />
          <span>Resumen de la Cotización</span>
        </h3>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          {itemCount} {itemCount === 1 ? 'producto' : 'productos'}
        </span>
      </div>

      {/* Partial Quote Alert (Section 8) */}
      {summary.isPartialQuote && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Cotización Parcial</p>
            <p className="mt-0.5 text-amber-800 leading-relaxed">
              Existen productos sin precio vigente verificado en Chaide. Se omitió el total definitivo y no es posible exportar la cotización final hasta validar todos los productos.
            </p>
          </div>
        </div>
      )}

      {/* Numerical Line Items */}
      <div className="space-y-2.5 text-sm">
        {/* Subtotal a precios normales */}
        <div className="flex items-center justify-between text-slate-600">
          <span>Subtotal a precios normales:</span>
          <span className="font-semibold text-slate-700">
            {formatCurrencyEC(summary.subtotalNormalCents)}
          </span>
        </div>

        {/* Subtotal a precios promocionales */}
        <div className="flex items-center justify-between text-slate-900 font-semibold">
          <span>Subtotal a precios promocionales:</span>
          <span className="font-bold text-slate-950">
            {formatCurrencyEC(summary.subtotalPromoCents)}
          </span>
        </div>

        {/* Descuento total aplicado */}
        {summary.totalDiscountPercent > 0 && !summary.isPartialQuote && (
          <div className="flex items-center justify-between text-blue-700 text-xs font-semibold bg-blue-50/70 px-2 py-1 rounded-md">
            <span className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" />
              <span>Descuento total aplicado:</span>
            </span>
            <span className="font-bold text-sm">
              {summary.totalDiscountPercent}%
            </span>
          </div>
        )}

        {/* Ahorro total */}
        {summary.totalSavingsCents > 0 && (
          <div className="flex items-center justify-between text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200/60 font-semibold">
            <span className="flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-emerald-600" />
              <span>💸 Ahorro total:</span>
            </span>
            <span className="font-bold">
              {formatCurrencyEC(summary.totalSavingsCents)}
              {summary.hasPartialSavings && ' (parcial)'}
            </span>
          </div>
        )}

        {/* Envío automático */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-slate-700">
          <span className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Truck className="w-4 h-4 text-slate-400" />
            <span>🚚 Envío:</span>
          </span>
          <span
            className={`font-semibold text-xs sm:text-sm ${
              summary.shipping.isFree
                ? 'text-emerald-600 font-bold'
                : 'text-slate-800'
            }`}
          >
            {summary.shipping.isPartial ? 'Por verificar' : shippingText}
          </span>
        </div>

        {/* TOTAL A PAGAR */}
        <div className="border-t-2 border-slate-200 pt-3 flex items-baseline justify-between">
          <div>
            <div className="text-base font-black text-slate-900 tracking-tight">
              💰 TOTAL A PAGAR:
            </div>
            {summary.ivaConfirmedAll && (
              <p className="text-[11px] text-emerald-600 font-medium mt-0.5">
                Precios con IVA incluido
              </p>
            )}
          </div>
          <div className="text-right">
            {summary.totalToPayCents !== null ? (
              <span className="text-2xl sm:text-3xl font-black text-blue-700 tracking-tight">
                {formatCurrencyEC(summary.totalToPayCents)}
              </span>
            ) : (
              <span className="text-sm font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                Por verificar
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Section 7: Botones para Cotización de Cliente (Visual, PNG, PDF) */}
      <div className="pt-2 border-t border-slate-100 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>Cotización para cliente:</span>
          </span>
          <span className="text-[10px] text-slate-400 font-medium">
            Formato oficial Chaide
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenClientQuote}
          disabled={summary.isPartialQuote}
          className="w-full py-2.5 px-3 bg-[#0033A0] hover:bg-blue-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-900/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <FileText className="w-4 h-4" />
          <span>Ver cotización visual</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onDownloadPng}
            disabled={summary.isPartialQuote || isExportingPng || isExportingPdf}
            className="py-2 px-2.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Descargar cotización como imagen PNG"
          >
            {isExportingPng ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                <span>Generando...</span>
              </>
            ) : (
              <>
                <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>Descargar imagen</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={summary.isPartialQuote || isExportingPng || isExportingPdf}
            className="py-2 px-2.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Descargar cotización en documento PDF A4"
          >
            {isExportingPdf ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                <span>Generando...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-blue-600" />
                <span>Descargar PDF</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

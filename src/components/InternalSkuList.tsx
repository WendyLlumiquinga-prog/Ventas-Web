import React, { useState } from 'react';
import { Copy, Check, ClipboardList, AlertTriangle, Hash } from 'lucide-react';
import { QuoteItem } from '../types';
import { copyTextVerified } from '../utils/clipboard';

interface InternalSkuListProps {
  items: QuoteItem[];
}

function getValidSapCode(item: QuoteItem): string | null {
  if (!item.pricing.verified) return null;
  const ref = item.referenceId ? String(item.referenceId).trim() : '';
  if (!ref || ref === '0') return null;
  return ref;
}

function buildVariantSummary(item: QuoteItem): string {
  const parts: string[] = [];
  if (item.color) parts.push(`Color: ${item.color}`);
  if (item.diseno) parts.push(`Diseño: ${item.diseno}`);
  if (item.cuerpos) parts.push(item.cuerpos);
  return parts.length > 0 ? parts.join(' · ') : 'Estándar';
}

export const InternalSkuList: React.FC<InternalSkuListProps> = ({ items }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [clipboardFallback, setClipboardFallback] = useState<{
    label: string;
    value: string;
    error: string;
  } | null>(null);

  if (items.length === 0) return null;

  const validSapCodes = items
    .map(getValidSapCode)
    .filter((code): code is string => Boolean(code));

  const triggerVerifiedCopy = async (key: string, text: string, fallbackLabel: string) => {
    setClipboardFallback(null);
    const result = await copyTextVerified(text);
    if (result.ok) {
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2200);
    } else {
      setClipboardFallback({
        label: fallbackLabel,
        value: text,
        error: result.error || 'No se pudo copiar automáticamente.',
      });
    }
  };

  const handleCopySingleCode = (item: QuoteItem) => {
    const sapCode = getValidSapCode(item);
    if (!sapCode) return;
    triggerVerifiedCopy(`single-${item.id}`, sapCode, `Código SAP de ${item.productName}`);
  };

  const handleCopyAllDetails = () => {
    const lines = items.map((item) => {
      const measure = item.medida || item.plazas || 'Estándar';
      const variant = buildVariantSummary(item);
      const sapCode = getValidSapCode(item) || 'Código SAP no disponible';
      return `${item.productName} | ${measure} | ${variant} | Cant: ${item.quantity} | Código SAP: ${sapCode}`;
    });
    triggerVerifiedCopy('all-details', lines.join('\n'), 'Listado completo de códigos SAP');
  };

  const handleCopyOnlyCodes = () => {
    if (validSapCodes.length === 0) return;
    triggerVerifiedCopy('only-codes', validSapCodes.join('\n'), 'Códigos SAP');
  };

  return (
    <section
      aria-label="Códigos SAP para ingreso de pedidos"
      className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
    >
      {/* Header */}
      <div className="bg-slate-50/90 border-b border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <ClipboardList className="w-4 h-4 text-slate-700 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900">
              Códigos SAP para ingreso de pedidos
            </h3>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              · Uso interno asesores
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Referencia comercial oficial para ingreso en SAP. No aparece en WhatsApp, PNG ni PDF.
          </p>
        </div>

        {/* Bulk copy controls */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleCopyAllDetails}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              copiedKey === 'all-details'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            {copiedKey === 'all-details' ? (
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
            onClick={handleCopyOnlyCodes}
            disabled={validSapCodes.length === 0}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              copiedKey === 'only-codes'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
            }`}
            title="Copia únicamente los códigos SAP, uno por línea"
          >
            {copiedKey === 'only-codes' ? (
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
      </div>

      {/* Clipboard blocked manual fallback */}
      {clipboardFallback && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-900 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>{clipboardFallback.error} ({clipboardFallback.label})</span>
            </div>
            <button
              type="button"
              onClick={() => setClipboardFallback(null)}
              className="text-[11px] underline text-amber-800 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
          <textarea
            readOnly
            value={clipboardFallback.value}
            rows={Math.min(4, clipboardFallback.value.split('\n').length)}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full font-mono text-[11px] bg-white border border-amber-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none"
          />
        </div>
      )}

      {/* Compact Ordered Rows */}
      <div className="divide-y divide-slate-100">
        {items.map((item, idx) => {
          const sapCode = getValidSapCode(item);
          const measure = item.medida || item.plazas || 'Estándar';
          const copyBtnKey = `single-${item.id}`;
          const isRowCopied = copiedKey === copyBtnKey;

          return (
            <div
              key={`${item.id}-${item.skuId}-${sapCode || 'noref'}-${idx}`}
              className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/50 transition-colors"
            >
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                    {idx + 1}.
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {item.productName}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-600 flex-wrap pl-4">
                  <span>
                    Medida: <strong className="text-slate-800">{measure}</strong>
                  </span>
                  {item.color && (
                    <span>
                      · Color: <strong className="text-slate-800 capitalize">{item.color}</strong>
                    </span>
                  )}
                  {item.diseno && (
                    <span>
                      · Diseño: <strong className="text-slate-800">{item.diseno}</strong>
                    </span>
                  )}
                  {item.cuerpos && (
                    <span>
                      · <strong className="text-slate-800">{item.cuerpos}</strong>
                    </span>
                  )}
                  <span>
                    · Cantidad: <strong className="text-slate-900 tabular-nums">{item.quantity}</strong>
                  </span>
                </div>
              </div>

              {/* Exact SAP Reference Code + Copy Button */}
              <div className="flex items-center justify-between sm:justify-end gap-2.5 pl-4 sm:pl-0 shrink-0 tabular-nums">
                {sapCode ? (
                  <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-900 px-2.5 py-1 rounded-lg font-mono text-xs font-bold">
                    <span className="text-[10px] font-semibold text-blue-700">Código SAP:</span>
                    <span className="text-blue-800 font-black">{sapCode}</span>
                  </div>
                ) : (
                  <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                    Código SAP no disponible
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => handleCopySingleCode(item)}
                  disabled={!sapCode}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isRowCopied
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                  title={
                    sapCode
                      ? `Copiar código SAP ${sapCode}`
                      : 'Código SAP no disponible'
                  }
                >
                  {isRowCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copiar código</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

import React, { useState, useEffect } from 'react';
import { ClientQuoteLineItem, QuoteSummary } from '../types';
import { formatCurrencyEC } from '../utils/pricing';
import { getCachedOfficialImageDataUrl, resolveOfficialImageDataUrl } from '../utils/imageLoader';
import { Image as ImageIcon } from 'lucide-react';

interface ClientQuoteViewProps {
  items: ClientQuoteLineItem[];
  summary: QuoteSummary;
  id?: string;
}

interface QuoteProductImageProps {
  imageUrl?: string;
  alt: string;
}

/**
 * Isolated product image component backed by verified base64 Data URLs via /api/image-proxy.
 * Keyed by renderKey + imageUrl in parent so previous quote images never bleed through.
 */
const QuoteProductImage: React.FC<QuoteProductImageProps> = ({ imageUrl, alt }) => {
  const initialCached = getCachedOfficialImageDataUrl(imageUrl);
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(initialCached);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error' | 'missing'>(
    !imageUrl ? 'missing' : initialCached ? 'loaded' : 'loading'
  );

  useEffect(() => {
    let active = true;
    const cleanUrl = (imageUrl || '').trim();
    if (!cleanUrl) {
      setResolvedSrc(undefined);
      setStatus('missing');
      return;
    }

    const cached = getCachedOfficialImageDataUrl(cleanUrl);
    if (cached) {
      setResolvedSrc(cached);
      setStatus('loaded');
      return;
    }

    setResolvedSrc(undefined);
    setStatus('loading');

    resolveOfficialImageDataUrl(cleanUrl).then((res) => {
      if (!active) return;
      if (res.ok && res.dataUrl) {
        setResolvedSrc(res.dataUrl);
        setStatus('loaded');
      } else {
        setResolvedSrc(undefined);
        setStatus('error');
      }
    });

    return () => {
      active = false;
    };
  }, [imageUrl]);

  if (status === 'loading') {
    return (
      <div
        data-image-status="loading"
        data-product-name={alt}
        className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-slate-50 border border-slate-200 shrink-0 flex flex-col items-center justify-center text-slate-400 p-2 text-center relative overflow-hidden"
      >
        <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-600 rounded-full animate-spin mb-1" />
        <span className="text-[9px] font-medium leading-tight">Cargando foto...</span>
      </div>
    );
  }

  if (status === 'missing' || status === 'error' || !resolvedSrc) {
    return (
      <div
        data-image-status={status === 'missing' ? 'missing' : 'error'}
        data-product-name={alt}
        className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-slate-50 border border-slate-200 shrink-0 flex flex-col items-center justify-center text-slate-400 p-2 text-center"
      >
        <ImageIcon className="w-6 h-6 stroke-1 mb-1" />
        <span className="text-[10px] font-medium leading-tight">
          Imagen no disponible
        </span>
      </div>
    );
  }

  return (
    <div
      data-image-status="loaded"
      data-product-name={alt}
      className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-white border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center relative p-1"
    >
      <img
        src={resolvedSrc}
        alt={alt}
        data-product-name={alt}
        loading="eager"
        decoding="sync"
        onError={() => setStatus('error')}
        className="w-full h-full object-contain object-center"
      />
    </div>
  );
};

export const ClientQuoteView: React.FC<ClientQuoteViewProps> = ({
  items,
  summary,
  id = 'client-quote-printable',
}) => {
  const currentDate = new Date().toLocaleDateString('es-EC', {
    timeZone: 'America/Guayaquil',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const shippingText = summary.shipping.isOmitted
    ? 'Retiro en tienda'
    : summary.shipping.isFree
    ? 'Gratis'
    : summary.shipping.shippingCents > 0
    ? '$6,90'
    : 'Sin envío';

  return (
    <div
      id={id}
      className="bg-white text-slate-900 w-full max-w-[700px] mx-auto rounded-2xl border border-slate-200 shadow-lg overflow-hidden"
    >
      {/* 1. Encabezado Azul Corporativo CHAIDE */}
      <div className="bg-[#0033A0] text-white px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        {/* Lado izquierdo: CHAIDE */}
        <div className="shrink-0">
          <span className="text-xl sm:text-2xl font-black tracking-[0.14em] text-white leading-none select-none">
            CHAIDE
          </span>
        </div>

        {/* Centro: Título comercial */}
        <div className="sm:border-l sm:border-blue-400/40 sm:pl-4 flex-1">
          <h1 className="text-base sm:text-lg font-bold tracking-tight leading-tight text-white">
            Cotización de productos
          </h1>
          <p className="text-xs text-blue-100 mt-0.5 font-medium">
            Ventas Online Oficial
          </p>
        </div>

        {/* Lado derecho: Fecha Ecuador y Asesor */}
        <div className="text-left sm:text-right text-xs space-y-0.5 shrink-0">
          <div className="text-blue-100">
            Fecha: <span className="font-semibold text-white">{currentDate}</span>
          </div>
          <div className="text-blue-100">
            Asesor: <span className="font-semibold text-white">Wendy Llumiquinga</span>
          </div>
        </div>
      </div>

      {/* 2. Lista de Productos (Diseño minimalista estilo carrito) */}
      <div className="p-5 sm:p-6 space-y-5">
        <div className="divide-y divide-slate-100">
          {items.map((item, idx) => {
            const unitPromo = item.unitPromoCents;
            const unitNormal = item.unitNormalCents;
            const linePromo = unitPromo * item.quantity;
            const lineNormal = unitNormal * item.quantity;
            const lineSavings = lineNormal > linePromo ? lineNormal - linePromo : 0;

            return (
              <div
                key={`${item.renderKey}-${idx}`}
                className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                {/* IZQUIERDA + CENTRO: Fotografía oficial y detalles comerciales */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <QuoteProductImage
                    key={`${item.renderKey}-${item.imageUrl || 'noimg'}`}
                    imageUrl={item.imageUrl}
                    alt={item.productName}
                  />

                  <div className="space-y-1 flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                      {item.productName}
                    </h3>

                    <div className="text-xs sm:text-sm text-slate-600 space-y-0.5">
                      <div>
                        Medida:{' '}
                        <span className="font-semibold text-slate-800">
                          {item.medida || 'Estándar'}
                        </span>
                      </div>

                      {(item.color || item.cuerpos || item.diseno) && (
                        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                          {item.color && (
                            <span>
                              Color:{' '}
                              <span className="font-medium text-slate-700 capitalize">
                                {item.color}
                              </span>
                            </span>
                          )}
                          {item.diseno && (
                            <span>
                              {item.color ? '· ' : ''}Diseño:{' '}
                              <span className="font-medium text-slate-700">
                                {item.diseno}
                              </span>
                            </span>
                          )}
                          {item.cuerpos && (
                            <span className="font-medium text-slate-700">
                              {(item.color || item.diseno) ? '· ' : ''}
                              {item.cuerpos}
                            </span>
                          )}
                        </div>
                      )}

                      <div>
                        Cantidad:{' '}
                        <span className="font-semibold text-slate-800">
                          {item.quantity} {item.quantity === 1 ? 'unidad' : 'unidades'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DERECHA: Precios, ahorro y subtotal */}
                <div className="text-left sm:text-right shrink-0 w-full sm:w-auto border-t sm:border-t-0 pt-2.5 sm:pt-0 border-slate-100 space-y-0.5 text-xs sm:text-sm">
                  {unitNormal > unitPromo && (
                    <div className="text-slate-400">
                      Antes:{' '}
                      <span className="line-through">
                        {formatCurrencyEC(unitNormal)}
                        {item.quantity > 1 ? ' c/u' : ''}
                      </span>
                    </div>
                  )}

                  <div className="text-slate-700">
                    Ahora:{' '}
                    <span className="text-base sm:text-lg font-extrabold text-[#0033A0]">
                      {formatCurrencyEC(unitPromo)}
                      {item.quantity > 1 ? ' c/u' : ''}
                    </span>
                  </div>

                  {lineSavings > 0 && (
                    <div className="text-emerald-700 font-semibold text-xs sm:text-sm">
                      Ahorras: {formatCurrencyEC(lineSavings)}
                    </div>
                  )}

                  {item.quantity > 1 && (
                    <div className="pt-0.5 text-slate-800 font-bold text-xs sm:text-sm">
                      Subtotal: {formatCurrencyEC(linePromo)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 3. Nuevo Resumen Comercial (Sencillo, ancho completo, sin cajas ni porcentaje total) */}
        <div className="pt-4 border-t border-slate-200 space-y-2 text-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span>Subtotal a precios normales:</span>
            <span className="font-medium text-slate-600">
              {formatCurrencyEC(summary.subtotalNormalCents)}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-800">
            <span className="font-medium">Subtotal a precios promocionales:</span>
            <span className="font-bold text-slate-900">
              {formatCurrencyEC(summary.subtotalPromoCents)}
            </span>
          </div>

          {summary.totalSavingsCents > 0 && (
            <div className="flex items-center justify-between text-emerald-700">
              <span className="font-medium">Ahorro total:</span>
              <span className="font-bold">
                {formatCurrencyEC(summary.totalSavingsCents)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-slate-700">
            <span>Envío:</span>
            <span
              className={`font-semibold ${
                summary.shipping.isFree ? 'text-emerald-700' : 'text-slate-800'
              }`}
            >
              {shippingText}
            </span>
          </div>

          <div className="pt-3 mt-1 border-t border-slate-200 flex items-baseline justify-between">
            <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              TOTAL A PAGAR:
            </span>
            <span className="text-2xl sm:text-[28px] font-black text-[#0033A0] tracking-tight">
              {summary.totalToPayCents !== null
                ? formatCurrencyEC(summary.totalToPayCents)
                : 'Por verificar'}
            </span>
          </div>
        </div>

        {/* 4. Información comercial mínima confirmada */}
        {summary.ivaConfirmedAll && (
          <p className="text-xs text-slate-500 pt-1">
            Precios con IVA incluido.
          </p>
        )}
      </div>

      {/* 5. Pie de página minimalista */}
      <div className="border-t border-slate-200 bg-slate-50/60 px-5 sm:px-6 py-3 flex items-center justify-between text-xs text-slate-500">
        <span className="font-semibold text-slate-700">Chaide y Chaide S.A.</span>
        <span>www.chaide.com</span>
      </div>
    </div>
  );
};

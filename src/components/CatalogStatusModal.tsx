import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
} from 'lucide-react';
import { CatalogStatusSummary } from '../types';

interface CatalogStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CatalogStatusModal: React.FC<CatalogStatusModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [status, setStatus] = useState<CatalogStatusSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/catalog/status');
      if (res.ok) {
        const data: CatalogStatusSummary = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Error cargando estado del catálogo:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchStatus();
  }, [isOpen, fetchStatus]);

  // Poll gently only while actively syncing
  useEffect(() => {
    if (!isOpen || status?.syncState !== 'syncing') return;
    const timer = setInterval(fetchStatus, 1800);
    return () => clearInterval(timer);
  }, [isOpen, status?.syncState, fetchStatus]);

  const handleSyncCatalog = async () => {
    setSyncMessage('Sincronización iniciada en segundo plano. Puedes seguir cotizando sin interrupciones.');
    try {
      const res = await fetch('/api/catalog/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.status) setStatus(data.status);
      }
    } catch (err) {
      console.error('Error iniciando sincronización:', err);
    }
  };

  if (!isOpen) return null;

  const formattedLastSync = status?.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleString('es-EC', {
        timeZone: 'America/Guayaquil',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : 'Sin registro reciente';

  const isSyncing = status?.syncState === 'syncing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight truncate">
                Estado del catálogo Chaide
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                Auditoría real del índice público accesible en www.chaide.com
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar estado del catálogo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Sync state & action bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                    <span>Sincronizando catálogo en segundo plano...</span>
                  </>
                ) : status?.syncState === 'error' ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Sincronizado con advertencias</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Índice operativo y listo</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap tabular-nums">
                <span>Última sincronización: {formattedLastSync}</span>
                {status?.syncDurationMs ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Duración: {(status.syncDurationMs / 1000).toFixed(2)}s</span>
                  </>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSyncCatalog}
              disabled={isSyncing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Actualizando...' : 'Actualizar catálogo'}</span>
            </button>
          </div>

          {syncMessage && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>{syncMessage}</span>
            </div>
          )}

          {/* Coverage transparency note */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Alcance de cobertura verificado</p>
              <p className="text-slate-600 mt-0.5">
                {status?.coverageNote ||
                  'Cobertura del catálogo público accesible; total administrativo no confirmado.'}
              </p>
              {status?.vtexSourceStats && (
                <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                  API paginada: {status.vtexSourceStats.pagedProductsCount} · Sitemap público:{' '}
                  {status.vtexSourceStats.sitemapUrlsCount} URLs · Categorías VTEX revisadas:{' '}
                  {status.vtexSourceStats.categoryIdsChecked}
                </p>
              )}
            </div>
          </div>

          {/* Core Metrics Grid */}
          {isLoading && !status ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Cargando métricas del índice...
            </div>
          ) : status ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 tabular-nums">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500">Productos indexados</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    {status.totalProducts}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500">SKU únicos</div>
                  <div className="text-2xl font-bold text-blue-700 mt-1">
                    {status.totalUniqueSkus.toLocaleString('es-EC')}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500">Categorías indexadas</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    {status.totalCategories}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                  <div className="text-xs text-slate-500">Productos sin SKU verificable</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {status.productsWithoutVerifiableSku}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                  <div className="text-xs text-slate-500">SKU sin foto</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {status.skusWithoutPhoto}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                  <div className="text-xs text-slate-500">SKU sin precio verificable</div>
                  <div className="text-xl font-bold text-amber-700 mt-1">
                    {status.skusWithoutVerifiablePrice}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Sin stock reportado: {status.skusOutOfStockCount}
                  </div>
                </div>
              </div>

              {/* Categories Breakdown */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>Distribución por categoría ({status.totalCategories})</span>
                </h3>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto tabular-nums">
                  {status.categoriesList.map((cat) => (
                    <div
                      key={cat.name}
                      className="px-3.5 py-2 flex items-center justify-between text-xs"
                    >
                      <span className="font-medium text-slate-800">{cat.name}</span>
                      <span className="text-slate-500">
                        {cat.productCount} productos · {cat.skuCount} SKUs
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sync Errors if any */}
              {status.syncErrors.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-amber-800">
                    Errores de sincronización ({status.syncErrors.length})
                  </h3>
                  <ul className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                    {status.syncErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Fuente: VTEX API pública www.chaide.com</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

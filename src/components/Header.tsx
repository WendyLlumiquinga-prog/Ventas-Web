import React, { useEffect, useState } from 'react';
import { FlaskConical, ExternalLink, Calculator, Search, Database } from 'lucide-react';
import { VtexStatus } from '../types';

interface HeaderProps {
  activeTab: 'cotizaciones' | 'sku-finder';
  setActiveTab: (tab: 'cotizaciones' | 'sku-finder') => void;
  onOpenAcceptanceTests: () => void;
  onOpenCatalogStatus: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenAcceptanceTests,
  onOpenCatalogStatus,
}) => {
  const [vtexStatus, setVtexStatus] = useState<VtexStatus>({
    connected: false,
    lastQueryAt: null,
    latencyMs: 0,
    errorDetail: null,
    catalogCount: 0,
  });

  const checkVtexStatus = async () => {
    try {
      const res = await fetch('/api/vtex/status');
      if (res.ok) {
        const data = await res.json();
        setVtexStatus(data);
      }
    } catch {
      setVtexStatus((prev) => ({ ...prev, connected: false, errorDetail: 'Fallo de red local' }));
    }
  };

  useEffect(() => {
    checkVtexStatus();
    const interval = setInterval(checkVtexStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-6xl mx-auto px-3 sm:px-4">
        {/* Top bar with Branding, VTEX status and secondary diagnostic tools */}
        <div className="py-2.5 flex items-center justify-between gap-3 border-b border-slate-800/80">
          {/* Chaide Logo & Title */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-sky-400 flex items-center justify-center shadow-md shadow-blue-900/40 text-white font-black text-lg tracking-tighter">
              CH
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-bold tracking-tight text-white leading-none whitespace-nowrap">
                  Chaide
                </span>
                <span className="text-[11px] font-medium text-blue-300 hidden xs:inline whitespace-nowrap">
                  Ventas Online
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">
                Catálogo oficial en vivo desde www.chaide.com
              </p>
            </div>
          </div>

          {/* Right tool actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenCatalogStatus}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                vtexStatus.connected
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  : 'bg-amber-950/50 border-amber-800/50 text-amber-200'
              }`}
              title={
                vtexStatus.connected
                  ? `Estado del catálogo (${vtexStatus.catalogCount} productos indexados)`
                  : vtexStatus.errorDetail || 'Ver estado del catálogo'
              }
            >
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Estado del catálogo</span>
              <span className="sm:hidden">Catálogo</span>
            </button>

            <a
              href="https://www.chaide.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors whitespace-nowrap shrink-0"
            >
              <span>chaide.com</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            <button
              type="button"
              onClick={onOpenAcceptanceTests}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
              title="Verificar pruebas de aceptación oficiales"
            >
              <FlaskConical className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Pruebas</span>
              <span className="sm:hidden">Pruebas</span>
            </button>
          </div>
        </div>

        {/* Tab navigation: [Cotizaciones] [Buscador SKU] */}
        <div className="flex items-center gap-1 pt-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('cotizaciones')}
            className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'cotizaciones'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>1. Cotizaciones</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sku-finder')}
            className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'sku-finder'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>2. Buscador de códigos SAP</span>
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded font-mono font-bold">
              Pedidos
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};

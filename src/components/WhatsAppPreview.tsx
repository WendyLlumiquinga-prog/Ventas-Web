import React, { useState } from 'react';
import { Copy, Check, MessageSquare } from 'lucide-react';
import { QuoteItem, QuoteSummary } from '../types';
import { generateWhatsAppMessage } from '../utils/pricing';

interface WhatsAppPreviewProps {
  items: QuoteItem[];
  summary: QuoteSummary;
}

export const WhatsAppPreview: React.FC<WhatsAppPreviewProps> = ({ items, summary }) => {
  const [copied, setCopied] = useState(false);

  const messageText = generateWhatsAppMessage(items, summary);

  const handleCopy = async () => {
    if (!messageText) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(messageText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = messageText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Error copying to clipboard:', err);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-600" />
          <span>Vista Previa para WhatsApp</span>
        </h3>

        {/* Copy Button */}
        <button
          type="button"
          onClick={handleCopy}
          disabled={!messageText}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md transition-all active:scale-[0.98] cursor-pointer ${
            copied
              ? 'bg-emerald-600 text-white shadow-emerald-600/20'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
          }`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              <span>¡Copiado al portapapeles!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copiar para WhatsApp</span>
            </>
          )}
        </button>
      </div>

      {/* WhatsApp Chat Bubble */}
      <div className="bg-[#EFEAE2] p-3 sm:p-4 rounded-xl border border-slate-200 relative overflow-hidden">
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-xs text-xs sm:text-sm text-slate-800 font-sans whitespace-pre-wrap leading-relaxed max-w-lg border border-slate-200/60 select-text">
          {messageText}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
        <span>Texto plano sin enlaces ni SKU para clientes.</span>
        <span>Formato oficial Chaide</span>
      </div>
    </div>
  );
};

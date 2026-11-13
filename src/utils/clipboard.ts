export interface ClipboardCopyResult {
  ok: boolean;
  method?: 'clipboard' | 'execCommand';
  error?: string;
}

/**
 * Reliable clipboard copy utility:
 * 1. Never reports success until the clipboard write actually succeeds.
 * 2. Uses navigator.clipboard.writeText directly within the user click handler.
 * 3. Falls back to a temporary read-only textarea + document.execCommand('copy') when restricted (e.g. iframe policy).
 */
export async function copyTextVerified(text: string): Promise<ClipboardCopyResult> {
  const value = String(text ?? '');
  if (!value.trim()) {
    return { ok: false, error: 'No hay código válido para copiar.' };
  }

  // Primary: Modern Async Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(value);
      return { ok: true, method: 'clipboard' };
    } catch {
      // Proceed to legacy execCommand fallback before failing
    }
  }

  // Fallback: Temporary off-screen textarea selection (runs synchronously in user gesture)
  if (typeof document !== 'undefined') {
    try {
      const activeEl = document.activeElement as HTMLElement | null;
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, value.length);

      const succeeded = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (activeEl && typeof activeEl.focus === 'function') {
        activeEl.focus();
      }

      if (succeeded) {
        return { ok: true, method: 'execCommand' };
      }
    } catch {
      // Fall through to explicit error
    }
  }

  return {
    ok: false,
    error: 'El navegador bloqueó el acceso automático al portapapeles. Selecciona el código manualmente para copiarlo.',
  };
}

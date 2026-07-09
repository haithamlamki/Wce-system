// ============================================================================
//  Toast system — reproduces the prototype's .toast-wrap/.toast behavior
//  (bottom-right, copper/green/red left border, fade after ~2.7s).
// ============================================================================
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'info' | 'success' | 'error';
interface ToastItem { id: number; msg: string; kind: ToastKind; leaving: boolean }

const Ctx = createContext<(msg: string, kind?: ToastKind) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const toast = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, msg, kind, leaving: false }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), 2700);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3100);
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toast-wrap" id="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id}
            className={`toast${t.kind === 'success' ? ' success' : t.kind === 'error' ? ' error' : ''}`}
            style={t.leaving ? { opacity: 0, transition: 'opacity .4s' } : undefined}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}

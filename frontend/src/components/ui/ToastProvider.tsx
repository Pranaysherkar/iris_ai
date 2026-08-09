"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "error" | "success" | "warning" | "info";

type ToastItem = {
  id: string;
  message: string;
  kind: ToastKind;
};

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t != null) {
      window.clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = "error") => {
      const text = message.trim();
      if (!text) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message: text, kind }]);
      const timer = window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="iris-toast-viewport" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`iris-toast iris-toast-${t.kind}`}
            role={t.kind === "error" || t.kind === "warning" ? "alert" : "status"}
          >
            <span className="iris-toast-msg">{t.message}</span>
            <button
              type="button"
              className="iris-toast-x"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <style>{toastStyles}</style>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: () => {
        /* no-op outside provider (SSR / tests) */
      },
    };
  }
  return ctx;
}

const toastStyles = `
  .iris-toast-viewport {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(440px, calc(100vw - 24px));
    pointer-events: none;
  }
  .iris-toast {
    pointer-events: auto;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    font-size: 13.5px;
    line-height: 1.45;
    box-shadow: 0 10px 40px rgba(0,0,0,0.35);
    backdrop-filter: blur(10px);
    animation: iris-toast-in 0.28s ease-out;
  }
  .iris-toast-msg { flex: 1; min-width: 0; }
  .iris-toast-x {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 6px;
    background: rgba(255,255,255,0.1);
    color: inherit;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    opacity: 0.85;
  }
  .iris-toast-x:hover { opacity: 1; background: rgba(255,255,255,0.16); }

  .iris-toast-error {
    color: #fecaca;
    background: rgba(127, 29, 29, 0.92);
    border: 1px solid rgba(248, 113, 113, 0.35);
  }
  .iris-toast-warning {
    color: #fde68a;
    background: rgba(120, 53, 15, 0.92);
    border: 1px solid rgba(251, 191, 36, 0.35);
  }
  .iris-toast-success {
    color: #bbf7d0;
    background: rgba(20, 83, 45, 0.92);
    border: 1px solid rgba(74, 222, 128, 0.35);
  }
  .iris-toast-info {
    color: #e0e7ff;
    background: rgba(49, 46, 129, 0.92);
    border: 1px solid rgba(129, 140, 248, 0.4);
  }

  @keyframes iris-toast-in {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  [data-theme="light"] .iris-toast-error {
    color: #991b1b;
    background: rgba(254, 226, 226, 0.98);
    border-color: rgba(248, 113, 113, 0.4);
  }
  [data-theme="light"] .iris-toast-warning {
    color: #92400e;
    background: rgba(254, 243, 199, 0.98);
    border-color: rgba(251, 191, 36, 0.5);
  }
  [data-theme="light"] .iris-toast-success {
    color: #166534;
    background: rgba(220, 252, 231, 0.98);
    border-color: rgba(74, 222, 128, 0.45);
  }
  [data-theme="light"] .iris-toast-info {
    color: #3730a3;
    background: rgba(224, 231, 255, 0.98);
    border-color: rgba(129, 140, 248, 0.45);
  }
  [data-theme="light"] .iris-toast-x {
    background: rgba(0,0,0,0.06);
  }
`;

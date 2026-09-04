"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

type ToastVariant = "default" | "success" | "error" | "warning";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number; // ms; 0 = sticky
  action?: ToastAction;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastContextValue {
  toast: (t: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_BAR: Record<ToastVariant, string> = {
  default: "bg-foreground",
  success: "bg-success",
  error: "bg-destructive",
  warning: "bg-warning",
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <AppProviders>");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Confirm dialog                                                      */
/* ------------------------------------------------------------------ */

interface ConfirmInput {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (input: ConfirmInput) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <AppProviders>");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { ...t, id }]);
      const duration = t.duration ?? (t.action ? 8000 : 4500);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const [confirmState, setConfirmState] = useState<
    (ConfirmInput & { resolve: (v: boolean) => void }) | null
  >(null);

  const confirm = useCallback<ConfirmFn>((input) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...input, resolve });
    });
  }, []);

  const closeConfirm = (value: boolean) => {
    setConfirmState((s) => {
      s?.resolve(value);
      return null;
    });
  };

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      <ConfirmContext.Provider value={confirm}>
        {children}

        {/* Toast stack */}
        <div className="fixed bottom-0 right-0 z-[100] flex flex-col gap-2 p-4 w-full max-w-sm pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto bg-background border-2 border-border shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] flex overflow-hidden"
            >
              <div className={`w-1.5 flex-shrink-0 ${VARIANT_BAR[t.variant ?? "default"]}`} />
              <div className="flex-1 p-3 sm:p-4">
                <p className="text-xs font-black uppercase tracking-[0.15em] leading-snug">{t.title}</p>
                {t.description && (
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground leading-relaxed whitespace-pre-line">
                    {t.description}
                  </p>
                )}
                {t.action && (
                  <button
                    className="mt-2 px-3 py-1 border-2 border-foreground text-[10px] font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                aria-label="Dismiss notification"
                className="px-3 text-muted-foreground hover:text-foreground text-lg font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => dismiss(t.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Confirm dialog */}
        {confirmState && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <div className="bg-background border-2 border-border shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] flex flex-col w-full max-w-md">
              <div className="p-6 border-b-2 border-border">
                <h2 className="text-2xl font-black uppercase tracking-tighter">{confirmState.title}</h2>
                {confirmState.message && (
                  <p className="mt-2 text-sm font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">
                    {confirmState.message}
                  </p>
                )}
              </div>
              <div className="flex">
                <button
                  className="flex-1 p-4 font-black uppercase tracking-widest border-r-2 border-border hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => closeConfirm(false)}
                >
                  {confirmState.cancelLabel || "Cancel"}
                </button>
                <button
                  autoFocus
                  className={`flex-1 p-4 font-black uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    confirmState.destructive
                      ? "bg-destructive text-destructive-foreground hover:opacity-90"
                      : "bg-foreground text-background hover:bg-background hover:text-foreground"
                  }`}
                  onClick={() => closeConfirm(true)}
                >
                  {confirmState.confirmLabel || "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

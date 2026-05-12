"use client";

import * as React from "react";
import { Dialog } from "radix-ui";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
};

type DialogState = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

const ConfirmContext = React.createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmDialogProvider>");
  return ctx;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DialogState | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const handleResponse = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog.Root open={!!state} onOpenChange={(open) => !open && handleResponse(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              {state?.title}
            </Dialog.Title>
            {state?.description && (
              <Dialog.Description className="mt-2 text-sm text-slate-700">
                {state.description}
              </Dialog.Description>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => handleResponse(false)}
                className="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                {state?.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => handleResponse(true)}
                className={`cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  state?.tone === "destructive"
                    ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
                    : "bg-orange-600 hover:bg-orange-700 focus-visible:ring-orange-500"
                }`}
              >
                {state?.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmContext.Provider>
  );
}

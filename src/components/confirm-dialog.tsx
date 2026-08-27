"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  if (!ctx)
    throw new Error("useConfirm must be used within <ConfirmDialogProvider>");
  return ctx;
}

export function ConfirmDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<DialogState | null>(null);
  // The element that had focus when `confirm()` was called. Radix AlertDialog
  // only restores focus to a `<AlertDialogTrigger>`; this provider drives
  // `open` manually, so we capture the active element ourselves and restore
  // focus to it when the dialog closes — otherwise focus drops to <body>.
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      triggerRef.current =
        (document.activeElement as HTMLElement | null) ?? null;
      setState({ ...opts, resolve });
    });
  }, []);

  const handleResponse = (value: boolean) => {
    state?.resolve(value);
    setState(null);
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger && typeof trigger.focus === "function") {
      // Defer until after Radix unmounts the dialog content.
      requestAnimationFrame(() => trigger.focus());
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={!!state}
        onOpenChange={(open) => !open && handleResponse(false)}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // Radix will move focus to the content; we override and send it
            // back to the original trigger ourselves.
            event.preventDefault();
            const trigger = triggerRef.current;
            if (trigger && typeof trigger.focus === "function") {
              trigger.focus();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{state?.title}</AlertDialogTitle>
            {state?.description ? (
              <AlertDialogDescription>
                {state.description}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleResponse(false)}>
              {state?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleResponse(true)}
              className={cn(
                state?.tone === "destructive" &&
                  buttonVariants({ variant: "destructive" }),
              )}
            >
              {state?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

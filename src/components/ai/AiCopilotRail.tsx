"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/components/toast";
import { stashAdoptionContext } from "@/lib/api/adoption";
import { useSession } from "@/lib/session";
import type {
  AiMode,
  AiSuggestion,
  AiSuggestionScope,
  DocType,
} from "@/types";
import {
  getAiSuggestions,
  persistSuggestionDismissal,
  recordQueuedAction,
} from "@/lib/api/ai";
import { AiChatPanel } from "./AiChatPanel";

/**
 * AI Co-pilot rail — a doc-aware assistant panel.
 *
 * Renders inside `DocumentLayout`'s `rightRail`. Driven by `AiSuggestion[]`
 * returned by `getAiSuggestions(scope)`.
 *
 * Modes:
 *   - observe : show suggestions, no action buttons.
 *   - suggest : show "Do it" buttons; clicking executes immediately (the
 *               relevant /new form opens with adoption pre-filled).
 *   - auto    : "Do it" instead queues the action to the human approval
 *               inbox with a `bot-proposed` badge.
 */

const MODE_KEY = "atmata.ai.mode";

export type AiCopilotRailProps = {
  locale: string;
  scope: AiSuggestionScope;
  /** Pre-fetched suggestions (from server component). If omitted and
   *  supplied, the rail fetches suggestions through the Server Action. */
  suggestions?: AiSuggestion[];
};

export function AiCopilotRail({ locale, scope, suggestions: initialSuggestions }: AiCopilotRailProps) {
  const router = useRouter();
  const session = useSession();
  const t = useTranslations("ai");
  const [mode, setMode] = React.useState<AiMode>("suggest");
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<AiSuggestion[]>(
    initialSuggestions ?? [],
  );

  // Client-side fetch when no initial suggestions provided and backend is enabled
  React.useEffect(() => {
    if (initialSuggestions && initialSuggestions.length > 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    getAiSuggestions(scope, locale === "ar" ? "ar" : "en")
      .then((result) => {
        if (!cancelled) {
          setSuggestions(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load suggestions");
          // eslint-disable-next-line no-console
          console.info("atmata:event", "ai.suggestions.error", { error: String(err) });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [scope, initialSuggestions]);

  React.useEffect(() => {
    try {
      const m = window.sessionStorage.getItem(MODE_KEY) as AiMode | null;
      if (m === "observe" || m === "suggest" || m === "auto") setMode(m);
    } catch {
      /* ignore */
    }
  }, []);

  const changeMode = (next: AiMode) => {
    setMode(next);
    try {
      window.sessionStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line no-console
    console.info("atmata:event", "ai.mode.change", { mode: next });
  };

  const dismiss = async (id: string) => {
    const persisted = await persistSuggestionDismissal(id);
    if (!persisted) {
      toast.error(t("error"));
      return;
    }
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // eslint-disable-next-line no-console
    console.info("atmata:event", "ai.suggestion.dismiss", { id });
  };

  const runAction = async (s: AiSuggestion) => {
    const a = s.primaryAction;
    if (!a) return;
    if (mode === "auto") {
      if (!a.actionName) {
        toast.error(t("notQueueable"));
        return;
      }
      const queued = await recordQueuedAction({
        suggestionId: s.id,
        scope: s.scope,
        label: a.label,
        action: a.actionName,
        payload: a.actionPayload ?? {},
        proposedByBot: true,
      });
      if (!queued) {
        toast.error(t("error"));
        return;
      }
      toast.success(t("queued"));
      return;
    }
    // suggest mode: execute immediately
    if (a.payload) {
      stashAdoptionContext(a.payload);
      const href = newHrefFor(a.payload.targetType, locale);
      if (href) router.push(href);
    } else if (a.href) {
      router.push(a.href);
    }
    // eslint-disable-next-line no-console
    console.info("atmata:event", "ai.suggestion.accept", { id: s.id });
  };

  const visible = suggestions.filter((s) => !dismissed.has(s.id));
  const isAgent = session.role === "ai_agent";

  return (
    <div className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            ai
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {isAgent ? t("asAgent") : t("copilotTitle")}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {scope.kind === "doc" ? `${scope.docType}` : "list"}
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label={collapsed ? "Expand" : "Collapse"}
          onClick={() => setCollapsed((v) => !v)}
          className="cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          {collapsed ? "▾" : "▴"}
        </button>
      </header>

      {!collapsed ? (
        <div className="space-y-3 p-3">
          <ModeSegmented mode={mode} onChange={changeMode} t={t} />

          {loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <div className="rounded-md border border-dashed border-status-danger-border bg-status-danger-muted p-3 text-xs text-status-danger-foreground">
              {t("error")}: {error}
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            visible.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                mode={mode}
                onAct={() => void runAction(s)}
                onDismiss={() => void dismiss(s.id)}
                t={t}
              />
            ))
          )}
          <AiChatPanel locale={locale} onSuggestionAct={(suggestion) => void runAction(suggestion)} />
        </div>
      ) : null}
    </div>
  );
}

type AiTranslator = (key: string, values?: Record<string, string | number | Date>) => string;

function ModeSegmented({
  mode,
  onChange,
  t,
}: {
  mode: AiMode;
  onChange: (m: AiMode) => void;
  t: AiTranslator;
}) {
  const opts: { id: AiMode; label: string; title: string }[] = [
    { id: "observe", label: t("mode.observe"), title: "Show suggestions without action buttons." },
    { id: "suggest", label: t("mode.suggest"), title: "Show suggestions; one-tap accept opens the relevant form." },
    { id: "auto", label: t("mode.auto"), title: "Queue accepted actions to the approval inbox with a bot-proposed badge." },
  ];
  return (
    <div role="tablist" className="flex rounded-md border border-border bg-muted/50 p-0.5 text-xs">
      {opts.map((o) => {
        const active = mode === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={
              "flex-1 cursor-pointer rounded-md px-2 py-1 " +
              (active ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SuggestionCard({
  suggestion: s,
  mode,
  onAct,
  onDismiss,
  t,
}: {
  suggestion: AiSuggestion;
  mode: AiMode;
  onAct: () => void;
  onDismiss: () => void;
  t: AiTranslator;
}) {
  const tone =
    s.severity === "critical"
      ? "border-status-danger-border bg-status-danger-muted"
      : s.severity === "warning"
        ? "border-status-pending-border bg-status-pending-muted"
        : s.severity === "advice"
          ? "border-primary/30 bg-primary/10"
          : "border-border bg-muted/50";

  return (
    <div className={`rounded-md border p-3 text-sm ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-foreground">{s.title}</div>
          <div className="mt-0.5 text-xs text-foreground">{s.rationale}</div>
        </div>
        <ConfidenceChip value={s.confidence} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {s.primaryAction && mode !== "observe" ? (
          <button
            type="button"
            onClick={onAct}
            className="cursor-pointer rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary"
          >
            {mode === "auto" ? `${t("queue")}: ${s.primaryAction.label}` : `${t("doIt")}: ${s.primaryAction.label}`}
          </button>
        ) : (
          <span />
        )}
        {s.dismissable ? (
          <button
            type="button"
            onClick={onDismiss}
            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
          >
            {t("dismiss")}
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

/** Loading skeleton shown while AI suggestions are being fetched. */
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {["s1", "s2", "s3"].map((key) => (
        <div
          key={key}
          className="animate-pulse rounded-md border border-border bg-muted/50 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-full rounded bg-muted" />
            </div>
            <div className="h-5 w-12 shrink-0 rounded-full bg-muted" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-6 w-24 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfidenceChip({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    pct >= 90 ? "bg-status-success-muted text-status-success-foreground" : pct >= 70 ? "bg-primary/10 text-primary" : "bg-muted text-foreground";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums ${tone}`}
      title="AI confidence"
    >
      {pct}%
    </span>
  );
}

function newHrefFor(t: DocType, locale: string): string | null {
  switch (t) {
    case "rfq": return `/${locale}/purchasing/rfqs/new`;
    case "po": return `/${locale}/purchasing/purchase-orders/new`;
    case "grn": return `/${locale}/purchasing/goods-receipts/new`;
    case "vendor_bill": return `/${locale}/purchasing/bills/new`;
    case "vendor_payment": return `/${locale}/purchasing/payments/new`;
    case "vendor_return": return `/${locale}/purchasing/vendor-returns/new`;
    case "so": return `/${locale}/sales/orders/new`;
    case "dn": return `/${locale}/sales/deliveries/new`;
    case "customer_invoice": return `/${locale}/sales/invoices/new`;
    case "customer_receipt": return `/${locale}/sales/receipts/new`;
    case "customer_return": return `/${locale}/sales/returns/new`;
    default: return null;
  }
}

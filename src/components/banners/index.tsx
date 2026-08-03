/**
 * Banners — visual surfaces that explain WHY the UI is in a degraded /
 * blocked / warning state. One component per edge case so they can be
 * imported individually and rendered in context.
 *
 * All banners are server-renderable (no client hooks). They take their
 * data as props so the seed-driven "every banner has a clickable example"
 * promise can be honored from `/...` pages directly.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "warn" | "block" | "good";

/** Tones resolve to the shared status tokens so banners theme with the app. */
const TONES: Record<Tone, string> = {
  info: "border-status-info-border bg-status-info-muted text-status-info-foreground",
  warn: "border-status-pending-border bg-status-pending-muted text-status-pending-foreground",
  block: "border-status-danger-border bg-status-danger-muted text-status-danger-foreground",
  good: "border-status-success-border bg-status-success-muted text-status-success-foreground",
};

const ICONS: Record<Tone, LucideIcon> = {
  info: Info,
  warn: TriangleAlert,
  block: AlertCircle,
  good: CheckCircle2,
};

function Banner({
  tone,
  title,
  body,
  action,
}: {
  tone: Tone;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = ICONS[tone];

  return (
    <div
      role="alert"
      className={cn("flex gap-3 rounded-lg border p-3 text-sm", TONES[tone])}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          {body ? <div className="mt-1 opacity-90">{body}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export function DemoModeBanner() {
  return (
    <Banner
      tone="info"
      title="Demo · this action will not persist"
      body="Atmata frontend is read-only in this branch; the backend team will swap toasts for real fetch later."
    />
  );
}

export function PeriodLockBanner({
  status,
  date,
}: {
  status: "soft_closed" | "hard_closed";
  date: string;
}) {
  if (status === "hard_closed") {
    return (
      <Banner
        tone="block"
        title="Period hard-closed"
        body={`Date ${date} falls in a hard-closed fiscal period. Posting is blocked — re-date to the next open period to proceed.`}
      />
    );
  }
  return (
    <Banner
      tone="warn"
      title="Period soft-closed"
      body={`Date ${date} falls in a soft-closed fiscal period. Only users with the \`period_adjust\` role can post here.`}
    />
  );
}

export function CreditHoldBanner({ exposure, limit }: { exposure: number; limit: number }) {
  return (
    <Banner
      tone="block"
      title="Customer on credit hold"
      body={`Open exposure ${exposure.toLocaleString()} > credit limit ${limit.toLocaleString()}. SO confirm blocked until exposure clears or the limit is raised.`}
    />
  );
}

export function CreditLimitWarning({
  exposure,
  limit,
}: {
  exposure: number;
  limit: number;
}) {
  const pct = Math.round((exposure / limit) * 100);
  return (
    <Banner
      tone="warn"
      title={`Customer at ${pct}% of credit limit`}
      body={`Exposure ${exposure.toLocaleString()} / limit ${limit.toLocaleString()}. Confirm allowed but flag for review on next payment cycle.`}
    />
  );
}

export function OverReceiveBanner({
  ordered,
  alreadyReceived,
  thisReceipt,
}: {
  ordered: number;
  alreadyReceived: number;
  thisReceipt: number;
}) {
  const newTotal = alreadyReceived + thisReceipt;
  return (
    <Banner
      tone="warn"
      title="Over-receive"
      body={`Ordered ${ordered}, already received ${alreadyReceived}, this receipt ${thisReceipt}. New total ${newTotal} exceeds PO line. Requires approver override.`}
    />
  );
}

export function DuplicateBillBanner({
  existingBillId,
  existingNumber,
  locale,
}: {
  existingBillId: string;
  existingNumber: string;
  locale: string;
}) {
  return (
    <Banner
      tone="warn"
      title="Duplicate vendor invoice number"
      body={`This vendor invoice number was already used on ${existingNumber}. Confirm this is not a re-submission before posting.`}
      action={
        <Link
          href={`/${locale}/purchasing/bills/${existingBillId}`}
          className="ring-current/25 hover:bg-current/10 rounded-md px-2 py-1 text-xs font-medium ring-1 transition-colors"
        >
          View existing
        </Link>
      }
    />
  );
}

export function ExpiredQuoteBanner({ validUntil }: { validUntil: string }) {
  return (
    <Banner
      tone="block"
      title="Quote expired"
      body={`This quote expired on ${validUntil}. Cannot be converted to a sales order — re-issue a new quote to the customer.`}
    />
  );
}

export function ConcurrentEditBanner({
  by,
  at,
  onReload,
}: {
  by: string;
  at: string;
  onReload?: ReactNode;
}) {
  return (
    <Banner
      tone="warn"
      title="Document modified in another session"
      body={`${by} updated this document at ${at}. Reload to see their changes, or keep editing and resolve on save.`}
      action={onReload}
    />
  );
}

export function PermissionDeniedBanner({
  requiredRoles,
  currentRole,
}: {
  requiredRoles: string[];
  currentRole: string;
}) {
  return (
    <Banner
      tone="block"
      title="Permission required"
      body={`You are signed in as \`${currentRole}\`. This action needs one of: ${requiredRoles.join(", ")}.`}
    />
  );
}

export function InsufficientStockBanner({
  productName,
  available,
  required,
  warehouseName,
}: {
  productName: string;
  available: number;
  required: number;
  warehouseName: string;
}) {
  return (
    <Banner
      tone="block"
      title="Insufficient stock"
      body={`${productName}: ${available} available at ${warehouseName}, ${required} required. Suggest internal transfer or reduce qty.`}
    />
  );
}

export function FxRateBanner({
  docCurrency,
  baseCurrency,
}: {
  docCurrency: string;
  baseCurrency: string;
}) {
  return (
    <Banner
      tone="info"
      title={`Foreign-currency document (${docCurrency})`}
      body={`Active company base currency is ${baseCurrency}. An FX rate must be set before posting; converted-base amounts feed the GL.`}
    />
  );
}

export function LotRequiredBanner() {
  return (
    <Banner
      tone="block"
      title="Lot required"
      body="One or more lines reference a lot-tracked product without a lot. Pick a lot per line before submitting."
    />
  );
}

export function PostedWatermarkBanner() {
  return (
    <Banner
      tone="block"
      title="Document posted — read-only"
      body="Posted documents are immutable. Corrections must happen via the appropriate counter-document (Credit Note, Debit Note, Reversal)."
    />
  );
}

import type { CustomerInvoice } from "@/types";

export function FatooraQrPlaceholder({
  invoice,
  sellerVat,
}: {
  invoice: CustomerInvoice;
  sellerVat: string;
}) {
  const payload =
    invoice.fatoora?.qrPayload ??
    [
      sellerVat,
      invoice.number,
      invoice.date,
      invoice.total.toFixed(2),
      invoice.taxTotal.toFixed(2),
    ].join("|");

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
      <div className="flex items-start gap-4">
        <div
          className="grid h-32 w-32 shrink-0 grid-cols-8 grid-rows-8 gap-px rounded bg-white p-1.5 ring-1 ring-emerald-300"
          aria-label="FATOORA QR placeholder"
        >
          {Array.from({ length: 64 }).map((_, i) => (
            <div
              key={i}
              className={
                ((i * 31 + 17) % 7 < 3 ? "bg-emerald-950" : "bg-white") + " rounded-[1px]"
              }
            />
          ))}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-wide text-emerald-900 uppercase">
            FATOORA · Saudi e-invoicing
          </div>
          <div className="mt-1 text-emerald-900">
            QR placeholder — full TLV payload generated server-side at post-time.
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            <div className="text-emerald-800">Seller VAT</div>
            <div className="font-mono">{sellerVat}</div>
            <div className="text-emerald-800">Buyer VAT</div>
            <div className="font-mono">{invoice.fatoora?.buyerVat ?? "—"}</div>
            <div className="text-emerald-800">Invoice #</div>
            <div className="font-mono">{invoice.number}</div>
            <div className="text-emerald-800">QR payload (preview)</div>
            <div className="truncate font-mono text-[10px]">{payload}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

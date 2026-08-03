"use client";

import * as React from "react";
import { FatooraQrPlaceholder } from "./FatooraQr";
import type { Company, Customer, CustomerInvoice } from "@/types";

/**
 * SaudiInvoicePrint — bilingual EN/AR print stylesheet for SA invoices.
 *
 * Click "Print invoice" on a Customer Invoice detail (only rendered for
 * SA-profile companies). The dialog renders inline; printing via the
 * browser dialog uses the `print:` Tailwind variants to show only the
 * invoice block.
 */

export function SaudiInvoicePrint({
  invoice,
  company,
  customer,
  open,
  onClose,
}: {
  invoice: CustomerInvoice;
  company: Company;
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const subtotal = invoice.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 print:relative print:inset-auto print:z-auto print:bg-transparent print:p-0">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl print:max-h-none print:rounded-none print:border-0 print:shadow-none">
        {/* Toolbar — hidden in print. */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-3 print:hidden">
          <h2 className="text-sm font-semibold text-foreground">
            Print preview · Bilingual SA invoice
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary"
            >
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              Close
            </button>
          </div>
        </header>

        {/* Printable area. */}
        <div className="grid gap-6 p-6 print:p-0">
          <div className="grid grid-cols-2 gap-4 border-b border-border pb-4">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Seller / البائع</div>
              <div className="font-semibold text-foreground">{company.name}</div>
              <div className="text-xs text-muted-foreground" dir="rtl">
                الشركة: {company.name}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">VAT: {company.vatNumber}</div>
              <div className="text-xs text-muted-foreground" dir="rtl">
                الرقم الضريبي: {company.vatNumber}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase text-muted-foreground">Invoice / فاتورة</div>
              <div className="font-mono text-sm">{invoice.number}</div>
              <div className="text-xs text-muted-foreground">Date: {invoice.date}</div>
              <div className="text-xs text-muted-foreground" dir="rtl">
                التاريخ: {invoice.date}
              </div>
              <div className="text-xs text-muted-foreground">Due: {invoice.dueDate}</div>
              <div className="text-xs text-muted-foreground" dir="rtl">
                الاستحقاق: {invoice.dueDate}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase text-muted-foreground">Buyer / المشتري</div>
            <div className="font-semibold text-foreground">{customer?.name ?? "—"}</div>
            <div className="text-xs text-muted-foreground">VAT: {customer?.vatNumber ?? "—"}</div>
            <div className="text-xs text-muted-foreground" dir="rtl">
              الرقم الضريبي: {customer?.vatNumber ?? "—"}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="border-b border-input text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">Description / الوصف</th>
                <th className="px-2 py-2 text-right">Qty / الكمية</th>
                <th className="px-2 py-2 text-right">Unit / السعر</th>
                <th className="px-2 py-2 text-right">Total / الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoice.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-2 py-2">{l.description}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.qty}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.unitPrice.toFixed(3)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {(l.qty * l.unitPrice).toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border text-sm">
              <tr>
                <td colSpan={3} className="px-2 py-2 text-right text-muted-foreground">
                  Subtotal / الإجمالي الفرعي
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{subtotal.toFixed(3)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-2 py-2 text-right text-muted-foreground">
                  VAT / ضريبة القيمة المضافة
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {(invoice.taxTotal ?? 0).toFixed(3)}
                </td>
              </tr>
              <tr>
                <td colSpan={3} className="px-2 py-2 text-right font-semibold">
                  Total / الإجمالي
                </td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">
                  {invoice.total.toFixed(3)} {invoice.currency}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="border-t border-border pt-4">
            <FatooraQrPlaceholder invoice={invoice} sellerVat={company.vatNumber} />
          </div>
        </div>
      </div>

      {/* Print CSS — hide everything outside this dialog when printing. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .fixed.inset-0, .fixed.inset-0 * { visibility: visible !important; }
        }
      `}</style>
    </div>
  );
}

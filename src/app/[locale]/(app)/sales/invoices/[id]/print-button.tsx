"use client";

import * as React from "react";
import { SaudiInvoicePrint } from "@/components/doc/SaudiInvoicePrint";
import type { Company, Customer, CustomerInvoice } from "@/types";

export function SaudiInvoicePrintButton({
  invoice,
  company,
  customer,
}: {
  invoice: CustomerInvoice;
  company: Company;
  customer: Customer | null;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-md border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
      >
        Print invoice (EN/AR)
      </button>
      <SaudiInvoicePrint
        invoice={invoice}
        company={company}
        customer={customer}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

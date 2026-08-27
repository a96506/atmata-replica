"use server";

import "server-only";

import type { ActionResult } from "@/lib/actions/result";
import { createRequestId, normalizeActionError } from "@/lib/actions/errors";
import {
  listAccounts,
  listJournalEntries,
} from "@/lib/api/gl";
import {
  listCustomers,
  listSuppliers,
  listProducts,
} from "@/lib/api/master";
import { listCustomerInvoices } from "@/lib/api/q2c";
import { listVendorBills } from "@/lib/api/p2p";

/**
 * Bulk company-data export. Returns the core tables already-fetched by the
 * signed-in company (RLS scopes every read). The client builds CSVs and
 * downloads them — no JSZip dependency, just sequential downloads.
 *
 * Defensive: each table read is independent; a failure on one table (e.g. RLS
 * denial on a table the company cannot read) degrades to an empty array
 * rather than failing the whole export.
 */
export type CompanyDataExport = {
  products: Awaited<ReturnType<typeof listProducts>>;
  customers: Awaited<ReturnType<typeof listCustomers>>;
  suppliers: Awaited<ReturnType<typeof listSuppliers>>;
  invoices: Awaited<ReturnType<typeof listCustomerInvoices>>;
  bills: Awaited<ReturnType<typeof listVendorBills>>;
  journalEntries: Awaited<ReturnType<typeof listJournalEntries>>;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
};

export async function exportCompanyDataAction(): Promise<
  ActionResult<CompanyDataExport>
> {
  const requestId = createRequestId();
  try {
    const safe = <T>(p: Promise<T>): Promise<T> =>
      p.catch(() => [] as unknown as T);
    const [products, customers, suppliers, invoices, bills, journalEntries, accounts] =
      await Promise.all([
        safe(listProducts()),
        safe(listCustomers()),
        safe(listSuppliers()),
        safe(listCustomerInvoices()),
        safe(listVendorBills()),
        safe(listJournalEntries()),
        safe(listAccounts()),
      ]);
    return {
      ok: true,
      data: {
        products,
        customers,
        suppliers,
        invoices,
        bills,
        journalEntries,
        accounts,
      },
    };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

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
 * Each table is independent: success with zero rows is distinct from a read
 * failure (e.g. RLS denial). Failures are listed in `failedTables` so the UI
 * can toast incorrectly empty vs truly empty.
 */
export type TableExportSlice<T> = {
  rows: T[];
  /** True when the table read threw (not merely empty). */
  failed: boolean;
};

export type CompanyDataExport = {
  products: TableExportSlice<Awaited<ReturnType<typeof listProducts>>[number]>;
  customers: TableExportSlice<Awaited<ReturnType<typeof listCustomers>>[number]>;
  suppliers: TableExportSlice<Awaited<ReturnType<typeof listSuppliers>>[number]>;
  invoices: TableExportSlice<
    Awaited<ReturnType<typeof listCustomerInvoices>>[number]
  >;
  bills: TableExportSlice<Awaited<ReturnType<typeof listVendorBills>>[number]>;
  journalEntries: TableExportSlice<
    Awaited<ReturnType<typeof listJournalEntries>>[number]
  >;
  accounts: TableExportSlice<Awaited<ReturnType<typeof listAccounts>>[number]>;
  /** Table keys that failed to load (empty `rows` is not enough to tell). */
  failedTables: string[];
};

async function safeTable<T>(
  name: string,
  p: Promise<T[]>,
): Promise<{ name: string; slice: TableExportSlice<T> }> {
  try {
    const rows = await p;
    return { name, slice: { rows, failed: false } };
  } catch {
    return { name, slice: { rows: [], failed: true } };
  }
}

export async function exportCompanyDataAction(): Promise<
  ActionResult<CompanyDataExport>
> {
  const requestId = createRequestId();
  try {
    const results = await Promise.all([
      safeTable("products", listProducts()),
      safeTable("customers", listCustomers()),
      safeTable("suppliers", listSuppliers()),
      safeTable("invoices", listCustomerInvoices()),
      safeTable("bills", listVendorBills()),
      safeTable("journal-entries", listJournalEntries()),
      safeTable("accounts", listAccounts()),
    ]);
    const byName = Object.fromEntries(
      results.map((r) => [r.name, r.slice]),
    ) as Record<string, TableExportSlice<unknown>>;
    const failedTables = results
      .filter((r) => r.slice.failed)
      .map((r) => r.name);
    return {
      ok: true,
      data: {
        products: byName.products as CompanyDataExport["products"],
        customers: byName.customers as CompanyDataExport["customers"],
        suppliers: byName.suppliers as CompanyDataExport["suppliers"],
        invoices: byName.invoices as CompanyDataExport["invoices"],
        bills: byName.bills as CompanyDataExport["bills"],
        journalEntries: byName[
          "journal-entries"
        ] as CompanyDataExport["journalEntries"],
        accounts: byName.accounts as CompanyDataExport["accounts"],
        failedTables,
      },
    };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

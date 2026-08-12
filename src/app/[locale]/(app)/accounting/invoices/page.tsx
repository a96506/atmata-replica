import { listOcrJobs } from "@/lib/actions/invoices";
import { InvoicesClient } from "./invoices-client";
import type { DocumentJob } from "@/lib/demo-data";

export default async function InvoicesPage() {
  const jobs = await listOcrJobs();
  // Map DB rows (camelCase) to the existing DocumentJob shape (snake_case
  // keys the invoices-client expects). The list UI is unchanged.
  const initialInvoices: DocumentJob[] = jobs.map((j) => ({
    job_id: j.id,
    file_name: j.fileName,
    document_type: "invoice",
    status: j.status,
    confidence: j.confidence ?? 0,
    matched_vendor_name:
      (j.extraction.vendor as string | undefined) ??
      (j.extraction.vendor_name as string | undefined) ??
      "",
    extraction: j.extraction.vendor
      ? {
          vendor: j.extraction.vendor as string,
          total: (j.extraction.total as number | undefined) ?? 0,
          currency: (j.extraction.currency as string | undefined) ?? "KWD",
        }
      : null,
    matched_doc_id: j.matchedDocId,
    created_at: j.createdAt,
  }));
  return <InvoicesClient initialInvoices={initialInvoices} />;
}

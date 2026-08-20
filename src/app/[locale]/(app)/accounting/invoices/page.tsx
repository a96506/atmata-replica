import { listOcrJobs } from "@/lib/actions/invoices";
import { parseOcrExtraction } from "@/lib/ocr/vendor-bill-extraction";
import { InvoicesClient } from "./invoices-client";
import type { DocumentJob } from "@/lib/demo-data";

export default async function InvoicesPage() {
  const jobs = await listOcrJobs();
  // Map DB rows (camelCase) to the existing DocumentJob shape (snake_case
  // keys the invoices-client expects). The list UI is unchanged.
  const initialInvoices: DocumentJob[] = jobs.map((j) => {
    const ext = parseOcrExtraction(j.extraction);
    return {
      job_id: j.id,
      file_name: j.fileName,
      document_type: "invoice",
      status: j.status,
      confidence: j.confidence ?? 0,
      matched_vendor_name: ext.vendor,
      extraction: ext.vendor
        ? {
            vendor: ext.vendor,
            total: ext.total,
            currency: ext.currency || "KWD",
          }
        : null,
      matched_doc_id: j.matchedDocId,
      created_at: j.createdAt,
    };
  });
  return <InvoicesClient initialInvoices={initialInvoices} />;
}

import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";

const SEQUENCES = [
  { docType: "pr", prefix: "PR", format: "PR-YYYY-#####", lastUsed: "PR-2026-00001" },
  { docType: "rfq", prefix: "RFQ", format: "RFQ-YYYY-#####", lastUsed: "RFQ-2026-00001" },
  { docType: "po", prefix: "PO", format: "PO-YYYY-#####", lastUsed: "PO-2026-00005" },
  { docType: "grn", prefix: "GRN", format: "GRN-YYYY-#####", lastUsed: "GRN-2026-00002" },
  { docType: "vendor_bill", prefix: "BILL", format: "BILL-YYYY-#####", lastUsed: "BILL-2026-00004" },
  { docType: "vendor_payment", prefix: "VPAY", format: "VPAY-YYYY-#####", lastUsed: "VPAY-2026-00001" },
  { docType: "vendor_return", prefix: "VR", format: "VR-YYYY-#####", lastUsed: "VR-2026-00001" },
  { docType: "debit_note", prefix: "DN", format: "DN-YYYY-#####", lastUsed: "DN-2026-00001" },
  { docType: "quote", prefix: "QT", format: "QT-YYYY-#####", lastUsed: "QT-2026-00004" },
  { docType: "so", prefix: "SO", format: "SO-YYYY-#####", lastUsed: "SO-2026-00002" },
  { docType: "dn", prefix: "DEL", format: "DEL-YYYY-#####", lastUsed: "DEL-2026-00001" },
  { docType: "customer_invoice", prefix: "INV", format: "INV-YYYY-#####", lastUsed: "INV-2026-00001" },
  { docType: "customer_receipt", prefix: "RCP", format: "RCP-YYYY-#####", lastUsed: "RCP-2026-00001" },
  { docType: "customer_return", prefix: "CR", format: "CR-YYYY-#####", lastUsed: "CR-2026-00001" },
  { docType: "credit_note", prefix: "CN", format: "CN-YYYY-#####", lastUsed: "CN-2026-00001" },
];

export default async function Page() {
  return (
    <DocumentList
      title="Document sequences"
      subtitle="Per doc-type prefix and format. New documents preview their number as 'Will be assigned on post'."
    >
      <DataTable
        columns={[
          { key: "doc", label: "Doc type" },
          { key: "prefix", label: "Prefix" },
          { key: "format", label: "Format" },
          { key: "last", label: "Last used" },
        ]}
        rows={SEQUENCES.map((s) => [s.docType, s.prefix, s.format, s.lastUsed])}
      />
    </DocumentList>
  );
}

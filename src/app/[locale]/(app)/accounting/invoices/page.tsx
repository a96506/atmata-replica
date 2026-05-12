import { DEMO_INVOICES } from "@/lib/demo-data";
import { InvoicesClient } from "./invoices-client";

export default function InvoicesPage() {
  return <InvoicesClient initialInvoices={DEMO_INVOICES} />;
}

import { DocumentList } from "@/components/doc/DocumentList";
import { listFiscalPeriods } from "@/lib/api/master";
import { FiscalCalendarGrid } from "./fiscal-calendar-grid";

export default async function Page() {
  const periods = await listFiscalPeriods();
  return (
    <DocumentList
      title="Fiscal calendar"
      subtitle="Soft-close warns; hard-close blocks posting at the form. Year-end enables once every month is hard-closed."
    >
      <FiscalCalendarGrid initialPeriods={periods} />
    </DocumentList>
  );
}

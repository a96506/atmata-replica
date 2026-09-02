"use client";

export type LineItemRow = {
  id: string;
  description: string;
  qty: number;
  unit_price: number;
};

function newRowId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEmptyLineItem(): LineItemRow {
  return { id: newRowId(), description: "", qty: 1, unit_price: 0 };
}

export function lineItemsGrandTotal(items: LineItemRow[]): number {
  return items.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.unit_price) || 0), 0);
}

export type LineItemsEditorLabels = {
  itemNo: string;
  description: string;
  qty: string;
  unitPrice: string;
  total: string;
  addRow: string;
  removeRow: string;
  /** Header cell above the remove action column (often empty). */
  actionsHeader: string;
  footerGrandTotal: string;
};

type LineItemsEditorProps = {
  items: LineItemRow[];
  onChange: (items: LineItemRow[]) => void;
  readOnly?: boolean;
  labels: LineItemsEditorLabels;
};

export function LineItemsEditor({ items, onChange, readOnly, labels }: LineItemsEditorProps) {
  const ro = !!readOnly;

  const updateRow = (id: string, patch: Partial<Omit<LineItemRow, "id">>) => {
    onChange(items.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    if (items.length <= 1) return;
    onChange(items.filter((r) => r.id !== id));
  };

  const addRow = () => {
    onChange([...items, createEmptyLineItem()]);
  };

  const footerTotal = lineItemsGrandTotal(items);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-start text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs font-medium tracking-wide text-foreground uppercase">
            <tr>
              <th className="w-10 px-3 py-2">{labels.itemNo}</th>
              <th className="min-w-[140px] px-3 py-2">{labels.description}</th>
              <th className="w-24 px-3 py-2">{labels.qty}</th>
              <th className="w-28 px-3 py-2">{labels.unitPrice}</th>
              <th className="w-28 px-3 py-2 text-end">{labels.total}</th>
              {!ro && (
                <th className="w-24 px-3 py-2 text-end text-muted-foreground">{labels.actionsHeader}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((row, idx) => {
              const lineTotal = (Number(row.qty) || 0) * (Number(row.unit_price) || 0);
              return (
                <tr key={row.id}>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.description}
                      disabled={ro}
                      onChange={(e) => updateRow(row.id, { description: e.target.value })}
                      className="w-full min-w-[120px] rounded border border-input px-2 py-1 text-sm disabled:bg-muted/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={Number.isNaN(row.qty) ? "" : row.qty}
                      disabled={ro}
                      onChange={(e) => updateRow(row.id, { qty: e.target.value === "" ? 0 : Number(e.target.value) })}
                      className="w-full rounded border border-input px-2 py-1 text-sm tabular-nums disabled:bg-muted/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={Number.isNaN(row.unit_price) ? "" : row.unit_price}
                      disabled={ro}
                      onChange={(e) =>
                        updateRow(row.id, {
                          unit_price: e.target.value === "" ? 0 : Number(e.target.value),
                        })
                      }
                      className="w-full rounded border border-input px-2 py-1 text-sm tabular-nums disabled:bg-muted/50"
                    />
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums font-medium text-foreground">
                    {lineTotal.toFixed(3)}
                  </td>
                  {!ro && (
                    <td className="px-3 py-2 text-end">
                      <button
                        type="button"
                        disabled={items.length <= 1}
                        onClick={() => removeRow(row.id)}
                        className="cursor-pointer text-xs text-muted-foreground underline decoration-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:text-muted-foreground/50 disabled:no-underline"
                      >
                        {labels.removeRow}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-border bg-muted/50">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-end text-xs font-medium text-muted-foreground uppercase">
                {labels.footerGrandTotal}
              </td>
              <td className="px-3 py-2 text-end text-sm font-semibold tabular-nums text-foreground">
                {footerTotal.toFixed(3)}
              </td>
              {!ro && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      {!ro && (
        <button
          type="button"
          onClick={addRow}
          className="cursor-pointer rounded-md border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          {labels.addRow}
        </button>
      )}
    </div>
  );
}

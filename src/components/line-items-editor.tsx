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
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium tracking-wide text-slate-700 uppercase">
            <tr>
              <th className="w-10 px-3 py-2">{labels.itemNo}</th>
              <th className="min-w-[140px] px-3 py-2">{labels.description}</th>
              <th className="w-24 px-3 py-2">{labels.qty}</th>
              <th className="w-28 px-3 py-2">{labels.unitPrice}</th>
              <th className="w-28 px-3 py-2 text-right">{labels.total}</th>
              {!ro && (
                <th className="w-24 px-3 py-2 text-right text-slate-500">{labels.actionsHeader}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((row, idx) => {
              const lineTotal = (Number(row.qty) || 0) * (Number(row.unit_price) || 0);
              return (
                <tr key={row.id}>
                  <td className="px-3 py-2 tabular-nums text-slate-600">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.description}
                      disabled={ro}
                      onChange={(e) => updateRow(row.id, { description: e.target.value })}
                      className="w-full min-w-[120px] rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
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
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm tabular-nums disabled:bg-slate-50"
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
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm tabular-nums disabled:bg-slate-50"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">
                    {lineTotal.toFixed(3)}
                  </td>
                  {!ro && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={items.length <= 1}
                        onClick={() => removeRow(row.id)}
                        className="cursor-pointer text-xs text-slate-600 underline decoration-slate-400 hover:text-red-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
                      >
                        {labels.removeRow}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-right text-xs font-medium text-slate-600 uppercase">
                {labels.footerGrandTotal}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-slate-900">
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
          className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          {labels.addRow}
        </button>
      )}
    </div>
  );
}

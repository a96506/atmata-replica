import { describe, expect, it } from "vitest";
import { toCsv, type CsvColumn } from "./csv";

type Row = { name: string; qty: number };

const columns: CsvColumn<Row>[] = [
  { label: "Name", value: (r) => r.name },
  { label: "Qty", value: (r) => r.qty },
];

describe("toCsv", () => {
  it("returns header-only CSV when rows are empty", () => {
    expect(toCsv([], columns)).toBe("Name,Qty");
  });

  it("includes header and data rows when non-empty", () => {
    const csv = toCsv(
      [
        { name: "Widget", qty: 3 },
        { name: "Gadget", qty: 1 },
      ],
      columns,
    );
    expect(csv).toBe("Name,Qty\r\nWidget,3\r\nGadget,1");
  });
});

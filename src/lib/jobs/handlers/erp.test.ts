import { describe, expect, it } from "vitest";

import { parseCbkLatest } from "@/lib/jobs/handlers/erp";

describe("erp job handler", () => {
  it("parses AllRatesToday CBK latest into kwdPer", () => {
    const table = parseCbkLatest(
      {
        rate_date: "2026-08-30",
        rates: [
          { base: "USD", quote: "KWD", value: 0.307 },
          { base: "SAR", quote: "KWD", value: 0.0818 },
          { base: "AED", quote: "KWD", value: 0.0835 },
        ],
      },
      "2026-08-31",
    );
    expect(table.publicationDate).toBe("2026-08-30");
    expect(table.kwdPer.USD).toBe(0.307);
    expect(table.kwdPer.SAR).toBe(0.0818);
    expect(table.kwdPer.AED).toBe(0.0835);
    expect(table.stale).toBe(false);
  });

  it("rejects missing required FX codes", () => {
    expect(() =>
      parseCbkLatest(
        {
          rate_date: "2026-08-30",
          rates: [{ base: "USD", quote: "KWD", value: 0.307 }],
        },
        "2026-08-31",
      ),
    ).toThrow(/missing SAR/);
  });
});

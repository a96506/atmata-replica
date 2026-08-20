import { describe, expect, it } from "vitest";
import { camelize } from "./case";

describe("camelize", () => {
  it("recursively maps nested rows while preserving values", () => {
    expect(
      camelize({
        row_version: 3,
        nested_rows: [{ tax_code_id: "tax_1", optional_value: null }],
        primitive: 7,
      }),
    ).toEqual({
      rowVersion: 3,
      nestedRows: [{ taxCodeId: "tax_1", optionalValue: null }],
      primitive: 7,
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  DataReadError,
  allPages,
  maybeOne,
  normalizeEmbeds,
  requireData,
} from "./read";

describe("database read helpers", () => {
  it.each([0, 499, 500, 501])("paginates %i rows without truncation", async (count) => {
    const source = Array.from({ length: count }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1),
      error: null,
    }));
    await expect(allPages(fetchPage, "rows")).resolves.toEqual(source);
    expect(fetchPage).toHaveBeenCalledTimes(Math.floor(count / 500) + 1);
  });

  it("distinguishes errors, missing rows and successful empty lists", () => {
    expect(maybeOne({ data: null, error: null }, "detail")).toBeNull();
    expect(requireData({ data: [], error: null }, "list")).toEqual([]);
    expect(() =>
      requireData({ data: null, error: { code: "42501" } }, "secure list"),
    ).toThrow(DataReadError);
  });

  it("sorts embedded lines and removes transport-only lineOrder", () => {
    expect(
      normalizeEmbeds({
        lines: [
          { id: "b", lineOrder: 2 },
          { id: "a", lineOrder: 1 },
        ],
      }),
    ).toEqual({ lines: [{ id: "a" }, { id: "b" }] });
  });

  it("preserves database ordering for root result arrays", () => {
    expect(normalizeEmbeds([{ id: "newest" }, { id: "oldest" }])).toEqual([
      { id: "newest" },
      { id: "oldest" },
    ]);
  });
});

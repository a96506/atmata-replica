import { describe, expect, it, vi } from "vitest";
import {
  ALL_PAGES_HARD_CAP,
  DataReadError,
  allPages,
  maybeOne,
  normalizeEmbeds,
  requireData,
} from "./read";
import { parseListPage } from "../list-paging";

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

  it("stops at ALL_PAGES_HARD_CAP instead of loading every row", async () => {
    // move to server-side pagination when a tenant table exceeds 1000 rows.
    const source = Array.from({ length: ALL_PAGES_HARD_CAP + 500 }, (_, id) => ({
      id,
    }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1),
      error: null,
    }));
    const rows = await allPages(fetchPage, "capped");
    expect(rows).toHaveLength(ALL_PAGES_HARD_CAP);
    expect(rows[ALL_PAGES_HARD_CAP - 1]).toEqual({ id: ALL_PAGES_HARD_CAP - 1 });
    // Two 500-row chunks fill the 1000-row hard cap; no third fetch.
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 499);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 500, 999);
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

describe("parseListPage", () => {
  it("defaults to page 1 and limit 50", () => {
    expect(parseListPage({})).toEqual({ page: 1, limit: 50, offset: 0 });
  });

  it("maps 1-based page to offset", () => {
    expect(parseListPage({ page: "3" })).toEqual({
      page: 3,
      limit: 50,
      offset: 100,
    });
  });

  it("clamps limit to MAX_LIST_PAGE_SIZE", () => {
    expect(parseListPage({ page: "2", limit: "500" })).toEqual({
      page: 2,
      limit: 100,
      offset: 100,
    });
  });

  it("reads URLSearchParams and rejects non-positive page", () => {
    const params = new URLSearchParams("page=0&limit=25");
    expect(parseListPage(params)).toEqual({ page: 1, limit: 25, offset: 0 });
  });
});

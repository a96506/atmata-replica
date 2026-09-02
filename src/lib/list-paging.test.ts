import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIST_PAGE_SIZE,
  MAX_LIST_PAGE_SIZE,
  parseListPage,
} from "./list-paging";

describe("list-paging", () => {
  it("exports day-one defaults", () => {
    expect(DEFAULT_LIST_PAGE_SIZE).toBe(50);
    expect(MAX_LIST_PAGE_SIZE).toBe(100);
  });

  it("uses optional defaultLimit override", () => {
    expect(parseListPage({}, { defaultLimit: 20 })).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
    });
  });

  it("takes the first value when searchParams are string arrays", () => {
    expect(parseListPage({ page: ["4", "9"], limit: ["10"] })).toEqual({
      page: 4,
      limit: 10,
      offset: 30,
    });
  });
});

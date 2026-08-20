import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function flatten(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("settings.users translations", () => {
  it("keeps english and arabic keys aligned", () => {
    const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as {
      settings: { users: unknown };
    };
    const ar = JSON.parse(readFileSync("messages/ar.json", "utf8")) as {
      settings: { users: unknown };
    };
    expect(flatten(ar.settings.users).sort()).toEqual(flatten(en.settings.users).sort());
  });
});

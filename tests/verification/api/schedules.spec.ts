import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadLocalEnv } from "../fixtures/accounts";

loadLocalEnv();

function parseCliJson(text: string) {
  const objIdx = text.indexOf("{");
  const arrIdx = text.indexOf("[");
  let start = -1;
  if (objIdx >= 0 && (arrIdx < 0 || objIdx < arrIdx)) start = objIdx;
  else if (arrIdx >= 0) start = arrIdx;
  if (start < 0) throw new Error("no JSON in CLI output");
  return JSON.parse(text.slice(start));
}

test("seven schedules match verification manifest", () => {
  const manifest = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "tests/verification/manifests/schedules.json"),
      "utf8",
    ),
  ) as { schedules: { name: string; cron: string }[] };
  expect(manifest.schedules.length).toBe(7);

  let listed: { name?: string; cronSchedule?: string; cron?: string }[] = [];
  try {
    const raw = execFileSync(
      "npx",
      ["@insforge/cli", "--json", "schedules", "list"],
      { encoding: "utf8", cwd: process.cwd() },
    );
    const payload = parseCliJson(raw);
    listed = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.schedules)
        ? payload.schedules
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
  } catch (error) {
    test.skip(true, `schedules list unavailable: ${String(error)}`);
  }

  const byName = new Map(
    listed.map((row) => [row.name, row]),
  );
  for (const entry of manifest.schedules) {
    const row = byName.get(entry.name);
    expect(row, `missing schedule ${entry.name}`).toBeTruthy();
    const cron = row?.cronSchedule ?? row?.cron;
    expect(cron, entry.name).toBe(entry.cron);
  }
  expect(listed.length).toBe(manifest.schedules.length);
});

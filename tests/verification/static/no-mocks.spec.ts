import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";

const PATTERN =
  /@\/mocks|sessionStorage|fakeService|USE_FAKE_SERVICE|USE_AI_BACKEND|\/api\/be|ai-service/;

function nodeScan(dirs: string[]) {
  const hits: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = resolve(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) {
        const text = readFileSync(full, "utf8");
        for (const [i, line] of text.split(/\r?\n/).entries()) {
          if (PATTERN.test(line)) hits.push(`${full}:${i + 1}:${line}`);
        }
      }
    }
  };
  for (const dir of dirs) walk(dir);
  return hits.join("\n");
}

test("runtime sources contain zero mock/fallback matches", () => {
  const cwd = process.cwd();
  const targets = [
    resolve(cwd, "src/lib/api"),
    resolve(cwd, "src/lib/actions"),
    resolve(cwd, "src/app"),
    resolve(cwd, "src/components"),
  ];
  let output = "";
  try {
    output = execFileSync(
      "rg",
      [
        "-n",
        "@/mocks|sessionStorage|fakeService|USE_FAKE_SERVICE|USE_AI_BACKEND|/api/be|ai-service",
        ...targets,
      ],
      { encoding: "utf8" },
    );
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    if (err.status === 1) {
      expect(err.stdout ?? "").toBe("");
      return;
    }
    if (err.status === 127 || /ENOENT|not found/i.test(String(err.stderr ?? err))) {
      output = nodeScan(targets);
    } else {
      throw error;
    }
  }
  expect(output.trim(), `unexpected mock matches:\n${output}`).toBe("");
});

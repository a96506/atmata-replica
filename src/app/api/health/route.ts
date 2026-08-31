import { NextResponse } from "next/server";
import { ensureJobsRuntime } from "@/lib/jobs/boot";

// Lightweight Railway healthcheck endpoint.
// Returns 200 directly — no auth, no locale redirect — so Railway's health
// probe (which stopped following redirects on 2026-08-28) can mark the deploy
// healthy. Keep this route outside the [locale] segment so it never 307s.
// https://docs.railway.com/deployments/healthchecks
//
// Also boots the in-process jobs worker + schedules cron (idempotent). Standalone
// `node server.js` can skip instrumentation.ts in some Next 16 builds
// (https://github.com/vercel/next.js/pull/89385); healthchecks make this reliable.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    ensureJobsRuntime();
  } catch (e) {
    console.error("[health] jobs runtime boot failed", e);
  }
  return NextResponse.json(
    { status: "ok" },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}

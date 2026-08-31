import { NextResponse } from "next/server";

// Lightweight Railway healthcheck endpoint.
// Returns 200 directly — no auth, no locale redirect — so Railway's health
// probe (which stopped following redirects on 2026-08-28) can mark the deploy
// healthy. Keep this route outside the [locale] segment so it never 307s.
// https://docs.railway.com/deployments/healthchecks
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { status: "ok" },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}

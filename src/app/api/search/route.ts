import { NextResponse } from "next/server";
import { searchDatabase } from "@/lib/api/search.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  const requestedLimit = Number(searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(50, Math.trunc(requestedLimit)))
    : 20;

  if (query.length < 1 || query.length > 256) {
    return NextResponse.json(
      { error: { code: "VALIDATION", messageKey: "search.invalidQuery" } },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const results = await searchDatabase(query, limit);
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "UNAVAILABLE", messageKey: "search.unavailable" } },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

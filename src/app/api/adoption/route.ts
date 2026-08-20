import { NextResponse } from "next/server";
import { getAdoptableLines } from "@/lib/api/adoption.server";
import type { DocType } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parentType = searchParams.get("parentType") as DocType | null;
  const parentId = searchParams.get("parentId")?.trim();
  if (!parentType || !parentId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", messageKey: "adoption.invalidParent" } },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const parent = await getAdoptableLines(parentType, parentId);
    return NextResponse.json(
      { parent },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "UNAVAILABLE", messageKey: "adoption.unavailable" } },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

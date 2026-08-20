import { NextResponse } from "next/server";
import { getFxRate } from "@/lib/api/master";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const date = url.searchParams.get("date") ?? undefined;
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required." }, { status: 400 });
  }
  try {
    const rate = await getFxRate(from, to, date);
    return NextResponse.json({ rate });
  } catch {
    return NextResponse.json({ error: "Unable to read FX rate." }, { status: 500 });
  }
}

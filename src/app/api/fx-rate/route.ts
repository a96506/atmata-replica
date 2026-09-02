import { NextResponse } from "next/server";
import { FxRateNotFoundError, getFxRate } from "@/lib/api/master";
import { getAppSession } from "@/lib/insforge/session";

export async function GET(request: Request) {
  const { session } = await getAppSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", messageKey: "errors.unauthenticated" } },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
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
  } catch (error) {
    if (error instanceof FxRateNotFoundError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            from: error.from,
            to: error.to,
            date: error.date ?? null,
          },
        },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json({ error: "Unable to read FX rate." }, { status: 500 });
  }
}

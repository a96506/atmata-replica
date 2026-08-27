import { NextResponse } from "next/server";
import { listApprovalRules } from "@/lib/api/master";
import { getAppSession } from "@/lib/insforge/session";

export async function GET() {
  const { session } = await getAppSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", messageKey: "errors.unauthenticated" } },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const rules = await listApprovalRules();
    return NextResponse.json({ rules });
  } catch {
    return NextResponse.json({ error: "Unable to read approval rules." }, { status: 500 });
  }
}

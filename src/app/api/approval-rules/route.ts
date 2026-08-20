import { NextResponse } from "next/server";
import { listApprovalRules } from "@/lib/api/master";

export async function GET() {
  try {
    const rules = await listApprovalRules();
    return NextResponse.json({ rules });
  } catch {
    return NextResponse.json({ error: "Unable to read approval rules." }, { status: 500 });
  }
}

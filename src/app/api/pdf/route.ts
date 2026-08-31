import { NextResponse } from "next/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import {
  generatePdf,
  parsePdfRequest,
  PdfServiceError,
} from "@/lib/services/pdf-gen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function failure(
  status: number,
  code: string,
  requestId: string,
  retryable = false,
) {
  const messageKey: Record<string, string> = {
    UNAUTHENTICATED: "errors.unauthenticated",
    VALIDATION: "errors.validation",
    NOT_FOUND: "errors.notFound",
    CONFLICT: "errors.conflict",
    STORAGE_FAILED: "errors.storageFailed",
    UNAVAILABLE: "errors.unavailable",
    INTERNAL: "errors.internal",
  };
  return NextResponse.json(
    {
      error: {
        code,
        messageKey: messageKey[code] ?? "errors.internal",
        requestId,
        retryable,
      },
    },
    {
      status,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return failure(400, "VALIDATION", requestId);
  }

  const body = parsePdfRequest(rawBody);
  if (!body) return failure(400, "VALIDATION", requestId);

  try {
    const client = await createInsForgeServerClient();
    const result = await generatePdf(body, client);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    const known =
      e instanceof PdfServiceError
        ? e
        : new PdfServiceError("INTERNAL", 500);
    return failure(known.status, known.code, requestId, known.retryable);
  }
}

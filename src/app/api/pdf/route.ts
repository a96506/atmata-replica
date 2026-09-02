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

/** Same-origin PDF download — session auth, RLS-scoped attachment, storage bytes. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const attachmentId = new URL(request.url).searchParams
    .get("attachmentId")
    ?.trim();
  if (!attachmentId) return failure(400, "VALIDATION", requestId);

  try {
    const client = await createInsForgeServerClient();
    const { data: userData } = await client.auth.getCurrentUser();
    if (!userData?.user?.id) return failure(401, "UNAUTHENTICATED", requestId);

    const { data: row, error: fetchErr } = await client.database
      .from("attachments")
      .select("id, bucket, key, mime, filename")
      .eq("id", attachmentId)
      .single();
    if (fetchErr || !row) return failure(404, "NOT_FOUND", requestId);

    const { bucket, key, mime, filename } = row as {
      bucket: string;
      key: string;
      mime: string | null;
      filename: string | null;
    };

    const { data: blob, error: dlErr } = await client.storage
      .from(bucket)
      .download(key);
    if (dlErr || !blob) {
      return failure(502, "STORAGE_FAILED", requestId, true);
    }

    const downloadName =
      filename?.trim() || key.split("/").pop() || "document.pdf";
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": mime || "application/pdf",
        "Content-Disposition": `attachment; filename="${downloadName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return failure(500, "INTERNAL", requestId);
  }
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

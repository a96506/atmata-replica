import { NextResponse } from "next/server";
import {
  AiServiceError,
  messageKeyFor,
  parseLocale,
  parseScope,
  requireAiAuth,
  runCfoNarrative,
  runChat,
  runSuggest,
  streamChat,
} from "@/lib/services/ai-assistant";
import type { SafeAiContext } from "@/types/functions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function failure(
  status: number,
  code: string,
  requestId: string,
  retryable = false,
) {
  return NextResponse.json(
    {
      error: {
        code,
        messageKey: messageKeyFor(code),
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

function wantsStream(request: Request, body: Record<string, unknown>): boolean {
  if (body.stream === true) return true;
  if (body.stream === false) return false;
  const accept = request.headers.get("Accept") ?? "";
  return accept.includes("text/event-stream");
}

function sseEncode(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return failure(400, "VALIDATION", requestId);
  }

  const requestedLocale = parseLocale(body.locale);
  const operation =
    typeof body.operation === "string" ? body.operation.trim().slice(0, 40) : "";
  if (!requestedLocale || !["suggest", "cfo_narrative", "chat"].includes(operation)) {
    return failure(400, "VALIDATION", requestId);
  }

  try {
    const auth = await requireAiAuth();

    if (operation === "suggest") {
      const scope = parseScope(body.scope);
      if (!scope) return failure(400, "VALIDATION", requestId);
      const result = await runSuggest(auth, scope, requestedLocale);
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    if (operation === "cfo_narrative") {
      const periodId =
        typeof body.periodId === "string" ? body.periodId.trim().slice(0, 160) : "";
      if (!periodId) return failure(400, "VALIDATION", requestId);
      const result = await runCfoNarrative(auth, periodId, requestedLocale);
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // chat
    if (
      typeof body.message !== "string" ||
      body.message.trim().length < 1 ||
      body.message.length > 2_000
    ) {
      return failure(400, "VALIDATION", requestId);
    }
    const message = body.message.trim();
    const context: SafeAiContext | undefined =
      body.context && typeof body.context === "object"
        ? {
            route:
              typeof (body.context as { route?: unknown }).route === "string"
                ? (body.context as { route: string }).route
                : undefined,
            scope: parseScope((body.context as { scope?: unknown }).scope) ?? undefined,
          }
        : undefined;

    if (wantsStream(request, body)) {
      const tokens = await streamChat(auth, message, requestedLocale, context);
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const token of tokens) {
              controller.enqueue(sseEncode({ type: "token", text: token }));
            }
            controller.enqueue(sseEncode({ type: "done", suggestions: [] }));
            controller.close();
          } catch {
            controller.enqueue(
              sseEncode({
                type: "error",
                code: "MODEL_FAILED",
                requestId,
              }),
            );
            controller.close();
          }
        },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const result = await runChat(auth, message, requestedLocale, context);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof AiServiceError) {
      return failure(error.status, error.code, requestId, error.retryable);
    }
    return failure(502, "MODEL_FAILED", requestId, true);
  }
}

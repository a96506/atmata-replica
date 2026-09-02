import { NextResponse } from "next/server";
import { getAdoptableLines } from "@/lib/api/adoption.server";
import {
  fetchAdoptionMetrics,
  recordAdoptionEvents,
} from "@/lib/api/adoption-metrics.server";
import { getAppSession } from "@/lib/insforge/session";
import type { AdoptionEdge, DocType } from "@/types";

/**
 * Adoption HTTP API.
 *
 * Adoptable-line graph: computed on GET from live parent docs (intentional —
 * no persisted edge table). Completed adoption metrics: POST inserts into
 * `adoption_events` via recordAdoptionEvents.
 */

export const dynamic = "force-dynamic";

export type AdoptionMetricsStub = {
  totalEdges: number;
  multiHopCount: number;
  byTargetType: Record<string, number>;
};

const EMPTY_ADOPTION_METRICS: AdoptionMetricsStub = {
  totalEdges: 0,
  multiHopCount: 0,
  byTargetType: {},
};

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function unauthenticated() {
  return NextResponse.json(
    { error: { code: "UNAUTHENTICATED", messageKey: "errors.unauthenticated" } },
    { status: 401, headers: NO_STORE },
  );
}

export async function GET(request: Request) {
  const { session } = await getAppSession();
  if (!session) return unauthenticated();

  const { searchParams } = new URL(request.url);
  const metricsOnly = searchParams.get("metricsOnly") === "1";

  let metrics: AdoptionMetricsStub;
  try {
    metrics = await fetchAdoptionMetrics();
  } catch {
    metrics = EMPTY_ADOPTION_METRICS;
  }

  if (metricsOnly) {
    return NextResponse.json({ metrics }, { headers: NO_STORE });
  }

  const parentType = searchParams.get("parentType") as DocType | null;
  const parentId = searchParams.get("parentId")?.trim();
  if (!parentType || !parentId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", messageKey: "adoption.invalidParent" } },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const parent = await getAdoptableLines(parentType, parentId);
    return NextResponse.json({ parent, metrics }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: { code: "UNAVAILABLE", messageKey: "adoption.unavailable" } },
      { status: 503, headers: NO_STORE },
    );
  }
}

export async function POST(request: Request) {
  const { session } = await getAppSession();
  if (!session) return unauthenticated();

  let body: { edges?: AdoptionEdge[] };
  try {
    body = (await request.json()) as { edges?: AdoptionEdge[] };
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION", messageKey: "adoption.invalidBody" } },
      { status: 400, headers: NO_STORE },
    );
  }

  const edges = Array.isArray(body.edges) ? body.edges : [];
  if (edges.length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION", messageKey: "adoption.noEdges" } },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    await recordAdoptionEvents(session.user.id, session.companyId, edges);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch {
    // Table may not exist yet — keep client flow working.
    return NextResponse.json({ ok: false, deferred: true }, { headers: NO_STORE });
  }
}

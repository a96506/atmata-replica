import "server-only";

import type { AdoptionMetricsStub } from "@/app/api/adoption/route";
import type { AdoptionEdge } from "@/types";
import { getReadClient } from "@/lib/db/read";

const EMPTY_METRICS: AdoptionMetricsStub = {
  totalEdges: 0,
  multiHopCount: 0,
  byTargetType: {},
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Probe whether the adoption_events table exists (migration applied). */
export async function adoptionEventsAvailable(): Promise<boolean> {
  const client = await getReadClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await client.database
    .from("adoption_events")
    .select("id")
    .range(0, 0);
  if (!result.error) return true;
  const msg = String(result.error.message ?? "");
  return !/adoption_events|relation|does not exist|schema cache/i.test(msg);
}

export async function fetchAdoptionMetrics(): Promise<AdoptionMetricsStub> {
  if (!(await adoptionEventsAvailable())) return { ...EMPTY_METRICS };

  const client = await getReadClient();
  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await client.database
    .from("adoption_events")
    .select("target_doc_type")
    .gte("adopted_at", since);

  if (result.error || !result.data) return { ...EMPTY_METRICS };

  const byTargetType: Record<string, number> = {};
  for (const row of result.data as { target_doc_type: string }[]) {
    const key = row.target_doc_type;
    byTargetType[key] = (byTargetType[key] ?? 0) + 1;
  }

  const totalEdges = Object.values(byTargetType).reduce((sum, n) => sum + n, 0);
  return { totalEdges, multiHopCount: 0, byTargetType };
}

export async function recordAdoptionEvents(
  userId: string,
  companyId: string,
  edges: AdoptionEdge[],
): Promise<void> {
  if (edges.length === 0) return;
  if (!(await adoptionEventsAvailable())) return;

  const adoptedAt = edges[0]?.createdAt ?? new Date().toISOString();
  const rows = edges.map((edge) => ({
    company_id: companyId,
    user_id: userId,
    source_doc_type: edge.from.docType,
    source_doc_id: edge.from.docId,
    target_doc_type: edge.to.docType,
    adopted_at: edge.createdAt ?? adoptedAt,
  }));

  const client = await getReadClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await client.database.from("adoption_events").insert(rows);
  if (result.error) {
    throw new Error(result.error.message ?? "adoption_events insert failed");
  }
}

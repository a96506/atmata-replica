import "server-only";

import OpenAI from "openai";
import { createInsForgeAdminClient } from "@/lib/insforge/server";
import type { JobRow } from "@/lib/jobs/types";
import type { ReconciliationSuggestion } from "@/types/functions";

type AdminClient = ReturnType<typeof createInsForgeAdminClient>;
type JobsClient = AdminClient;

export type ReconJobPayload = {
  statementId: string;
  lineIds?: string[];
  companyId?: string;
  actorUserId?: string;
};

export class ReconSuggestError extends Error {
  constructor(
    readonly code:
      | "VALIDATION"
      | "NOT_FOUND"
      | "MODEL_FAILED"
      | "INTERNAL",
    readonly retryable = false,
  ) {
    super(code);
    this.name = "ReconSuggestError";
  }
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

type Proposal = {
  lineId: string;
  journalEntryId: string;
  sourceDocType?: string;
  sourceDocId?: string;
  confidence: number;
  reasonEn: string;
  reasonAr: string;
};

async function persistViaRpc(
  client: JobsClient,
  statementId: string,
  proposal: Proposal,
  model: string,
): Promise<ReconciliationSuggestion | null> {
  const { data, error } = await client.database.rpc(
    "persist_reconciliation_suggestion",
    {
      p_statement_id: statementId,
      p_line_id: proposal.lineId,
      p_journal_entry_id: proposal.journalEntryId,
      p_source_doc_type: proposal.sourceDocType ?? null,
      p_source_doc_id: proposal.sourceDocId ?? null,
      p_confidence: proposal.confidence,
      p_title_en: "Suggested bank match",
      p_title_ar: "مطابقة بنكية مقترحة",
      p_rationale_en: proposal.reasonEn,
      p_rationale_ar: proposal.reasonAr,
      p_model: model,
      p_prompt_version: "reconciliation-v1",
    },
  );
  if (error || !data) return null;
  const result = data as {
    match?: { id?: string };
    suggestion?: { id?: string };
  };
  return {
    id: String(result.match?.id ?? result.suggestion?.id),
    lineId: proposal.lineId,
    journalEntryId: proposal.journalEntryId,
    sourceDocType: proposal.sourceDocType,
    sourceDocId: proposal.sourceDocId,
    confidence: proposal.confidence,
    reason: proposal.reasonEn,
  };
}

/**
 * Admin-path persist when auth.uid() RPCs are unavailable.
 * Mirrors persist_reconciliation_suggestion + ensure_reconciliation_session.
 */
async function persistViaAdmin(
  client: JobsClient,
  args: {
    companyId: string;
    actorUserId: string;
    statementId: string;
    proposal: Proposal;
    model: string;
  },
): Promise<ReconciliationSuggestion | null> {
  const { companyId, actorUserId, statementId, proposal, model } = args;

  const { data: statement } = await client.database
    .from("bank_statements")
    .select("id")
    .eq("id", statementId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!statement) return null;

  let { data: session } = await client.database
    .from("reconciliation_sessions")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("bank_statement_id", statementId)
    .maybeSingle();

  if (!session) {
    const inserted = await client.database
      .from("reconciliation_sessions")
      .insert([
        {
          company_id: companyId,
          bank_statement_id: statementId,
          status: "open",
          started_by: actorUserId,
        },
      ])
      .select("id, status")
      .maybeSingle();
    session = inserted.data;
  }
  if (!session || session.status !== "open") return null;

  const { data: line } = await client.database
    .from("bank_statement_lines")
    .select("id, status, bank_statement_id")
    .eq("company_id", companyId)
    .eq("id", proposal.lineId)
    .maybeSingle();
  if (
    !line ||
    String(line.bank_statement_id) !== statementId ||
    line.status === "matched"
  ) {
    return null;
  }

  let { data: match } = await client.database
    .from("reconciliation_matches")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("bank_statement_line_id", proposal.lineId)
    .eq("journal_entry_id", proposal.journalEntryId)
    .maybeSingle();

  if (!match) {
    const inserted = await client.database
      .from("reconciliation_matches")
      .insert([
        {
          company_id: companyId,
          reconciliation_session_id: session.id,
          bank_statement_line_id: proposal.lineId,
          journal_entry_id: proposal.journalEntryId,
          source_doc_type: proposal.sourceDocType ?? null,
          source_doc_id: proposal.sourceDocId ?? null,
          confidence: proposal.confidence,
          status: "suggested",
          proposed_by: "ai",
          created_by: actorUserId,
        },
      ])
      .select("id, status")
      .maybeSingle();
    match = inserted.data;
  } else if (match.status === "accepted" || match.status === "manual") {
    return null;
  }

  if (!match) return null;

  if (line.status === "unmatched") {
    await client.database
      .from("bank_statement_lines")
      .update({ status: "suggested" })
      .eq("company_id", companyId)
      .eq("id", proposal.lineId);
  }

  await client.database.from("ai_suggestions").insert([
    {
      company_id: companyId,
      scope_kind: "reconciliation",
      scope_type: "reconciliation_match",
      scope_id: match.id,
      category: "reconciliation",
      severity: "info",
      title_en: "Suggested bank match",
      title_ar: "مطابقة بنكية مقترحة",
      rationale_en: proposal.reasonEn,
      rationale_ar: proposal.reasonAr,
      confidence: proposal.confidence,
      proposed_action: {
        label: "Review match",
        matchId: match.id,
      },
      model,
      prompt_version: "reconciliation-v1",
      created_by: actorUserId,
    },
  ]);

  return {
    id: String(match.id),
    lineId: proposal.lineId,
    journalEntryId: proposal.journalEntryId,
    sourceDocType: proposal.sourceDocType,
    sourceDocId: proposal.sourceDocId,
    confidence: proposal.confidence,
    reason: proposal.reasonEn,
  };
}

export type RunReconOptions = {
  companyId: string;
  actorUserId?: string;
  /** `rpc` for user JWT clients; `admin` for worker admin client. */
  persistMode: "rpc" | "admin";
};

/**
 * Port of functions/reconciliation-suggest — OpenRouter match proposals.
 */
export async function runReconciliationSuggest(
  client: JobsClient,
  input: { statementId: string; lineIds?: string[] },
  opts: RunReconOptions,
): Promise<ReconciliationSuggestion[]> {
  const startedAt = Date.now();
  const statementId = clean(input.statementId, 160);
  const lineIds = input.lineIds
    ? [...new Set(input.lineIds.map((id) => clean(id, 160)).filter(Boolean))].slice(
        0,
        100,
      )
    : undefined;
  if (!statementId) throw new ReconSuggestError("VALIDATION");
  if (
    Array.isArray(input.lineIds) &&
    lineIds?.length !== input.lineIds.length
  ) {
    throw new ReconSuggestError("VALIDATION");
  }

  const { data: statement } = await client.database
    .from("bank_statements")
    .select("id, company_id, currency, date_from, date_to")
    .eq("id", statementId)
    .eq("company_id", opts.companyId)
    .maybeSingle();
  if (!statement) throw new ReconSuggestError("NOT_FOUND");

  let lineQuery = client.database
    .from("bank_statement_lines")
    .select("id, date, description, reference, amount")
    .eq("bank_statement_id", statementId)
    .eq("company_id", opts.companyId)
    .eq("status", "unmatched")
    .limit(100);
  if (lineIds?.length) lineQuery = lineQuery.in("id", lineIds);
  const { data: lines, error: linesError } = await lineQuery;
  if (linesError) throw new ReconSuggestError("INTERNAL");
  if (!lines?.length) return [];

  const { data: entries, error: entryError } = await client.database
    .from("journal_entries")
    .select(
      "id, number, date, currency, source_type, source_id, description, lines:journal_entry_lines(debit, credit)",
    )
    .eq("company_id", opts.companyId)
    .eq("state", "posted")
    .gte("date", statement.date_from)
    .lte("date", statement.date_to)
    .limit(100);
  if (entryError) throw new ReconSuggestError("INTERNAL");

  const candidates = (entries ?? []).map(
    (entry: {
      id: string;
      number: string;
      date: string;
      currency: string;
      source_type?: string | null;
      source_id?: string | null;
      description?: string | null;
      lines?: Array<{ debit?: unknown; credit?: unknown }>;
    }) => ({
      id: String(entry.id),
      number: String(entry.number),
      date: String(entry.date),
      currency: String(entry.currency),
      sourceType: entry.source_type ? String(entry.source_type) : null,
      sourceId: entry.source_id ? String(entry.source_id) : null,
      description: clean(entry.description, 240),
      amount: Number(
        Math.max(
          (entry.lines ?? []).reduce(
            (sum, line) => sum + Number(line.debit ?? 0),
            0,
          ),
          (entry.lines ?? []).reduce(
            (sum, line) => sum + Number(line.credit ?? 0),
            0,
          ),
        ).toFixed(3),
      ),
    }),
  );

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new ReconSuggestError("INTERNAL");

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENROUTER_RECON_MODEL ?? "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            'You propose bank reconciliation matches. Use only candidate IDs supplied. Never mark anything accepted. Return JSON {"matches":[...]}. Match on absolute amount, currency, dates, references and descriptions. Omit uncertain matches below 0.60.',
        },
        {
          role: "user",
          content: JSON.stringify({
            statement: {
              currency: statement.currency,
              from: statement.date_from,
              to: statement.date_to,
            },
            lines,
            candidates,
            shape: {
              lineId: "string",
              journalEntryId: "string",
              confidence: "0..1",
              reasonEn: "short",
              reasonAr: "short Arabic",
            },
          }),
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1600,
      temperature: 0,
    });

    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as { matches?: unknown };
    const allowedLines = new Set(
      lines.map((line: { id: string }) => String(line.id)),
    );
    const candidateMap = new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    );
    const proposals = (
      Array.isArray(parsed.matches) ? parsed.matches : []
    )
      .slice(0, lines.length)
      .map((match) => {
        const row = (match ?? {}) as Record<string, unknown>;
        const lineId = clean(row.lineId, 160);
        const journalEntryId = clean(row.journalEntryId, 160);
        const confidence = Math.max(0, Math.min(1, Number(row.confidence)));
        const candidate = candidateMap.get(journalEntryId);
        if (
          !allowedLines.has(lineId) ||
          !candidate ||
          !Number.isFinite(confidence) ||
          confidence < 0.6
        ) {
          return null;
        }
        return {
          lineId,
          journalEntryId,
          sourceDocType: candidate.sourceType ?? undefined,
          sourceDocId: candidate.sourceId ?? undefined,
          confidence: Number(confidence.toFixed(4)),
          reasonEn: clean(row.reasonEn, 500) || "Amount and reference are consistent.",
          reasonAr: clean(row.reasonAr, 500) || "يتوافق المبلغ والمرجع.",
        } satisfies Proposal;
      })
      .filter(Boolean) as Proposal[];

    const persisted: ReconciliationSuggestion[] = [];
    for (const proposal of proposals) {
      const row =
        opts.persistMode === "rpc"
          ? await persistViaRpc(
              client,
              statementId,
              proposal,
              completion.model,
            )
          : await persistViaAdmin(client, {
              companyId: opts.companyId,
              actorUserId: opts.actorUserId ?? "00000000-0000-0000-0000-000000000000",
              statementId,
              proposal,
              model: completion.model,
            });
      if (row) persisted.push(row);
    }

    console.info({
      function: "recon-handler",
      operation: "suggest",
      companyId: opts.companyId,
      documentId: statementId,
      durationMs: Date.now() - startedAt,
      model: completion.model,
      tokenUsage: completion.usage?.total_tokens,
      resultCode: "OK",
    });

    return persisted;
  } catch (error) {
    if (error instanceof ReconSuggestError) throw error;
    throw new ReconSuggestError("MODEL_FAILED", true);
  }
}

/** Worker registry entry for job type `recon`. */
export async function handleReconJob(job: JobRow): Promise<void> {
  const raw = (job.payload ?? {}) as Record<string, unknown>;
  const statementId = clean(raw.statementId, 160);
  if (!statementId) throw new Error("recon: invalid statementId");
  const lineIds = Array.isArray(raw.lineIds)
    ? raw.lineIds
        .map((id) => clean(id, 160))
        .filter(Boolean)
        .slice(0, 100)
    : undefined;
  const actorUserId =
    typeof raw.actorUserId === "string" ? raw.actorUserId : undefined;

  const admin = createInsForgeAdminClient();
  await runReconciliationSuggest(
    admin,
    { statementId, lineIds },
    {
      companyId: job.company_id,
      actorUserId,
      persistMode: "admin",
    },
  );
}

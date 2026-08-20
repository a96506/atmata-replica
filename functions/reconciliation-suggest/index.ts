import OpenAI from 'npm:openai';
import { createClient } from 'npm:@insforge/sdk';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
function fail(status: number, code: string, requestId: string, retryable = false) {
  return json(status, {
    error: {
      code,
      messageKey:
        code === 'UNAUTHENTICATED'
          ? 'errors.unauthenticated'
          : code === 'NOT_FOUND'
            ? 'errors.notFound'
            : code === 'VALIDATION'
              ? 'errors.validation'
              : code === 'MODEL_FAILED'
                ? 'errors.modelFailed'
                : 'errors.internal',
      requestId,
      retryable,
    },
  });
}
function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export default async function (req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return fail(405, 'VALIDATION', requestId);
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/, '');
  if (!token) return fail(401, 'UNAUTHENTICATED', requestId);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'VALIDATION', requestId);
  }
  const statementId = clean(body?.statementId, 160);
  const lineIds = Array.isArray(body?.lineIds)
    ? [...new Set(body.lineIds.map((id) => clean(id, 160)).filter(Boolean))].slice(0, 100)
    : undefined;
  if (!statementId || (Array.isArray(body?.lineIds) && lineIds?.length !== body.lineIds.length)) {
    return fail(400, 'VALIDATION', requestId);
  }
  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    accessToken: token,
    anonKey: Deno.env.get('ANON_KEY'),
  });
  const { data: userData } = await client.auth.getCurrentUser();
  const userId = userData?.user?.id;
  if (!userId) return fail(401, 'UNAUTHENTICATED', requestId);
  const { data: statement } = await client.database
    .from('bank_statements')
    .select('id, company_id, currency, date_from, date_to')
    .eq('id', statementId)
    .maybeSingle();
  if (!statement) return fail(404, 'NOT_FOUND', requestId);
  let lineQuery = client.database
    .from('bank_statement_lines')
    .select('id, date, description, reference, amount')
    .eq('bank_statement_id', statementId)
    .eq('status', 'unmatched')
    .limit(100);
  if (lineIds?.length) lineQuery = lineQuery.in('id', lineIds);
  const { data: lines, error: linesError } = await lineQuery;
  if (linesError) return fail(500, 'INTERNAL', requestId);
  if (!lines?.length) return json(200, []);
  const { data: entries, error: entryError } = await client.database
    .from('journal_entries')
    .select('id, number, date, currency, source_type, source_id, description, lines:journal_entry_lines(debit, credit)')
    .eq('state', 'posted')
    .gte('date', statement.date_from)
    .lte('date', statement.date_to)
    .limit(100);
  if (entryError) return fail(500, 'INTERNAL', requestId);
  const candidates = (entries ?? []).map((entry: any) => ({
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
          (sum: number, line: { debit?: unknown }) => sum + Number(line.debit ?? 0),
          0,
        ),
        (entry.lines ?? []).reduce(
          (sum: number, line: { credit?: unknown }) => sum + Number(line.credit ?? 0),
          0,
        ),
      ).toFixed(3),
    ),
  }));
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) return fail(500, 'INTERNAL', requestId);
  try {
    const openai = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
    const completion = await openai.chat.completions.create({
      model: Deno.env.get('OPENROUTER_RECON_MODEL') ?? 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: 'You propose bank reconciliation matches. Use only candidate IDs supplied. Never mark anything accepted. Return JSON {"matches":[...]}. Match on absolute amount, currency, dates, references and descriptions. Omit uncertain matches below 0.60.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            statement: {
              currency: statement.currency,
              from: statement.date_from,
              to: statement.date_to,
            },
            lines,
            candidates,
            shape: {
              lineId: 'string',
              journalEntryId: 'string',
              confidence: '0..1',
              reasonEn: 'short',
              reasonAr: 'short Arabic',
            },
          }),
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 1600,
      temperature: 0,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    const allowedLines = new Set(lines.map((line: { id: string }) => String(line.id)));
    const candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const proposals = (Array.isArray(parsed.matches) ? parsed.matches : [])
      .slice(0, lines.length)
      .map((match: Record<string, unknown>) => {
        const lineId = clean(match.lineId, 160);
        const journalEntryId = clean(match.journalEntryId, 160);
        const confidence = Math.max(0, Math.min(1, Number(match.confidence)));
        const candidate = candidateMap.get(journalEntryId);
        if (!allowedLines.has(lineId) || !candidate || !Number.isFinite(confidence) || confidence < 0.6) {
          return null;
        }
        return {
          lineId,
          journalEntryId,
          sourceDocType: candidate.sourceType ?? undefined,
          sourceDocId: candidate.sourceId ?? undefined,
          confidence: Number(confidence.toFixed(4)),
          reasonEn: clean(match.reasonEn, 500) || 'Amount and reference are consistent.',
          reasonAr: clean(match.reasonAr, 500) || 'يتوافق المبلغ والمرجع.',
        };
      })
      .filter(Boolean) as Array<{
        lineId: string;
        journalEntryId: string;
        sourceDocType?: string;
        sourceDocId?: string;
        confidence: number;
        reasonEn: string;
        reasonAr: string;
      }>;
    const persisted = [];
    for (const proposal of proposals) {
      const { data, error } = await client.database.rpc('persist_reconciliation_suggestion', {
        p_statement_id: statementId,
        p_line_id: proposal.lineId,
        p_journal_entry_id: proposal.journalEntryId,
        p_source_doc_type: proposal.sourceDocType ?? null,
        p_source_doc_id: proposal.sourceDocId ?? null,
        p_confidence: proposal.confidence,
        p_title_en: 'Suggested bank match',
        p_title_ar: 'مطابقة بنكية مقترحة',
        p_rationale_en: proposal.reasonEn,
        p_rationale_ar: proposal.reasonAr,
        p_model: completion.model,
        p_prompt_version: 'reconciliation-v1',
      });
      if (error || !data) continue;
      const result = data as any;
      persisted.push({
        id: String(result.match?.id ?? result.suggestion?.id),
        lineId: proposal.lineId,
        journalEntryId: proposal.journalEntryId,
        sourceDocType: proposal.sourceDocType,
        sourceDocId: proposal.sourceDocId,
        confidence: proposal.confidence,
        reason: proposal.reasonEn,
      });
    }
    console.info(JSON.stringify({
      requestId,
      function: 'reconciliation-suggest',
      operation: 'suggest',
      companyId: statement.company_id,
      userId,
      documentId: statementId,
      durationMs: Date.now() - startedAt,
      model: completion.model,
      tokenUsage: completion.usage?.total_tokens,
      resultCode: 'OK',
    }));
    return json(200, persisted);
  } catch {
    return fail(502, 'MODEL_FAILED', requestId, true);
  }
}

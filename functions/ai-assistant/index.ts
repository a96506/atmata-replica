import OpenAI from 'npm:openai';
import { createClient } from 'npm:@insforge/sdk';

type Client = ReturnType<typeof createClient>;
type Locale = 'en' | 'ar';
type Scope =
  | { kind: 'doc'; docType: string; docId: string }
  | { kind: 'list'; docType: string };
type SuggestionDraft = {
  titleEn: string;
  titleAr: string;
  rationaleEn: string;
  rationaleAr: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'anomaly' | 'efficiency' | 'risk' | 'cash_flow' | 'inventory' | 'compliance';
  confidence: number;
  dismissable: boolean;
  action?: {
    labelEn: string;
    labelAr: string;
    actionName:
      | 'create_draft_vendor_bill'
      | 'accept_reconciliation_match'
      | 'create_purchase_requisition'
      | 'create_draft_journal_entry';
    payload: Record<string, unknown>;
  };
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const DOC_TABLES: Record<string, string> = {
  pr: 'purchase_requisitions',
  rfq: 'rfqs',
  po: 'purchase_orders',
  grn: 'goods_receipts',
  vendor_bill: 'vendor_bills',
  vendor_payment: 'vendor_payments',
  debit_note: 'debit_notes',
  vendor_return: 'vendor_returns',
  opportunity: 'opportunities',
  quote: 'quotes',
  so: 'sales_orders',
  dn: 'delivery_notes',
  customer_invoice: 'customer_invoices',
  customer_receipt: 'customer_receipts',
  credit_note: 'credit_notes',
  customer_return: 'customer_returns',
  journal_entry: 'journal_entries',
  stock_move: 'stock_moves',
  stock_adjustment: 'stock_adjustments',
  internal_transfer: 'internal_transfers',
};
const ACTIONS = new Set([
  'create_draft_vendor_bill',
  'accept_reconciliation_match',
  'create_purchase_requisition',
  'create_draft_journal_entry',
]);

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
function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function locale(value: unknown): Locale | null {
  return value === 'en' || value === 'ar' ? value : null;
}
function parseScope(value: unknown): Scope | null {
  if (!value || typeof value !== 'object') return null;
  const scope = value as Record<string, unknown>;
  const docType = clean(scope.docType, 80);
  if (!DOC_TABLES[docType]) return null;
  if (scope.kind === 'list') return { kind: 'list', docType };
  const docId = clean(scope.docId, 160);
  return scope.kind === 'doc' && docId ? { kind: 'doc', docType, docId } : null;
}
function bounded(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 100).map(bounded);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !['company_id', 'created_by', 'updated_by'].includes(key))
        .slice(0, 40)
        .map(([key, item]) => [key, bounded(item)]),
    );
  }
  return typeof value === 'string' ? value.slice(0, 500) : value;
}
function validateSuggestion(value: unknown): SuggestionDraft | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, any>;
  const severities = new Set(['info', 'warning', 'critical']);
  const categories = new Set(['anomaly', 'efficiency', 'risk', 'cash_flow', 'inventory', 'compliance']);
  const confidence = Math.max(0, Math.min(1, Number(row.confidence)));
  const suggestion: SuggestionDraft = {
    titleEn: clean(row.titleEn, 240),
    titleAr: clean(row.titleAr, 240),
    rationaleEn: clean(row.rationaleEn, 800),
    rationaleAr: clean(row.rationaleAr, 800),
    severity: severities.has(row.severity) ? row.severity : 'info',
    category: categories.has(row.category) ? row.category : 'efficiency',
    confidence: Number.isFinite(confidence) ? Number(confidence.toFixed(4)) : 0,
    dismissable: row.dismissable !== false,
  };
  if (!suggestion.titleEn || !suggestion.titleAr || !suggestion.rationaleEn || !suggestion.rationaleAr) {
    return null;
  }
  if (row.action && ACTIONS.has(row.action.actionName)) {
    suggestion.action = {
      labelEn: clean(row.action.labelEn, 120) || 'Review proposal',
      labelAr: clean(row.action.labelAr, 120) || 'مراجعة الاقتراح',
      actionName: row.action.actionName,
      payload:
        row.action.payload && typeof row.action.payload === 'object' && !Array.isArray(row.action.payload)
          ? bounded(row.action.payload) as Record<string, unknown>
          : {},
    };
  }
  return suggestion;
}
async function context(client: Client, userId: string) {
  const { data: member } = await client.database
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .eq('active', true)
    .single();
  return member ? String(member.company_id) : null;
}
function model() {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('MODEL_CONFIG');
  return new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
}
function modelName() {
  return Deno.env.get('OPENROUTER_ASSISTANT_MODEL') ?? 'google/gemini-2.5-flash';
}
async function summarizeAging(client: Client) {
  const [ar, ap] = await Promise.all([
    client.database.rpc('report_ar_aging'),
    client.database.rpc('report_ap_aging'),
  ]);
  if (ar.error || ap.error) throw new Error('REPORT_FAILED');
  const summarize = (rows: any[]) => ({
    count: rows.length,
    outstanding: Number(
      rows.reduce((sum, row) => sum + Number(row.outstanding ?? row.balance ?? 0), 0).toFixed(3),
    ),
    overdue: Number(
      rows
        .filter((row) => Number(row.days_overdue ?? 0) > 0)
        .reduce((sum, row) => sum + Number(row.outstanding ?? row.balance ?? 0), 0)
        .toFixed(3),
    ),
  });
  return {
    ar: summarize((ar.data ?? []) as any[]),
    ap: summarize((ap.data ?? []) as any[]),
  };
}

async function runSuggest(
  client: Client,
  scope: Scope,
  requestedLocale: Locale,
  userId: string,
) {
  const table = DOC_TABLES[scope.docType];
  let query = client.database.from(table).select('*').limit(scope.kind === 'doc' ? 1 : 40);
  if (scope.kind === 'doc') query = query.eq('id', scope.docId);
  const { data, error } = await query;
  if (error || !data || (scope.kind === 'doc' && data.length === 0)) {
    throw new Error('NOT_FOUND');
  }
  const openai = model();
  const completion = await openai.chat.completions.create({
    model: modelName(),
    messages: [
      {
        role: 'system',
        content: 'You are an ERP copilot. Analyze only supplied tenant-scoped data. Return bilingual JSON {"suggestions":[]} with at most 8 concise, evidence-based suggestions. Do not execute mutations. Optional actions must use only create_draft_vendor_bill, accept_reconciliation_match, create_purchase_requisition, or create_draft_journal_entry and must be human-reviewed.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          scope,
          rows: bounded(data),
          shape: {
            titleEn: 'string',
            titleAr: 'Arabic string',
            rationaleEn: 'string',
            rationaleAr: 'Arabic string',
            severity: 'info|warning|critical',
            category: 'anomaly|efficiency|risk|cash_flow|inventory|compliance',
            confidence: '0..1',
            dismissable: true,
            action: 'optional {labelEn,labelAr,actionName,payload}',
          },
        }),
      },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 1800,
    temperature: 0.1,
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
  const drafts = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
    .slice(0, 8)
    .map(validateSuggestion)
    .filter(Boolean) as SuggestionDraft[];
  const result = [];
  for (const draft of drafts) {
    const proposedAction = draft.action
      ? {
          label: requestedLocale === 'ar' ? draft.action.labelAr : draft.action.labelEn,
          actionName: draft.action.actionName,
          payload: draft.action.payload,
        }
      : {};
    const { data: persisted, error: persistError } = await client.database.rpc('persist_ai_suggestion', {
      p_scope_kind: 'document',
      p_scope_type: scope.docType,
      p_scope_id: scope.kind === 'doc' ? scope.docId : `${scope.docType}:list`,
      p_category: draft.category,
      p_severity: draft.severity,
      p_title_en: draft.titleEn,
      p_title_ar: draft.titleAr,
      p_rationale_en: draft.rationaleEn,
      p_rationale_ar: draft.rationaleAr,
      p_confidence: draft.confidence,
      p_proposed_action: proposedAction,
      p_model: completion.model,
      p_prompt_version: 'assistant-suggest-v1',
      p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    if (persistError || !persisted) continue;
    const row = persisted as any;
    result.push({
      id: String(row.id),
      scope,
      severity: draft.severity === 'info' ? 'advice' : draft.severity,
      title: requestedLocale === 'ar' ? draft.titleAr : draft.titleEn,
      rationale: requestedLocale === 'ar' ? draft.rationaleAr : draft.rationaleEn,
      confidence: draft.confidence,
      dismissable: draft.dismissable,
      category: draft.category === 'anomaly' ? 'anomaly' : 'next_action',
      primaryAction: draft.action
        ? {
            label: requestedLocale === 'ar' ? draft.action.labelAr : draft.action.labelEn,
            actionName: draft.action.actionName,
            actionPayload: draft.action.payload,
          }
        : undefined,
      status: 'active',
      model: completion.model,
      promptVersion: 'assistant-suggest-v1',
    });
  }
  return { result, completion, userId };
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
  const requestedLocale = locale(body?.locale);
  const operation = clean(body?.operation, 40);
  if (!requestedLocale || !['suggest', 'cfo_narrative', 'chat'].includes(operation)) {
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
  const companyId = await context(client, userId);
  if (!companyId) return fail(401, 'UNAUTHENTICATED', requestId);
  try {
    if (operation === 'suggest') {
      const scope = parseScope(body.scope);
      if (!scope) return fail(400, 'VALIDATION', requestId);
      const { result, completion } = await runSuggest(client, scope, requestedLocale, userId);
      console.info(JSON.stringify({
        requestId,
        function: 'ai-assistant',
        operation,
        companyId,
        userId,
        documentId: scope.kind === 'doc' ? scope.docId : undefined,
        durationMs: Date.now() - startedAt,
        model: completion.model,
        tokenUsage: completion.usage?.total_tokens,
        resultCode: 'OK',
      }));
      return json(200, result);
    }
    if (operation === 'cfo_narrative') {
      const periodId = clean(body.periodId, 160);
      if (!periodId) return fail(400, 'VALIDATION', requestId);
      const [pnl, balance, cash, aging] = await Promise.all([
        client.database.rpc('report_pnl', { p_period_id: periodId }),
        client.database.rpc('report_balance_sheet', { p_period_id: periodId }),
        client.database.rpc('report_cash_flow', { p_period_id: periodId }),
        summarizeAging(client),
      ]);
      if (pnl.error || balance.error || cash.error) throw new Error('REPORT_FAILED');
      const openai = model();
      const completion = await openai.chat.completions.create({
        model: modelName(),
        messages: [
          {
            role: 'system',
            content: requestedLocale === 'ar'
              ? 'اكتب ملخصاً مالياً تنفيذياً موجزاً بالعربية. استخدم الأرقام المجمعة فقط، اذكر المخاطر دون اختلاق، ولا تقترح تنفيذ قيود.'
              : 'Write a concise executive CFO narrative from aggregates only. Quantify trends and risks, do not invent facts, and do not propose executing entries.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              periodId,
              pnl: bounded(pnl.data),
              balanceSheet: bounded(balance.data),
              cashFlow: bounded(cash.data),
              aging,
            }),
          },
        ],
        max_completion_tokens: 700,
        temperature: 0.2,
      });
      return json(200, {
        narrative: clean(completion.choices[0]?.message?.content, 4_000),
        model: completion.model,
      });
    }

    if (typeof body.message !== 'string' || body.message.trim().length < 1 || body.message.length > 2_000) {
      return fail(400, 'VALIDATION', requestId);
    }
    const message = body.message.trim();
    const safeContext =
      body.context && typeof body.context === 'object'
        ? {
            route: clean((body.context as any).route, 240),
            scope: parseScope((body.context as any).scope),
          }
        : undefined;
    const aging = await summarizeAging(client);
    const openai = model();
    const completion = await openai.chat.completions.create({
      model: modelName(),
      messages: [
        {
          role: 'system',
          content: requestedLocale === 'ar'
            ? 'أجب بالعربية كمساعد ERP. استخدم المجاميع الآمنة فقط. لا تنفذ أي تعديل. أعد JSON بالشكل {"reply":"...","suggestions":[]}.'
            : 'Answer as an ERP assistant using only safe aggregates. Never execute mutations. Return JSON {"reply":"...","suggestions":[]}. Suggestions must be empty unless a human-reviewable proposal is genuinely needed.',
        },
        {
          role: 'user',
          content: JSON.stringify({ message, context: safeContext, aging }),
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 900,
      temperature: 0.2,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    return json(200, {
      reply: clean(parsed.reply, 4_000),
      suggestions: [],
    });
  } catch (error) {
    const notFound = error instanceof Error && error.message === 'NOT_FOUND';
    return fail(notFound ? 404 : 502, notFound ? 'NOT_FOUND' : 'MODEL_FAILED', requestId, !notFound);
  }
}

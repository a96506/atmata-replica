/**
 * AI assistant service — ported from functions/ai-assistant (Deno → Node).
 * OpenRouter via openai SDK. suggest + cfo_narrative = JSON; chat supports streaming.
 */

import OpenAI from "openai";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import type { ActionErrorCode } from "@/lib/actions/result";
import type {
  AiChatResult,
  CfoNarrativeResult,
  FunctionLocale,
  SafeAiContext,
} from "@/types/functions";
import type { AiSuggestion, AiSuggestionScope, DocType } from "@/types";

export type AiClient = Awaited<ReturnType<typeof createInsForgeServerClient>>;

type Locale = FunctionLocale;
type Scope = AiSuggestionScope;
type SuggestionDraft = {
  titleEn: string;
  titleAr: string;
  rationaleEn: string;
  rationaleAr: string;
  severity: "info" | "warning" | "critical";
  category: "anomaly" | "efficiency" | "risk" | "cash_flow" | "inventory" | "compliance";
  confidence: number;
  dismissable: boolean;
  action?: {
    labelEn: string;
    labelAr: string;
    actionName:
      | "create_draft_vendor_bill"
      | "accept_reconciliation_match"
      | "create_purchase_requisition"
      | "create_draft_journal_entry";
    payload: Record<string, unknown>;
  };
};

const DOC_TABLES: Record<string, string> = {
  pr: "purchase_requisitions",
  rfq: "rfqs",
  po: "purchase_orders",
  grn: "goods_receipts",
  vendor_bill: "vendor_bills",
  vendor_payment: "vendor_payments",
  debit_note: "debit_notes",
  vendor_return: "vendor_returns",
  opportunity: "opportunities",
  quote: "quotes",
  so: "sales_orders",
  dn: "delivery_notes",
  customer_invoice: "customer_invoices",
  customer_receipt: "customer_receipts",
  credit_note: "credit_notes",
  customer_return: "customer_returns",
  journal_entry: "journal_entries",
  stock_move: "stock_moves",
  stock_adjustment: "stock_adjustments",
  internal_transfer: "internal_transfers",
};

const ACTIONS = new Set([
  "create_draft_vendor_bill",
  "accept_reconciliation_match",
  "create_purchase_requisition",
  "create_draft_journal_entry",
]);

export class AiServiceError extends Error {
  constructor(
    readonly code: Extract<
      ActionErrorCode,
      "UNAUTHENTICATED" | "VALIDATION" | "NOT_FOUND" | "MODEL_FAILED" | "INTERNAL"
    >,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(code);
    this.name = "AiServiceError";
  }
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseLocale(value: unknown): Locale | null {
  return value === "en" || value === "ar" ? value : null;
}

export function parseScope(value: unknown): Scope | null {
  if (!value || typeof value !== "object") return null;
  const scope = value as Record<string, unknown>;
  const docType = clean(scope.docType, 80);
  if (!DOC_TABLES[docType]) return null;
  if (scope.kind === "list") return { kind: "list", docType: docType as DocType };
  const docId = clean(scope.docId, 160);
  return scope.kind === "doc" && docId
    ? { kind: "doc", docType: docType as DocType, docId }
    : null;
}

function bounded(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 100).map(bounded);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !["company_id", "created_by", "updated_by"].includes(key))
        .slice(0, 40)
        .map(([key, item]) => [key, bounded(item)]),
    );
  }
  return typeof value === "string" ? value.slice(0, 500) : value;
}

const CURRENCY_FRACTION_DIGITS: Record<string, number> = {
  KWD: 3,
  SAR: 2,
  AED: 2,
  USD: 2,
};

function formatAmount(amount: number, currency: string): string {
  const fraction = CURRENCY_FRACTION_DIGITS[currency] ?? 2;
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${currency} ${safe.toFixed(fraction)}`;
}

type ReportPayload = {
  lineItems?: Array<{ label?: string; amount?: number }>;
  totals?: Record<string, number>;
};

function formatReport(
  payload: unknown,
  currency: string,
): {
  lineItems: Array<{ label: string; amount: string }>;
  totals: Record<string, string>;
} {
  const report = (payload && typeof payload === "object" ? payload : {}) as ReportPayload;
  const lineItems = (report.lineItems ?? []).map((row) => ({
    label: String(row.label ?? ""),
    amount: formatAmount(Number(row.amount ?? 0), currency),
  }));
  const totals: Record<string, string> = {};
  for (const [key, value] of Object.entries(report.totals ?? {})) {
    totals[key] = formatAmount(Number(value ?? 0), currency);
  }
  return { lineItems, totals };
}

async function resolveBaseCurrency(client: AiClient, companyId: string): Promise<string> {
  const { data } = await client.database
    .from("companies")
    .select("base_currency")
    .eq("id", companyId)
    .single();
  const code = (data as { base_currency?: string } | null)?.base_currency;
  return code && CURRENCY_FRACTION_DIGITS[code] !== undefined ? code : "KWD";
}

function validateSuggestion(value: unknown): SuggestionDraft | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const severities = new Set(["info", "warning", "critical"]);
  const categories = new Set([
    "anomaly",
    "efficiency",
    "risk",
    "cash_flow",
    "inventory",
    "compliance",
  ]);
  const confidence = Math.max(0, Math.min(1, Number(row.confidence)));
  const suggestion: SuggestionDraft = {
    titleEn: clean(row.titleEn, 240),
    titleAr: clean(row.titleAr, 240),
    rationaleEn: clean(row.rationaleEn, 800),
    rationaleAr: clean(row.rationaleAr, 800),
    severity: severities.has(String(row.severity))
      ? (row.severity as SuggestionDraft["severity"])
      : "info",
    category: categories.has(String(row.category))
      ? (row.category as SuggestionDraft["category"])
      : "efficiency",
    confidence: Number.isFinite(confidence) ? Number(confidence.toFixed(4)) : 0,
    dismissable: row.dismissable !== false,
  };
  if (
    !suggestion.titleEn ||
    !suggestion.titleAr ||
    !suggestion.rationaleEn ||
    !suggestion.rationaleAr
  ) {
    return null;
  }
  const action = row.action as SuggestionDraft["action"] | undefined;
  if (action && ACTIONS.has(action.actionName)) {
    suggestion.action = {
      labelEn: clean(action.labelEn, 120) || "Review proposal",
      labelAr: clean(action.labelAr, 120) || "مراجعة الاقتراح",
      actionName: action.actionName,
      payload:
        action.payload && typeof action.payload === "object" && !Array.isArray(action.payload)
          ? (bounded(action.payload) as Record<string, unknown>)
          : {},
    };
  }
  return suggestion;
}

async function resolveCompanyId(client: AiClient, userId: string): Promise<string | null> {
  const { data: member } = await client.database
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .eq("active", true)
    .single();
  return member ? String((member as { company_id: string }).company_id) : null;
}

function openRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new AiServiceError("MODEL_FAILED", 502, true);
  return new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
}

function modelName(): string {
  return process.env.OPENROUTER_ASSISTANT_MODEL ?? "google/gemini-2.5-flash";
}

async function summarizeAging(client: AiClient) {
  const [ar, ap] = await Promise.all([
    client.database.rpc("report_ar_aging"),
    client.database.rpc("report_ap_aging"),
  ]);
  if (ar.error || ap.error) throw new AiServiceError("MODEL_FAILED", 502, true);
  const summarize = (rows: Record<string, unknown>[]) => ({
    count: rows.length,
    outstanding: Number(
      rows
        .reduce((sum, row) => sum + Number(row.outstanding ?? row.balance ?? 0), 0)
        .toFixed(3),
    ),
    overdue: Number(
      rows
        .filter((row) => Number(row.days_overdue ?? 0) > 0)
        .reduce((sum, row) => sum + Number(row.outstanding ?? row.balance ?? 0), 0)
        .toFixed(3),
    ),
  });
  return {
    ar: summarize((ar.data ?? []) as Record<string, unknown>[]),
    ap: summarize((ap.data ?? []) as Record<string, unknown>[]),
  };
}

export type AuthContext = {
  client: AiClient;
  userId: string;
  companyId: string;
};

export async function requireAiAuth(client?: AiClient): Promise<AuthContext> {
  const c = client ?? (await createInsForgeServerClient());
  const { data: userData } = await c.auth.getCurrentUser();
  const userId = userData?.user?.id;
  if (!userId) throw new AiServiceError("UNAUTHENTICATED", 401);
  const companyId = await resolveCompanyId(c, userId);
  if (!companyId) throw new AiServiceError("UNAUTHENTICATED", 401);
  return { client: c, userId, companyId };
}

export async function runSuggest(
  auth: AuthContext,
  scope: Scope,
  requestedLocale: Locale,
): Promise<AiSuggestion[]> {
  const { client } = auth;
  const table = DOC_TABLES[scope.docType];
  let query = client.database.from(table).select("*").limit(scope.kind === "doc" ? 1 : 40);
  if (scope.kind === "doc") query = query.eq("id", scope.docId);
  const { data, error } = await query;
  if (error || !data || (scope.kind === "doc" && data.length === 0)) {
    throw new AiServiceError("NOT_FOUND", 404);
  }

  const openai = openRouterClient();
  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await openai.chat.completions.create({
      model: modelName(),
      messages: [
        {
          role: "system",
          content:
            'You are an ERP copilot. Analyze only supplied tenant-scoped data. Return bilingual JSON {"suggestions":[]} with at most 8 concise, evidence-based suggestions. Do not execute mutations. Optional actions must use only create_draft_vendor_bill, accept_reconciliation_match, create_purchase_requisition, or create_draft_journal_entry and must be human-reviewed.',
        },
        {
          role: "user",
          content: JSON.stringify({
            scope,
            rows: bounded(data),
            shape: {
              titleEn: "string",
              titleAr: "Arabic string",
              rationaleEn: "string",
              rationaleAr: "Arabic string",
              severity: "info|warning|critical",
              category: "anomaly|efficiency|risk|cash_flow|inventory|compliance",
              confidence: "0..1",
              dismissable: true,
              action: "optional {labelEn,labelAr,actionName,payload}",
            },
          }),
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1800,
      temperature: 0.1,
    });
  } catch {
    throw new AiServiceError("MODEL_FAILED", 502, true);
  }

  let parsed: { suggestions?: unknown[] } = {};
  try {
    parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      suggestions?: unknown[];
    };
  } catch {
    parsed = {};
  }

  const drafts = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
    .slice(0, 8)
    .map(validateSuggestion)
    .filter(Boolean) as SuggestionDraft[];

  const result: AiSuggestion[] = [];
  for (const draft of drafts) {
    const proposedAction = draft.action
      ? {
          label: requestedLocale === "ar" ? draft.action.labelAr : draft.action.labelEn,
          actionName: draft.action.actionName,
          payload: draft.action.payload,
        }
      : {};
    const { data: persisted, error: persistError } = await client.database.rpc(
      "persist_ai_suggestion",
      {
        p_scope_kind: "document",
        p_scope_type: scope.docType,
        p_scope_id: scope.kind === "doc" ? scope.docId : `${scope.docType}:list`,
        p_category: draft.category,
        p_severity: draft.severity,
        p_title_en: draft.titleEn,
        p_title_ar: draft.titleAr,
        p_rationale_en: draft.rationaleEn,
        p_rationale_ar: draft.rationaleAr,
        p_confidence: draft.confidence,
        p_proposed_action: proposedAction,
        p_model: completion.model,
        p_prompt_version: "assistant-suggest-v1",
        p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      },
    );
    if (persistError || !persisted) continue;
    const row = persisted as { id: string };
    result.push({
      id: String(row.id),
      scope,
      severity: draft.severity === "info" ? "advice" : draft.severity,
      title: requestedLocale === "ar" ? draft.titleAr : draft.titleEn,
      rationale: requestedLocale === "ar" ? draft.rationaleAr : draft.rationaleEn,
      confidence: draft.confidence,
      dismissable: draft.dismissable,
      category: draft.category === "anomaly" ? "anomaly" : "next_action",
      primaryAction: draft.action
        ? {
            label: requestedLocale === "ar" ? draft.action.labelAr : draft.action.labelEn,
            actionName: draft.action.actionName,
            actionPayload: draft.action.payload,
          }
        : undefined,
      status: "active",
      model: completion.model,
      promptVersion: "assistant-suggest-v1",
    });
  }
  return result;
}

export async function runCfoNarrative(
  auth: AuthContext,
  periodId: string,
  requestedLocale: Locale,
): Promise<CfoNarrativeResult> {
  const { client, companyId } = auth;
  const currency = await resolveBaseCurrency(client, companyId);
  const [pnl, balance, cash, aging] = await Promise.all([
    client.database.rpc("report_pnl", { p_period_id: periodId }),
    client.database.rpc("report_balance_sheet", { p_period_id: periodId }),
    client.database.rpc("report_cash_flow", { p_period_id: periodId }),
    summarizeAging(client),
  ]);
  if (pnl.error || balance.error || cash.error) {
    throw new AiServiceError("MODEL_FAILED", 502, true);
  }

  const formattedAging = {
    ar: {
      count: aging.ar.count,
      outstanding: formatAmount(aging.ar.outstanding, currency),
      overdue: formatAmount(aging.ar.overdue, currency),
    },
    ap: {
      count: aging.ap.count,
      outstanding: formatAmount(aging.ap.outstanding, currency),
      overdue: formatAmount(aging.ap.overdue, currency),
    },
  };

  const openai = openRouterClient();
  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await openai.chat.completions.create({
      model: modelName(),
      messages: [
        {
          role: "system",
          content:
            requestedLocale === "ar"
              ? `أنت كاتب الملخص المالي التنفيذي. العملة الأساسية للشركة هي ${currency}، وكل المبالغ في البيانات مُنسَّقة مسبقاً بالصيغة "${currency} X.XXX". استخدم المبالغ المُنسَّقة كما هي حرفياً ولا تختلق عملة أخرى ولا تقترح تنفيذ قيود. لا تذكر أي عملة سوى ${currency}.`
              : `You are the executive CFO narrative writer. The company's base currency is ${currency}; every amount in the data is pre-formatted as "${currency} X.XXX". Use those pre-formatted amounts verbatim, do not invent or swap currencies, and do not propose executing entries. Never reference any currency other than ${currency}.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            periodId,
            currency,
            pnl: formatReport(pnl.data, currency),
            balanceSheet: formatReport(balance.data, currency),
            cashFlow: formatReport(cash.data, currency),
            aging: formattedAging,
          }),
        },
      ],
      max_completion_tokens: 700,
      temperature: 0.2,
    });
  } catch {
    throw new AiServiceError("MODEL_FAILED", 502, true);
  }

  return {
    narrative: clean(completion.choices[0]?.message?.content, 4_000),
    model: completion.model,
  };
}

type ChatMessages = OpenAI.Chat.Completions.ChatCompletionMessageParam[];

async function buildChatMessages(
  auth: AuthContext,
  message: string,
  requestedLocale: Locale,
  context: SafeAiContext | undefined,
  streaming: boolean,
): Promise<ChatMessages> {
  const aging = await summarizeAging(auth.client);
  const safeContext = context
    ? {
        route: clean(context.route, 240),
        scope: context.scope ?? null,
      }
    : undefined;

  const system = streaming
    ? requestedLocale === "ar"
      ? "أجب بالعربية كمساعد ERP. استخدم المجاميع الآمنة فقط. لا تنفذ أي تعديل. أجب بنص عادي موجز بدون JSON."
      : "Answer as an ERP assistant using only safe aggregates. Never execute mutations. Reply in plain concise text (no JSON wrapper)."
    : requestedLocale === "ar"
      ? 'أجب بالعربية كمساعد ERP. استخدم المجاميع الآمنة فقط. لا تنفذ أي تعديل. أعد JSON بالشكل {"reply":"...","suggestions":[]}.'
      : 'Answer as an ERP assistant using only safe aggregates. Never execute mutations. Return JSON {"reply":"...","suggestions":[]}. Suggestions must be empty unless a human-reviewable proposal is genuinely needed.';

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: JSON.stringify({ message, context: safeContext, aging }),
    },
  ];
}

/** Non-streaming chat — preserves `{ reply, suggestions }` contract. */
export async function runChat(
  auth: AuthContext,
  message: string,
  requestedLocale: Locale,
  context?: SafeAiContext,
): Promise<AiChatResult> {
  const openai = openRouterClient();
  const messages = await buildChatMessages(auth, message, requestedLocale, context, false);
  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await openai.chat.completions.create({
      model: modelName(),
      messages,
      response_format: { type: "json_object" },
      max_completion_tokens: 900,
      temperature: 0.2,
    });
  } catch {
    throw new AiServiceError("MODEL_FAILED", 502, true);
  }

  let parsed: { reply?: unknown; suggestions?: unknown } = {};
  try {
    parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      reply?: unknown;
      suggestions?: unknown;
    };
  } catch {
    parsed = {};
  }

  return {
    reply: clean(parsed.reply, 4_000),
    suggestions: [],
  };
}

/**
 * Streaming chat via OpenRouter. Yields plain-text token deltas.
 * Caller pipes into SSE / ReadableStream.
 */
export async function streamChat(
  auth: AuthContext,
  message: string,
  requestedLocale: Locale,
  context?: SafeAiContext,
): Promise<AsyncIterable<string>> {
  const openai = openRouterClient();
  const messages = await buildChatMessages(auth, message, requestedLocale, context, true);

  let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  try {
    stream = await openai.chat.completions.create({
      model: modelName(),
      messages,
      max_completion_tokens: 900,
      temperature: 0.2,
      stream: true,
    });
  } catch {
    throw new AiServiceError("MODEL_FAILED", 502, true);
  }

  async function* tokens(): AsyncGenerator<string> {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
  return tokens();
}

export function messageKeyFor(code: string): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "errors.unauthenticated";
    case "NOT_FOUND":
      return "errors.notFound";
    case "VALIDATION":
      return "errors.validation";
    case "MODEL_FAILED":
      return "errors.modelFailed";
    default:
      return "errors.internal";
  }
}

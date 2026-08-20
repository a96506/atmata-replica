import OpenAI from 'npm:openai';
import { createClient } from 'npm:@insforge/sdk';

type Client = ReturnType<typeof createClient>;
type Extraction = {
  supplier: { name: string; confidence: number };
  invoiceNumber: { value: string; confidence: number };
  invoiceDate: { value: string; confidence: number };
  dueDate: { value: string | null; confidence: number };
  currency: { value: 'KWD' | 'SAR' | 'AED' | 'USD'; confidence: number };
  subtotal: { value: number; confidence: number };
  taxTotal: { value: number; confidence: number };
  total: { value: number; confidence: number };
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    confidence: number;
  }>;
};

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
            : code === 'CONFLICT'
              ? 'errors.conflict'
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
function confidence(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function amount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(3)) : 0;
}
function validDate(value: unknown): string {
  const date = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}
function validateExtraction(value: unknown): Extraction | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, any>;
  const currencies = new Set(['KWD', 'SAR', 'AED', 'USD']);
  const currency = text(row.currency?.value, 3);
  const lines = Array.isArray(row.lines) ? row.lines.slice(0, 100) : [];
  const result: Extraction = {
    supplier: {
      name: text(row.supplier?.name, 240),
      confidence: confidence(row.supplier?.confidence),
    },
    invoiceNumber: {
      value: text(row.invoiceNumber?.value, 160),
      confidence: confidence(row.invoiceNumber?.confidence),
    },
    invoiceDate: {
      value: validDate(row.invoiceDate?.value),
      confidence: confidence(row.invoiceDate?.confidence),
    },
    dueDate: {
      value: validDate(row.dueDate?.value) || null,
      confidence: confidence(row.dueDate?.confidence),
    },
    currency: {
      value: (currencies.has(currency) ? currency : 'KWD') as Extraction['currency']['value'],
      confidence: confidence(row.currency?.confidence),
    },
    subtotal: {
      value: amount(row.subtotal?.value),
      confidence: confidence(row.subtotal?.confidence),
    },
    taxTotal: {
      value: amount(row.taxTotal?.value),
      confidence: confidence(row.taxTotal?.confidence),
    },
    total: {
      value: amount(row.total?.value),
      confidence: confidence(row.total?.confidence),
    },
    lines: lines.map((line: Record<string, unknown>) => ({
      description: text(line.description, 500),
      quantity: amount(line.quantity),
      unitPrice: amount(line.unitPrice),
      total: amount(line.total),
      confidence: confidence(line.confidence),
    })).filter((line: Extraction['lines'][number]) => line.description && line.quantity > 0),
  };
  if (
    !result.supplier.name ||
    !result.invoiceNumber.value ||
    !result.invoiceDate.value ||
    result.total.value <= 0 ||
    result.lines.length === 0
  ) return null;
  return result;
}
function overallConfidence(extraction: Extraction): number {
  const values = [
    extraction.supplier.confidence,
    extraction.invoiceNumber.confidence,
    extraction.invoiceDate.confidence,
    extraction.currency.confidence,
    extraction.total.confidence,
    ...extraction.lines.map((line) => line.confidence),
  ];
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}
async function setFailed(client: Client, jobId: number, code: string) {
  await client.database
    .from('document_processing_jobs')
    .update({ status: 'failed', error: code.slice(0, 80) })
    .eq('id', jobId);
}

export default async function (req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return fail(405, 'VALIDATION', requestId);
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/, '');
  if (!token) return fail(401, 'UNAUTHENTICATED', requestId);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'VALIDATION', requestId);
  }
  const jobId = Number((body as { jobId?: unknown })?.jobId);
  if (!Number.isSafeInteger(jobId) || jobId <= 0) return fail(400, 'VALIDATION', requestId);
  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    accessToken: token,
    anonKey: Deno.env.get('ANON_KEY'),
  });
  const { data: userData } = await client.auth.getCurrentUser();
  const userId = userData?.user?.id;
  if (!userId) return fail(401, 'UNAUTHENTICATED', requestId);
  const { data: claimed, error: claimError } = await client.database
    .from('document_processing_jobs')
    .update({ status: 'processing', error: null })
    .eq('id', jobId)
    .eq('kind', 'ocr_vendor_bill')
    .in('status', ['queued', 'failed'])
    .select('id, company_id, source_key, file_name')
    .maybeSingle();
  if (claimError) return fail(500, 'INTERNAL', requestId);
  if (!claimed) {
    const { data: existing } = await client.database
      .from('document_processing_jobs')
      .select('id, status')
      .eq('id', jobId)
      .eq('kind', 'ocr_vendor_bill')
      .maybeSingle();
    if (!existing) return fail(404, 'NOT_FOUND', requestId);
    if (existing.status === 'completed' || existing.status === 'review_needed') {
      return json(200, { jobId, status: existing.status });
    }
    return fail(409, 'CONFLICT', requestId, existing.status === 'processing');
  }
  try {
    if (!claimed.source_key) throw new Error('SOURCE_MISSING');
    const { data: signed, error: signedError } = await client.storage
      .from('imports')
      .createSignedUrl(String(claimed.source_key), 300);
    if (signedError || !signed?.signedUrl) throw new Error('SOURCE_UNAVAILABLE');
    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) throw new Error('MODEL_CONFIG');
    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    const isPdf = String(claimed.file_name).toLowerCase().endsWith('.pdf');
    const media = isPdf
      ? { type: 'file', file: { filename: String(claimed.file_name), file_data: signed.signedUrl } }
      : { type: 'image_url', image_url: { url: signed.signedUrl } };
    const completion = await openai.chat.completions.create({
      model: Deno.env.get('OPENROUTER_OCR_MODEL') ?? 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: 'Extract one vendor bill. Return JSON only. Do not infer missing values. Dates must be YYYY-MM-DD, currencies KWD/SAR/AED/USD, and every field and line needs confidence from 0 to 1.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Return supplier{name,confidence}, invoiceNumber{value,confidence}, invoiceDate, dueDate, currency, subtotal, taxTotal, total, and lines[{description,quantity,unitPrice,total,confidence}].' },
            media,
          ] as any,
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 2200,
      temperature: 0,
    });
    const content = completion.choices[0]?.message?.content;
    const extracted = validateExtraction(content ? JSON.parse(content) : null);
    if (!extracted) throw new Error('MODEL_OUTPUT_INVALID');
    const score = overallConfidence(extracted);
    const status = score >= 0.8 ? 'completed' : 'review_needed';
    const { error: updateError } = await client.database
      .from('document_processing_jobs')
      .update({
        status,
        extraction: {
          ...extracted,
          model: completion.model,
          promptVersion: 'ocr-v1',
        },
        confidence: score,
        error: null,
      })
      .eq('id', jobId)
      .eq('status', 'processing');
    if (updateError) throw new Error('PERSIST_FAILED');
    console.info(JSON.stringify({
      requestId,
      function: 'ocr-vendor-bill',
      operation: 'extract',
      companyId: claimed.company_id,
      userId,
      documentId: jobId,
      durationMs: Date.now() - startedAt,
      model: completion.model,
      tokenUsage: completion.usage?.total_tokens,
      resultCode: status,
    }));
    return json(200, { jobId, status, confidence: score });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : 'MODEL_FAILED';
    await setFailed(client, jobId, code);
    return fail(502, code.startsWith('MODEL') ? 'MODEL_FAILED' : 'INTERNAL', requestId, true);
  }
}

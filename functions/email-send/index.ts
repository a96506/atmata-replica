import { createClient } from 'npm:@insforge/sdk';

type Event =
  | 'quote_sent'
  | 'rfq_invitation'
  | 'approval_requested'
  | 'approval_rejected'
  | 'user_invitation';
type Locale = 'en' | 'ar';
type Input = {
  event: Event;
  docId?: string;
  approvalRequestId?: string;
  invitationId?: string;
  invitationToken?: string;
  locale: Locale;
  idempotencyKey: string;
};
type Client = ReturnType<typeof createClient>;
type ResolvedDelivery = {
  recipient: string;
  reference: string;
  docType: string;
  docId: string;
  invitationLink?: string;
  idempotencySuffix?: string;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const EVENTS = new Set<Event>([
  'quote_sent',
  'rfq_invitation',
  'approval_requested',
  'approval_rejected',
  'user_invitation',
]);
const REQUIRED_ROLES: Record<Event, string[]> = {
  quote_sent: ['sales_rep', 'admin'],
  rfq_invitation: ['buyer', 'admin'],
  approval_requested: ['admin', 'approver'],
  approval_rejected: ['admin', 'approver'],
  user_invitation: ['admin'],
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
function fail(status: number, code: string, requestId: string, retryable = false): Response {
  return json(status, {
    error: {
      code,
      messageKey:
        code === 'EMAIL_DELIVERY_FAILED'
          ? 'errors.emailDeliveryFailed'
          : code === 'NOT_FOUND'
            ? 'errors.notFound'
            : code === 'FORBIDDEN'
              ? 'errors.forbidden'
              : code === 'UNAUTHENTICATED'
                ? 'errors.unauthenticated'
                : code === 'VALIDATION'
                  ? 'errors.validation'
                  : 'errors.internal',
      requestId,
      retryable,
    },
  });
}
function parse(value: unknown): Input | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.event !== 'string' ||
    !EVENTS.has(body.event as Event) ||
    (body.locale !== 'en' && body.locale !== 'ar') ||
    typeof body.idempotencyKey !== 'string' ||
    body.idempotencyKey.trim().length < 1 ||
    body.idempotencyKey.length > 240
  ) return null;
  const input = body as Input;
  if (typeof body.invitationToken === 'string' && body.invitationToken.length >= 32) {
    input.invitationToken = body.invitationToken;
  }
  const reference =
    input.event === 'user_invitation'
      ? input.invitationId
      : input.event.startsWith('approval_')
        ? input.approvalRequestId
        : input.docId;
  return typeof reference === 'string' && reference.length <= 160 ? input : null;
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] ?? char);
}
function appOrigin(): string {
  const raw = Deno.env.get('APP_URL') ?? Deno.env.get('NEXT_PUBLIC_APP_URL') ?? '';
  return raw.replace(/\/$/, '');
}

async function currentContext(client: Client, userId: string) {
  const { data: member } = await client.database
    .from('company_members')
    .select('company_id, roles')
    .eq('user_id', userId)
    .eq('active', true)
    .single();
  if (!member) return null;
  const { data: company } = await client.database
    .from('companies')
    .select('id, name')
    .eq('id', member.company_id)
    .single();
  if (!company) return null;
  return {
    companyId: String(company.id),
    companyName: String(company.name),
    roles: (member.roles ?? []) as string[],
  };
}

async function resolveDeliveries(
  client: Client,
  input: Input,
  companyName: string,
): Promise<ResolvedDelivery[] | null> {
  if (input.event === 'user_invitation') {
    const { data } = await client.database
      .from('invitations')
      .select('id, email, status')
      .eq('id', input.invitationId!)
      .eq('status', 'pending')
      .single();
    if (!data) return null;
    const { data: rawToken, error } = await client.database.rpc('rotate_invitation_token', {
      p_invitation_id: String(data.id),
    });
    if (error || typeof rawToken !== 'string' || rawToken.length < 32) return null;
    const origin = appOrigin();
    const invitationLink = origin
      ? `${origin}/${input.locale}/invitation?token=${encodeURIComponent(rawToken)}`
      : `/invitation?token=${encodeURIComponent(rawToken)}`;
    return [{
      recipient: String(data.email),
      reference: companyName,
      docType: 'invitation',
      docId: String(data.id),
      invitationLink,
    }];
  }
  if (input.event.startsWith('approval_')) {
    const { data: approval } = await client.database
      .from('approval_requests')
      .select('id, doc_type, doc_id, requested_by')
      .eq('id', input.approvalRequestId!)
      .single();
    if (!approval) return null;
    let recipientId = String(approval.requested_by);
    if (input.event === 'approval_requested') {
      const { data: members } = await client.database
        .from('company_members')
        .select('user_id, roles')
        .eq('active', true)
        .limit(100);
      const approver = (members ?? []).find((member: { roles?: string[] }) =>
        (member.roles ?? []).some((role) => role === 'approver' || role === 'admin')
      );
      if (approver) recipientId = String(approver.user_id);
    }
    const { data: profile } = await client.database
      .from('user_profiles')
      .select('email')
      .eq('id', recipientId)
      .single();
    if (!profile?.email) return null;
    return [{
      recipient: String(profile.email),
      reference: `${approval.doc_type} ${approval.doc_id}`,
      docType: String(approval.doc_type),
      docId: String(approval.doc_id),
    }];
  }
  if (input.event === 'quote_sent') {
    const { data: quote } = await client.database
      .from('quotes')
      .select('id, number, customer_id')
      .eq('id', input.docId!)
      .single();
    if (!quote) return null;
    const { data: customer } = await client.database
      .from('customers')
      .select('email')
      .eq('id', quote.customer_id)
      .single();
    if (!customer?.email) return null;
    return [{
      recipient: String(customer.email),
      reference: String(quote.number ?? quote.id),
      docType: 'quote',
      docId: String(quote.id),
    }];
  }
  if (input.event === 'rfq_invitation') {
    const { data: rfq } = await client.database
      .from('rfqs')
      .select('id, number')
      .eq('id', input.docId!)
      .single();
    if (!rfq) return null;
    const { data: invited } = await client.database
      .from('rfq_invited_suppliers')
      .select('supplier_id')
      .eq('rfq_id', rfq.id);
    const supplierIds = [...new Set((invited ?? []).map((row: { supplier_id: string }) => String(row.supplier_id)))];
    if (supplierIds.length === 0) return null;
    const { data: suppliers } = await client.database
      .from('suppliers')
      .select('id, email')
      .in('id', supplierIds);
    const deliveries = (suppliers ?? [])
      .filter((supplier: { email?: string }) => typeof supplier.email === 'string' && supplier.email.includes('@'))
      .map((supplier: { id: string; email: string }) => ({
        recipient: String(supplier.email),
        reference: String(rfq.number ?? rfq.id),
        docType: 'rfq',
        docId: String(rfq.id),
        idempotencySuffix: String(supplier.id),
      }));
    return deliveries.length ? deliveries : null;
  }
  return null;
}

function render(
  event: Event,
  locale: Locale,
  company: string,
  reference: string,
  invitationLink?: string,
) {
  const ar = locale === 'ar';
  const labels: Record<Event, { subject: string; heading: string; body: string; action: string }> = ar
    ? {
        quote_sent: { subject: `عرض سعر من ${company}`, heading: 'عرض السعر جاهز', body: `أرسلت لك ${company} عرض السعر ${reference}.`, action: 'عرض السعر' },
        rfq_invitation: { subject: `طلب عرض سعر من ${company}`, heading: 'طلب عرض سعر', body: `تدعوك ${company} للرد على ${reference}.`, action: 'عرض الطلب' },
        approval_requested: { subject: `مطلوب اعتماد: ${reference}`, heading: 'مطلوب اعتماد', body: `تحتاج ${company} إلى مراجعتك للمستند ${reference}.`, action: 'مراجعة الطلب' },
        approval_rejected: { subject: `رُفض الاعتماد: ${reference}`, heading: 'رُفض الاعتماد', body: `تم رفض طلب اعتماد المستند ${reference}.`, action: 'عرض التفاصيل' },
        user_invitation: { subject: `دعوة للانضمام إلى ${company}`, heading: 'لديك دعوة', body: `تمت دعوتك للانضمام إلى ${company}.`, action: 'قبول الدعوة' },
      }
    : {
        quote_sent: { subject: `Quotation from ${company}`, heading: 'Your quotation is ready', body: `${company} sent quotation ${reference}.`, action: 'View quotation' },
        rfq_invitation: { subject: `Request for quotation from ${company}`, heading: 'Request for quotation', body: `${company} invites you to respond to ${reference}.`, action: 'View request' },
        approval_requested: { subject: `Approval requested: ${reference}`, heading: 'Approval required', body: `${company} needs your review of ${reference}.`, action: 'Review request' },
        approval_rejected: { subject: `Approval rejected: ${reference}`, heading: 'Approval rejected', body: `The approval request for ${reference} was rejected.`, action: 'View details' },
        user_invitation: { subject: `Invitation to join ${company}`, heading: 'You are invited', body: `You have been invited to join ${company}.`, action: 'Accept invitation' },
      };
  const copy = labels[event];
  const actionHtml = invitationLink
    ? `<p><a href="${escapeHtml(invitationLink)}">${escapeHtml(copy.action)}</a></p><p dir="ltr">${escapeHtml(invitationLink)}</p>`
    : '';
  return {
    subject: copy.subject,
    html: `<!doctype html><html dir="${ar ? 'rtl' : 'ltr'}" lang="${locale}"><body style="font-family:Arial,sans-serif;color:#111"><main style="max-width:600px;margin:auto;padding:24px"><h1>${escapeHtml(copy.heading)}</h1><p>${escapeHtml(copy.body)}</p>${actionHtml}</main></body></html>`,
  };
}

export default async function (req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return fail(405, 'VALIDATION', requestId);
  const auth = req.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return fail(401, 'UNAUTHENTICATED', requestId);
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, 'VALIDATION', requestId);
  }
  const input = parse(raw);
  if (!input) return fail(400, 'VALIDATION', requestId);
  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    accessToken: token,
    anonKey: Deno.env.get('ANON_KEY'),
  });
  const { data: userData } = await client.auth.getCurrentUser();
  const userId = userData?.user?.id;
  if (!userId) return fail(401, 'UNAUTHENTICATED', requestId);
  const { data: platformAdmin } = await client.database.rpc('is_platform_admin');
  let companyName: string;
  let companyId: string;
  let deliveries: ResolvedDelivery[] | null;
  if (
    input.event === 'user_invitation' &&
    platformAdmin === true &&
    typeof input.invitationToken === 'string'
  ) {
    const { data: invitation } = await client.database
      .from('invitations')
      .select('id, email, status, company_id')
      .eq('id', input.invitationId!)
      .eq('status', 'pending')
      .single();
    if (!invitation) return fail(404, 'NOT_FOUND', requestId);
    const { data: company } = await client.database
      .from('companies')
      .select('id, name')
      .eq('id', invitation.company_id)
      .single();
    if (!company) return fail(404, 'NOT_FOUND', requestId);
    const origin = appOrigin();
    const invitationLink = origin
      ? `${origin}/${input.locale}/invitation?token=${encodeURIComponent(input.invitationToken)}`
      : `/invitation?token=${encodeURIComponent(input.invitationToken)}`;
    companyName = String(company.name);
    companyId = String(company.id);
    deliveries = [{
      recipient: String(invitation.email),
      reference: companyName,
      docType: 'invitation',
      docId: String(invitation.id),
      invitationLink,
    }];
  } else {
    const context = await currentContext(client, userId);
    if (!context) return fail(401, 'UNAUTHENTICATED', requestId);
    if (!context.roles.some((role) => REQUIRED_ROLES[input.event].includes(role))) {
      return fail(403, 'FORBIDDEN', requestId);
    }
    companyName = context.companyName;
    companyId = context.companyId;
    deliveries = await resolveDeliveries(client, input, context.companyName);
  }
  if (!deliveries) return fail(404, 'NOT_FOUND', requestId);

  let lastResult: { deliveryId: string; status: 'sent' | 'skipped'; duplicate: boolean; invitationLink?: string } | null = null;
  for (const resolved of deliveries) {
    const rendered = render(input.event, input.locale, companyName, resolved.reference, resolved.invitationLink);
    const idempotencyKey = resolved.idempotencySuffix
      ? `${input.idempotencyKey.trim()}:${resolved.idempotencySuffix}`.slice(0, 240)
      : input.idempotencyKey.trim();
    const { data: claimData, error: claimError } = await client.database.rpc('claim_email_delivery', {
      p_idempotency_key: idempotencyKey,
      p_kind: input.event,
      p_recipient: resolved.recipient,
      p_subject: rendered.subject,
      p_locale: input.locale,
      p_doc_type: resolved.docType,
      p_doc_id: resolved.docId,
      p_lease_seconds: 300,
    });
    if (claimError || !claimData) return fail(409, 'CONFLICT', requestId);
    const claim = claimData as {
      claimed: boolean;
      leaseToken?: string;
      delivery: { id: string; status: string };
    };
    if (!claim.claimed) {
      if (claim.delivery.status === 'sent' || claim.delivery.status === 'skipped') {
        lastResult = {
          deliveryId: claim.delivery.id,
          status: claim.delivery.status as 'sent' | 'skipped',
          duplicate: true,
          invitationLink: resolved.invitationLink,
        };
        continue;
      }
      return fail(409, 'CONFLICT', requestId, true);
    }
    try {
      const { data: sent, error: sendError } = await client.emails.send({
        to: resolved.recipient,
        subject: rendered.subject,
        html: rendered.html,
        from: companyName.slice(0, 80),
      });
      if (sendError) throw sendError;
      const skipped = Boolean(sent?.skipped?.length);
      await client.database.rpc('complete_email_delivery', {
        p_delivery_id: claim.delivery.id,
        p_lease_token: claim.leaseToken,
        p_status: skipped ? 'skipped' : 'sent',
        p_provider_reference: skipped ? null : String(sent?.id ?? '').slice(0, 160) || null,
        p_error_code: null,
      });
      lastResult = {
        deliveryId: claim.delivery.id,
        status: skipped ? 'skipped' : 'sent',
        duplicate: false,
        invitationLink: resolved.invitationLink,
      };
    } catch {
      await client.database.rpc('complete_email_delivery', {
        p_delivery_id: claim.delivery.id,
        p_lease_token: claim.leaseToken,
        p_status: 'failed',
        p_provider_reference: null,
        p_error_code: 'PROVIDER_FAILED',
      });
      return fail(502, 'EMAIL_DELIVERY_FAILED', requestId, true);
    }
  }

  console.info(JSON.stringify({
    requestId,
    function: 'email-send',
    operation: input.event,
    companyId,
    userId,
    documentId: deliveries[0]?.docId,
    idempotencyKey: input.idempotencyKey.slice(0, 48),
    durationMs: Date.now() - startedAt,
    resultCode: lastResult?.status === 'skipped' ? 'SKIPPED' : 'OK',
  }));
  return json(200, lastResult);
}

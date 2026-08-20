import type { AiSuggestion, AiSuggestionScope } from "./ai";
import type { ActionErrorCode } from "@/lib/actions/result";

export type FunctionLocale = "en" | "ar";

export type FunctionError = {
  error: {
    code: ActionErrorCode;
    messageKey: string;
    requestId: string;
    retryable: boolean;
  };
};

export type PdfDocType =
  | "quote"
  | "invoice"
  | "delivery"
  | "purchase_order"
  | "vendor_bill";
export type FinancialPdfType =
  | "pl"
  | "balance_sheet"
  | "cash_flow"
  | "trial_balance";
export type PdfMode = "preview" | "save";

export type PdfPreviewResult = {
  mode: "preview";
  contentType: "application/pdf";
  base64: string;
};

export type PdfSaveResult = {
  mode: "save";
  attachmentId: string;
  url: string;
  key: string;
  cached: boolean;
};

export type PdfResult = PdfPreviewResult | PdfSaveResult;

export type EmailEvent =
  | "quote_sent"
  | "rfq_invitation"
  | "approval_requested"
  | "approval_rejected"
  | "user_invitation";

export type EmailSendInput = {
  event: EmailEvent;
  docId?: string;
  approvalRequestId?: string;
  invitationId?: string;
  invitationToken?: string;
  locale: FunctionLocale;
  idempotencyKey: string;
};

export type EmailSendResult = {
  deliveryId: string;
  status: "sent" | "skipped";
  duplicate: boolean;
  invitationLink?: string;
};

export type SafeAiContext = {
  route?: string;
  scope?: AiSuggestionScope;
};

export type AiAssistantInput =
  | {
      operation: "suggest";
      scope: AiSuggestionScope;
      locale: FunctionLocale;
    }
  | {
      operation: "cfo_narrative";
      periodId: string;
      locale: FunctionLocale;
    }
  | {
      operation: "chat";
      message: string;
      locale: FunctionLocale;
      context?: SafeAiContext;
    };

export type AiChatResult = {
  reply: string;
  suggestions: AiSuggestion[];
};

export type CfoNarrativeResult = {
  narrative: string;
  model: string;
};

export type ReconciliationSuggestion = {
  id: string;
  lineId: string;
  journalEntryId?: string;
  sourceDocType?: string;
  sourceDocId?: string;
  confidence: number;
  reason: string;
};

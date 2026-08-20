import type {
  EmailEvent,
  EmailSendInput,
  EmailSendResult,
  FunctionLocale,
} from "@/types/functions";

export type { EmailEvent, EmailSendInput, EmailSendResult, FunctionLocale };

export const EMAIL_EVENTS: readonly EmailEvent[] = [
  "quote_sent",
  "rfq_invitation",
  "approval_requested",
  "approval_rejected",
  "user_invitation",
];

export function isEmailEvent(value: unknown): value is EmailEvent {
  return typeof value === "string" && EMAIL_EVENTS.includes(value as EmailEvent);
}

import { verifyRunId } from "./accounts";

export function verifyMailbox() {
  const runId = verifyRunId() ?? "vf_local";
  return {
    recipient: `verify+${runId}@example.invalid`,
    idempotencyKey: `verify-email-${runId}`,
  };
}

export const EMAIL_EVENTS = [
  "quote_sent",
  "rfq_invitation",
  "approval_requested",
] as const;

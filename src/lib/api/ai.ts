import type { AiSuggestion, AiSuggestionScope } from "@/types";
import {
  dismissAiSuggestion,
  queueAiSuggestion,
  requestAiSuggestions,
} from "@/lib/actions/ai";

export async function getAiSuggestions(
  scope: AiSuggestionScope,
  locale: "en" | "ar" = "en",
): Promise<AiSuggestion[]> {
  const result = await requestAiSuggestions(scope, locale);
  return result.ok ? result.data : [];
}

export type QueuedActionRecord = {
  id: string;
  suggestionId: string;
  scope: AiSuggestionScope;
  label: string;
  queuedAt: string;
  proposedByBot: true;
  status: string;
};

export async function recordQueuedAction(input: {
  suggestionId: string;
  scope: AiSuggestionScope;
  label: string;
  action: string;
  payload: Record<string, unknown>;
  proposedByBot: true;
}): Promise<QueuedActionRecord | null> {
  const result = await queueAiSuggestion({
    suggestionId: input.suggestionId,
    action: input.action,
    payload: input.payload,
  });
  if (!result.ok) return null;
  return {
    id: result.data.id,
    suggestionId: input.suggestionId,
    scope: input.scope,
    label: input.label,
    queuedAt: new Date().toISOString(),
    proposedByBot: true,
    status: result.data.status,
  };
}

export async function persistSuggestionDismissal(id: string): Promise<boolean> {
  const result = await dismissAiSuggestion(id);
  return result.ok;
}

export async function listQueuedActions(): Promise<QueuedActionRecord[]> {
  return [];
}

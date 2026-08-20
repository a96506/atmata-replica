import type {
  AiAssistantInput,
  AiChatResult,
  CfoNarrativeResult,
  ReconciliationSuggestion,
} from "@/types/functions";

export type {
  AiAssistantInput,
  AiChatResult,
  CfoNarrativeResult,
  ReconciliationSuggestion,
};

export const AI_LIMITS = {
  chatMessage: 2_000,
  contextRoute: 240,
  suggestions: 8,
  candidateRows: 100,
} as const;

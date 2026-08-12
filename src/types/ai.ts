/**
 * Atmata — AI co-pilot types.
 *
 * Used by the right-rail assistant on every doc detail page.
 * Suggestions are deterministic in the frontend mock (see src/lib/api/ai.ts);
 * in production the backend returns the same shape.
 */

import type { DocType } from "./common";
import type { AdoptionContext } from "./adoption";

export type AiSuggestionSeverity = "info" | "advice" | "warning" | "critical";

export type AiSuggestionScope =
  | { kind: "doc"; docType: DocType; docId: string }
  | { kind: "list"; docType: DocType };

export type AiSuggestionAction = {
  label: string;
  /** Where the "Do it" button navigates. */
  href?: string;
  /** Optional AdoptionContext to pre-stash before navigation. */
  payload?: AdoptionContext;
};

export type AiSuggestionCategory =
  | "next_action"
  | "anomaly"
  | "prediction"
  | "ocr";

export type AiSuggestion = {
  id: string;
  scope: AiSuggestionScope;
  severity: AiSuggestionSeverity;
  title: string;
  /** One-sentence plain-language rationale shown under the title. */
  rationale: string;
  /** 0..1 — rendered as a percentage chip. */
  confidence: number;
  primaryAction?: AiSuggestionAction;
  dismissable: boolean;
  /** Classifies the suggestion origin for filtering/display. */
  category?: AiSuggestionCategory;
  /** Audit trail: which document chain produced this suggestion. */
  sourceChain?: Array<{ docType: DocType; docId: string }>;
};

export type AiMode = "observe" | "suggest" | "auto";

export type AiQueuedAction = {
  id: string;
  suggestionId: string;
  scope: AiSuggestionScope;
  action: AiSuggestionAction;
  queuedAt: string;
  /** Echoes through to /inbox as a `bot-proposed` badge. */
  proposedByBot: true;
};

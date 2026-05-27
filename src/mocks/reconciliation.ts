export type MatchSuggestion = {
  bank_line_id: number;
  bank_ref: string;
  bank_amount: number;
  matched_entry_id: number | null;
  matched_entry_ref: string;
  matched_amount: number;
  confidence: number;
  match_type: string;
  reasoning: string;
};

export const DEMO_RECON_SUGGESTIONS: MatchSuggestion[] = [
  {
    bank_line_id: 1,
    bank_ref: "NBK-TRF-9912",
    bank_amount: 2500,
    matched_entry_id: 4401,
    matched_entry_ref: "BNK/2026/00044",
    matched_amount: 2500,
    confidence: 0.94,
    match_type: "exact",
    reasoning: "Amount and reference token match.",
  },
  {
    bank_line_id: 2,
    bank_ref: "POS-7721",
    bank_amount: 18.75,
    matched_entry_id: null,
    matched_entry_ref: "",
    matched_amount: 0,
    confidence: 0.61,
    match_type: "fuzzy",
    reasoning: "Possible fee line; needs review.",
  },
];

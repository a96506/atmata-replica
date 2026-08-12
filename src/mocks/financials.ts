export const DEMO_FINANCIALS = {
  statement_type: "Profit & Loss",
  period: "2026-04",
  currency: "KWD",
  line_items: [
    { label: "Revenue", amount: 96_540.75, formatted: "KWD 96,540.750" },
    { label: "Cost of sales", amount: -52_100.25, formatted: "KWD -52,100.250" },
    { label: "---Gross profit", amount: 44_440.5, formatted: "KWD 44,440.500" },
    { label: "Operating expenses", amount: -18_320.5, formatted: "KWD -18,320.500" },
    { label: "---Operating income", amount: 26_120, formatted: "KWD 26,120.000" },
  ],
  formatted_totals: { "Net income": "KWD 26,120.000" },
  totals: { net_income: 26_120 },
  generated_at: new Date().toISOString(),
  notes: ["Posted entries only.", "KWD, 3 decimal places."],
};

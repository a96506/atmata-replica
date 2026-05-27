export const DEMO_CFO = {
  cash_position: {
    current: 184_320.125,
    bank_balance: 160_000,
    ar: 42_000,
    ap: 17_680,
  },
  revenue: { mtd: 96_540.75, ytd: 1_020_400, vs_last_month: 4.2 },
  ar_aging: [
    { bucket: "0-30", amount: 28_400 },
    { bucket: "31-60", amount: 9_200 },
    { bucket: "61-90", amount: 3_150 },
    { bucket: "90+", amount: 1_250 },
  ],
  alerts: [
    {
      severity: "medium",
      message: "Two bills awaiting 3-way match for PO-7710.",
    },
    {
      severity: "low",
      message: "Depreciation run not posted for January (optional).",
    },
  ],
};

export const DEMO_THRESHOLDS = {
  items: [
    {
      automation_type: "accounting",
      default_threshold: 0.75,
      auto_approve_threshold: 0.92,
      is_default: true,
    },
    {
      automation_type: "document_processing",
      default_threshold: 0.7,
      auto_approve_threshold: 0.9,
      is_default: false,
    },
    {
      automation_type: "reconciliation",
      default_threshold: 0.8,
      auto_approve_threshold: 0.95,
      is_default: true,
    },
  ],
  platform_defaults: {
    default_threshold: 0.75,
    auto_approve_threshold: 0.92,
  },
};

# Edge function source (reference only)

These folders are **not deployed** to InsForge.

Phase 2 folded them into the Next app (Railway):

| Slug | In-app home |
|------|-------------|
| `pdf-gen` | `src/lib/services/pdf-gen.ts`, `src/app/api/pdf` |
| `ai-assistant` | `src/lib/services/ai-assistant.ts`, `src/app/api/ai` |
| `email-send` | `src/lib/jobs/handlers/email.ts` (worker) |
| `ocr-vendor-bill` | `src/lib/jobs/handlers/ocr.ts` (worker) |
| `reconciliation-suggest` | `src/lib/jobs/handlers/recon.ts` (worker) |
| `erp-scheduler` | `src/lib/jobs/scheduler.ts`, `src/app/api/cron/erp` |

Do **not** run `npx @insforge/cli functions deploy` for these slugs. Source is kept for diff/history and `scripts/pdf-template-version.mjs` (reads `pdf-gen` markers).

# Atmata replica — frontend (UI only)

Self-contained Next.js 16 app: bilingual **en/ar** routes (`/en/...`, `/ar/...`), RTL on Arabic, **7-item nav** (inbox, dashboard, accounting, sales, purchasing, inventory, settings). **No** NextAuth, **no** `backendFetch`, **no** API wiring — data comes from `src/lib/demo-data.ts` and buttons show toasts.

## Run locally

```bash
git clone https://github.com/a96506/atmata-replica.git
cd atmata-replica
npm install
npm run dev
```

Open `http://localhost:3000` — middleware redirects to a locale. Use **Language** in the header to switch EN/AR.

## Design notes

- Typography: **Plus Jakarta Sans** (UI skill recommendation) + existing **Atmata orange** accent on a **slate** shell for contrast and trust/fintech feel.
- `formatKwd` in `src/lib/utils.ts` uses `en-KW` / `ar-KW` (3 decimals).

## Wire later

Replace demo modules with `product/frontend` patterns: Auth.js, `backendFetch`, real server actions, and env (`BACKEND_URL`, etc.) per the parent replica plan.

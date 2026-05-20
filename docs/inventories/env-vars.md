# Environment Variables Inventory

Catalog of required env vars across the platform (production Vercel deploy + local dev `.env.local` + cron secrets + Supabase keys). Maintained per the Inventory-artifact emission rule.

## Status

**STUB** (created 2026-05-20).

Next substantial dispatch that touches env-var configuration populates this inventory per the 11th binding rule.

## Expected columns when populated

| Column | Source |
|---|---|
| Variable | `NEXT_PUBLIC_SUPABASE_URL`, `WORKER_SECRET`, etc. |
| Required by | Component(s) / route(s) / script(s) that read it |
| Source | Vercel deploy / `.env.local` / runtime injection |
| Sensitivity | public / service-role / secret |
| Sample format | Shape only, never the value |

## Known live env vars (partial, from session corpus)

- `NEXT_PUBLIC_SUPABASE_URL` — public; client + service-role consumers
- `SUPABASE_SERVICE_ROLE_KEY` — service-role secret; server-side only
- `SUPABASE_DB_PASSWORD` — secret; `.env.local` for direct pg access via batch scripts
- `ANTHROPIC_API_KEY` — secret; Q4 classifier batch + Intelligence Assistant
- `WORKER_SECRET` — secret; cron-runnable admin endpoints (`/api/admin/recompute-trust`, `/api/admin/q7-daily-recompute`, `/api/admin/spot-check/recurring`); doubles as Vercel Cron `CRON_SECRET` per Vercel Cron auth convention

## Source of truth

Grep for `process.env.*` and `readFileSync(...).match(/^VAR=(.*)$/m)` patterns in `src/` and `scripts/`. Plus the deploy-side Vercel env config.

## Maintenance trigger

Any dispatch that introduces a new env var dependency MUST update this inventory + emit `Inventory-emission:` line.

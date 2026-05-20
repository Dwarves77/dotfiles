# Cron Jobs Inventory

Catalog of scheduled jobs across the platform: Vercel Cron entries, GitHub Actions cron triggers, pg_cron, and any external scheduler. Maintained per the Inventory-artifact emission rule.

## Status

**STUB** (created 2026-05-20).

Currently wired (per `fsi-app/vercel.json` crons array as of master commit `598d99b`):

| Schedule | Endpoint | Auth | Purpose |
|---|---|---|---|
| `0 2 * * *` (daily 02:00 UTC) | `POST /api/admin/q7-daily-recompute` | `x-worker-secret` OR `Authorization: Bearer ${WORKER_SECRET}` | Recompute `effective_tier` across all sources per Q7 promotion thresholds |

Currently designed-but-not-wired (per route file headers):

| Endpoint | Why not wired | Note |
|---|---|---|
| `POST /api/admin/recompute-trust` | Marked "Designed to run on a monthly cron from .github/workflows/trust-recompute.yml" but the workflow file does not exist | Operator decision: pick GitHub Actions vs Vercel Cron when ready |
| `POST /api/admin/spot-check/recurring` | Same | Same |

## Expected columns when fully populated

| Column | Source |
|---|---|
| Schedule | Cron expression OR human-readable cadence |
| Endpoint / script | What gets invoked |
| Platform | Vercel Cron / GitHub Actions / pg_cron / external |
| Auth mechanism | `x-worker-secret`, signed request, OIDC, etc. |
| Last verified firing | Date of most recent confirmed run |
| Owner OBS | Reference to OBS if cron wiring is pending operator decision |

## Source of truth

`fsi-app/vercel.json` (crons array), `.github/workflows/*.yml` (cron triggers), `supabase/migrations/*.sql` (pg_cron `cron.schedule` calls).

## Maintenance trigger

Any dispatch that adds, removes, or modifies a scheduled job MUST update this inventory + emit `Inventory-emission:` line.

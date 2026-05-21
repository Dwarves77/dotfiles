# Cron Jobs Inventory

**Generated 2026-05-21** (Layer 4 cross-skill consistency dispatch).

## Vercel scheduled jobs

| Path | Schedule | Auth |
|---|---|---|
| /api/admin/q7-daily-recompute | `0 2 * * *` | WORKER_SECRET (server-to-server) |

## Maintenance trigger

Per the 11th binding rule (Inventory-artifact emission): any commit that adds, removes, or reschedules a cron job MUST update this inventory + emit `Inventory-emission:` line.

## Source files

- `fsi-app/vercel.json` crons array
- Route handlers under `fsi-app/src/app/api/admin/` (target of cron POSTs)

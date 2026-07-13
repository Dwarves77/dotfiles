# Secrets Topology Register (2026-07-12)

The source-of-truth map of the credential surface: every secret **name** × vault(s) × consumers ×
write authority. **No secret VALUES appear here — names and topology only.** The machine SoT is
`fsi-app/.discipline/governance/secrets-registry.mjs` (this doc is its human face); the GitHub-Actions
vault is CI-enforced by `secrets-reference-audit.mjs` (invariant SF-11, run in the discipline suite AND
the meta-gate — an unregistered workflow secret reference fails the build).

## Why this exists
The R0.2 honesty probe referenced `secrets.PROBE_SECRET` — a name that was **never a real secret
entry** (an invented label), so it resolved to empty and the probe died. The class fix is this register
+ SF-11: a referenced credential must be a registered credential; an invented/unregistered workflow
secret reference can never silently ship again.

## Vaults
- **github-actions** — repo Actions secrets. Read by `.github/workflows/*`. Write authority: `gh` (repo
  scope) — **VERIFIED writable by test 2026-07-12** (throwaway set/delete succeeded). This is the only
  CI-enforced vault (workflow refs are diffed against the registry).
- **vercel-runtime** — the deployed app's env (Next.js `process.env`). Write authority: Vercel dashboard
  / `vercel` CLI (CLI not installed in this environment). Documented, not diffed (no in-repo manifest).
- **local-.env** — `fsi-app/.env.local` (dev + scripts). Untracked (`.gitignore`). Names swept for
  completeness.
- **supabase** — the DB itself; access granted by `SUPABASE_DB_PASSWORD` (superuser),
  `SUPABASE_SERVICE_ROLE_KEY` (RLS-bypass JWT), `RECONCILER_DB_PASSWORD` (non-owner reconciler role).

## GitHub-Actions vault (CI-ENFORCED — registry == live store, verified 2026-07-12 via `gh secret list`)

| Secret | Consumers (workflows) | Write authority |
|---|---|---|
| `APP_URL` | uptime-probes, source-monitoring, spot-check-monthly, trust-recompute | gh (repo scope, verified) |
| `WORKER_SECRET` | uptime-probes, source-monitoring, spot-check-monthly, trust-recompute — AND the app's `/api/worker/*` + `/api/health/*` auth (vercel-runtime) | gh (verified) / Vercel |
| `NEXT_PUBLIC_SUPABASE_URL` | data-audit-lane | gh / Vercel |
| `SUPABASE_DB_PASSWORD` | data-audit-lane | gh / Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | data-audit-lane | gh / Vercel / Supabase |

**No orphan labels.** Every `secrets.X` in `.github/workflows/*` (5 distinct) is one of these 5, and
every one of these 5 exists in the store. (Retired 2026-07-12: the invented `PROBE_SECRET` reference —
never a real entry — replaced by the existing `WORKER_SECRET`.)

## vercel-runtime + local-.env (DOCUMENTED, not CI-diffed)

| Secret | Vaults | Consumers | Write authority |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | vercel, local | `/api/agent/run`, `/api/admin/scan`, `/api/ask` (spend-bearing, gated by the chokepoint) | Vercel / local |
| `BROWSERLESS_API_KEY` | vercel, local | `canonical-fetch.mjs` / `browserless.ts` (also deleted during paid holds, belt-and-suspenders) | Vercel / local |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | vercel, local | browser client (RLS-scoped reads) | Vercel / local |
| `RECONCILER_DB_PASSWORD` | local | reconciler-role DDL/writes (scripts) | Supabase / local |
| `SUPABASE_ACCESS_TOKEN` | local | Supabase CLI / Management API | Supabase / local |
| `DATA_GOV_API_KEY`, `EIA_API_KEY`, `NREL_API_KEY`, `REGULATIONS_GOV_API_KEY` | local | external data-source fetches (scripts) | local |
| `IMODOCS_USERNAME`, `IMODOCS_PASSWORD` | local | IMODOCS portal auth (scripts) | local |
| `SEC_FAIR_ACCESS_UA` | local | SEC EDGAR fair-access UA string (not secret; SEC-required) | local |

## Cross-repo note
The private backup repo `Dwarves77/caros-ledge-backups` holds its OWN Actions secrets (its dump/restore
workflow needs `SUPABASE_DB_PASSWORD` etc.). That is a separate repo's surface — see [backup-posture](./backup-posture.md);
it is out of scope for THIS repo's SF-11 (which only scans this repo's workflows).

Related: [observability-posture](./observability-posture.md) (R0.2), [backup-posture](./backup-posture.md) (R0.1),
`fsi-app/.discipline/governance/secrets-registry.mjs` (machine SoT), doctrine register entries
`credential-surface-visibility` / `no-new-secrets-without-need` / `credential-capability-verified-by-test`.

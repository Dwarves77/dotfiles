// SECRETS REGISTRY (Secrets-topology dispatch, 2026-07-12) — the machine source of truth for the
// credential surface. Every secret NAME (never a VALUE) x its vault(s) x consumers x write authority.
//
// WHY (the R0.2 scar): the uptime-probes workflow referenced `secrets.PROBE_SECRET` — a name that was
// never a real secret entry (an invented label). It resolved to empty and the probe died. The class fix:
// this registry + a CI check (secrets-reference-audit) that FAILS the build when a workflow references a
// GitHub Actions secret NOT registered here — an invented/unregistered label can never silently ship again.
//
// ENFORCEABLE SET: WORKFLOW_SECRETS is the set of GitHub Actions secret names that .github/workflows/* MAY
// reference. The audit scans every workflow's `secrets.X` and fails on any X not in this set. It is the
// intersection point of "referenced" and "registered" — keep it EQUAL to the real store (verified 2026-07-12
// via `gh secret list`: APP_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_DB_PASSWORD, SUPABASE_SERVICE_ROLE_KEY,
// WORKER_SECRET — exactly these, no orphan labels).
//
// TOPOLOGY carries the fuller picture (all vaults, incl. Vercel runtime + local dev + Supabase) for the
// human register docs/ops/secrets-topology.md. Only the GitHub-Actions vault is CI-enforced here (it is the
// one this repo's workflows read); Vercel/local are documented, not diffed (no in-repo manifest to diff to).

// The GitHub Actions secret names workflows are permitted to reference (== the live store, 2026-07-12).
export const WORKFLOW_SECRETS = Object.freeze(new Set([
  'APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_SERVICE_ROLE_KEY',
  'WORKER_SECRET',
]));

// Full topology (name x vaults x consumers x write authority). VALUES NEVER APPEAR HERE — names + wiring only.
export const TOPOLOGY = Object.freeze([
  { name: 'APP_URL', vaults: ['github-actions'], consumers: ['uptime-probes.yml', 'source-monitoring.yml', 'spot-check-monthly.yml', 'trust-recompute.yml'], writeAuthority: 'gh (repo scope) — VERIFIED writable by test 2026-07-12', note: 'production base URL (not a credential, but a deploy-target config secret)' },
  { name: 'WORKER_SECRET', vaults: ['github-actions', 'vercel-runtime', 'local-.env'], consumers: ['uptime-probes.yml', 'source-monitoring.yml', 'spot-check-monthly.yml', 'trust-recompute.yml (GH)', '/api/worker/* + /api/health/* auth (Vercel runtime)'], writeAuthority: 'gh (repo scope, VERIFIED) for the GH copy; Vercel dashboard/CLI for the runtime copy', note: 'the app authenticates x-worker-secret against this; the probes present the SAME secret (one value, one name — PROBE_SECRET retired 2026-07-12)' },
  { name: 'NEXT_PUBLIC_SUPABASE_URL', vaults: ['github-actions', 'vercel-runtime', 'local-.env'], consumers: ['data-audit-lane.yml (GH)', 'app runtime + scripts'], writeAuthority: 'gh (repo scope) / Vercel', note: 'public project URL' },
  { name: 'SUPABASE_DB_PASSWORD', vaults: ['github-actions', 'local-.env'], consumers: ['data-audit-lane.yml (GH)', 'migration apply via node+pg (local/scripts)'], writeAuthority: 'gh (repo scope) / Supabase dashboard', note: 'postgres superuser password' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', vaults: ['github-actions', 'vercel-runtime', 'local-.env'], consumers: ['data-audit-lane.yml (GH)', 'service-role reads/writes (runtime + scripts)'], writeAuthority: 'gh (repo scope) / Vercel / Supabase', note: 'service-role JWT — bypasses RLS' },
  // Vercel-runtime / local-only credentials (NOT referenced by any workflow, so NOT in WORKFLOW_SECRETS —
  // documented for completeness so the register is exhaustive on day one).
  { name: 'ANTHROPIC_API_KEY', vaults: ['vercel-runtime', 'local-.env'], consumers: ['/api/agent/run, /api/admin/scan, /api/ask (Sonnet/Haiku)'], writeAuthority: 'Vercel dashboard / local', note: 'spend-bearing; gated by the spend chokepoint' },
  { name: 'BROWSERLESS_API_KEY', vaults: ['vercel-runtime', 'local-.env'], consumers: ['canonical-fetch.mjs / browserless.ts (fetch)'], writeAuthority: 'Vercel dashboard / local', note: 'transport; also deleted as belt-and-suspenders during paid holds' },
  { name: 'RECONCILER_DB_PASSWORD', vaults: ['local-.env'], consumers: ['reconciler-role DDL/writes (scripts)'], writeAuthority: 'Supabase dashboard / local', note: 'non-owner reconciler DB role' },
  { name: 'SUPABASE_ACCESS_TOKEN', vaults: ['local-.env'], consumers: ['Supabase CLI / Management API (local)'], writeAuthority: 'Supabase dashboard / local', note: 'management-plane token' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', vaults: ['vercel-runtime', 'local-.env'], consumers: ['browser client (RLS-limited reads)'], writeAuthority: 'Vercel / local', note: 'anon JWT — RLS-scoped' },
  { name: 'DATA_GOV_API_KEY', vaults: ['local-.env'], consumers: ['data.gov API fetches (scripts)'], writeAuthority: 'local', note: 'external data source key' },
  { name: 'EIA_API_KEY', vaults: ['local-.env'], consumers: ['EIA energy-data fetches (scripts)'], writeAuthority: 'local', note: 'external data source key' },
  { name: 'NREL_API_KEY', vaults: ['local-.env'], consumers: ['NLR/NREL fetches (scripts)'], writeAuthority: 'local', note: 'external data source key' },
  { name: 'REGULATIONS_GOV_API_KEY', vaults: ['local-.env'], consumers: ['regulations.gov fetches (scripts)'], writeAuthority: 'local', note: 'external data source key' },
  { name: 'IMODOCS_USERNAME', vaults: ['local-.env'], consumers: ['IMODOCS portal auth (scripts)'], writeAuthority: 'local', note: 'portal credential (username)' },
  { name: 'IMODOCS_PASSWORD', vaults: ['local-.env'], consumers: ['IMODOCS portal auth (scripts)'], writeAuthority: 'local', note: 'portal credential (password)' },
  { name: 'SEC_FAIR_ACCESS_UA', vaults: ['local-.env'], consumers: ['SEC EDGAR fair-access User-Agent (scripts)'], writeAuthority: 'local', note: 'not secret per se; SEC-required UA string' },
]);

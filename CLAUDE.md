# CLAUDE.md — repo root

This repo is named `dotfiles` but is really the monorepo for **Caro's Ledge**, a freight
sustainability intelligence SaaS. The app lives in **`fsi-app/`** — almost all work happens there.
The dotfiles shell (`install.sh`, `.bashrc`, `.claude/commands/`) is a Codespaces bootstrap; leave
it alone unless asked. (The previous contents of this file — the original March-2026 build prompt —
are preserved verbatim at `CLAUDE_CODE_PROMPT.md`; they describe a retired architecture.)

**Read these before working:**
- `fsi-app/.claude/CLAUDE.md` — **THE doctrine file.** Binding rules, contracts, post-mortems for
  all fsi-app work. It auto-loads for sessions under `fsi-app/`; from repo root, read it manually.
- [PROJECT.md](PROJECT.md) — architecture, data flow, design decisions, critical paths (narrative
  knowledge transfer, 2026-07-07).
- [GAPS.md](GAPS.md) — severity-ordered audit of known weaknesses, each with a scoped fix
  (2026-07-07). Check it before "discovering" a problem.
- `fsi-app/docs/program/GOVERNING-PROGRAM.md` — the phase program and `ACTIVE_PHASE`. Never start
  phase work without it.

## Commands (run from `fsi-app/`)

```bash
npm run dev          # Next.js dev server
npm run build        # production build — run after every surface change, must be zero-error
npm run lint         # eslint (stock next config)
npm run typecheck    # tsc --noEmit (also CI fitness gate F9)
npm run analyze      # bundle analyzer → .next/analyze/
npm run perf:bundles # per-route chunk inventory (snapshot before/after perf work)

# Tests — there is NO `npm test`. The canonical CI list is:
bash .discipline/run-test-suite.sh
node --test path/to/file.test.mjs          # single test
node .discipline/runner.mjs --mode=ci      # the binding Rules-as-Code checks
node .discipline/fitness/runner.mjs        # fitness functions
node scripts/verify/run-data-audit-lane.mjs  # data audits (needs Supabase env)

# Data-ops scripts: process.loadEnvFile() + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
# Migrations: npx supabase migration list --linked  (see two-track policy below)
```

Deploy: Vercel auto-deploys `master` (region iad1). **All cron is GitHub Actions**
(`.github/workflows/`): hourly source-monitoring, nightly data-audit lane, monthly
trust-recompute + spot-check. `vercel.json` has no crons — deliberately.

## Conventions this codebase actually follows

- **TS strict, `@/*` → `src/*`.** Orchestration is `.ts`; pure tested primitives are `.mjs` with
  co-located `.test.mjs` (concentrated in `src/lib/agent/`, `src/lib/sources/`, `scripts/lib/`).
  New pure logic follows the `.mjs`+test pattern.
- **Surfaces:** each index page = server component fetching verified-gated data →
  `EditorialMasthead` + a client `<X>Ledger`; details = `<X>DetailSurface`. Shell primitives in
  `src/components/shell/`, design primitives in `src/components/ui/`.
- **Design:** light-first; semantic tokens from `theme.css` only — no raw hex in components; Anton
  display type scoped to mastheads only; accordions always default-closed (`defaultOpen={i===0}`
  is forbidden); current design authority = `docs/design/redesign/` templates (t02 = index
  archetype, t03 = detail archetype).
- **State:** platform data is immutable; per-workspace overrides are a layer merged in
  `resourceStore`. Optimistic update + rollback on API failure.
- **Errors:** ALWAYS destructure `error` from Supabase calls — `const { data } = await supabase…`
  is a named bug-class (see the error-swallow post-mortem in doctrine). Fail closed on
  spend/write paths; fail soft to `src/data/seed-*.ts` on customer reads (with an integrity flag).
- **Data mutations from scripts** go through `scripts/lib/db.mjs` guarded writes only — they
  require a `{skill, reason}` citation and snapshot prior state. Never construct a raw
  service-role write client (rule 015).
- **Commits:** conventional-ish `feat(scope):` / `fix(scope):` / `chore(scope):`, one commit per
  surface/task, PR-numbered suffixes on master.

## Gotchas

- **Docs carry state that drifts by design.** Doctrine (rules) is stable; any count or "what's
  done" claim in a `.md` is a snapshot. Live state = /admin, `docs/inventories/migrations.md`,
  git log, the DB. `fsi-app/STATUS.md` is stale (superseded branch); root `CLAUDE_CODE_PROMPT.md`,
  `docs/FSI_HANDOFF.md`, `freight_sustainability_dashboard.jsx`, and `design_handoff_2026-05/`
  are historical artifacts — do not build from them.
- **Data changes are durable on script execution, not PR merge.** Reverting a PR does not revert
  data; rollback needs a new script (snapshots in `scripts/_snapshots/`).
- **Migrations, two-track:** schema DDL applies via Supabase CLI BEFORE the dependent code lands
  (document the apply timestamp in the commit body); data migrations commit alongside consumer
  code and run after merge. Migrations 146–153 + 101 were committed-but-NOT-applied as of
  2026-07-07 — check the inventory before assuming a column exists. Numbering collisions
  (006 ×2, 007 ×3) are accepted debt: never renumber or edit an applied migration.
- **`node --test` only** — no jest/vitest/playwright. A `.ts` test file will not run (no loader).
- **PostgREST caps reads at ~1000 rows** — use `readAll()` from `scripts/lib/db.mjs` (a capped
  read once created 27 duplicate sources).
- **The nightly data-audit lane has one standing benign red** (`unregistered-span-host`) — don't
  "fix" it blind; it's tracked.
- **Dynamic-import perf:** `next/dynamic({ ssr: true })` from a server component does NOT defer
  chunks (a past wave regressed +1.4 kB/route). Read `docs/PERF-PLAYBOOK.md` before perf work;
  no perf dispatch without measurement.
- **Regulatory grounding delivers FULL documents deliberately** — never add truncation/context
  caps to it (that re-creates a known defect).

## Rules (never change without care)

- **Agent runtime** (`src/lib/agent/canonical-pipeline.ts`, `src/workflows/generate-brief.ts`,
  `metadata-vocab.ts`, `system-prompt.ts`, `src/lib/sources/institution.ts`): do not modify
  without reading SKILL.md + doctrine's AGENT ARCHITECTURE section. One generation path, one
  19-field write site, one tier resolver. No new live Claude API call sites beyond the doctrine
  table.
- **Five customer surfaces** (Regulations, Market Intel, Research, Operations, Community —
  invariant PI-1). No sixth without operator authorization.
- **Staged updates require human approval** — workers/scan never auto-insert to production. New
  items mint only through the sanctioned intake path (single `mintIntelligenceItem()` chokepoint,
  fitness F13).
- **Never process provisional sources** — every pipeline gates on
  `status='active' AND admin_only=false`.
- **Grounding moat:** FACT eligibility uses `base_tier` (institutional identity) only — never
  `effective_tier`/reputation (fitness F12).
- **`.discipline/` is CI- and hook-enforced.** Changing it changes what's enforced; its tests run
  on every push. Invariants live in `governance/invariants.mjs` (enforced-or-exempt, no third
  state).
- **Deprecation means deletion**, not "deprecated" comments — sweep superseded artifacts in the
  same PR or an explicit cleanup commit.
- **Reuse before construction; retrieval before generation** — search for the existing
  component/answer/data before building or re-deriving (invariant RD-8).
- Surviving original product constraints: all exports use Blob download (no clipboard API, no
  `window.open`); transport-mode priority air → road → ocean → rail; cargo verticals: live
  events, artwork, luxury goods, film/TV, high-value automotive, humanitarian.

# PROJECT.md — Caro's Ledge

> Knowledge-transfer document, written 2026-07-07. This is the overview a senior engineer would
> give a new hire. Operational rules live in [CLAUDE.md](CLAUDE.md); the honest weaknesses audit
> lives in [GAPS.md](GAPS.md). For binding doctrine on the app itself, read
> `fsi-app/.claude/CLAUDE.md` — it is the single most important file in this repository.

---

## 1. What this is, in plain language

**Caro's Ledge** is a freight-sustainability intelligence SaaS. It monitors the public sources
where environmental regulation lives (EUR-Lex, the US Federal Register, IMO, CARB, UK
Legislation, academic partners, trade press), extracts the specific regulations and findings
inside those sources, generates grounded intelligence briefs about them with Claude, and serves
them to freight forwarders — currently specialty verticals: art logistics, live events, luxury
goods, high-value automotive, film/TV, humanitarian.

The core product bet, stated in doctrine: *"be creative about WHAT to find, conservative about
WHAT to claim."* Generic LLMs are creative but unreliable; conservative compliance tools are
reliable but limited. This platform tries to be both, with a heavyweight grounding/verification
machine so that every factual claim in a generated brief traces to a verbatim span of a fetched
source document.

It is effectively a **single-operator project** (Jason, `jasonlosh@gmail.com`), pre-pilot,
single-tenant in practice though multi-tenant in schema. Almost all engineering has been done by
Claude-driven agent sessions coordinated through an unusually elaborate written-governance system
(see §6). The project's real institutional memory is in this repo's docs, skills, and inline
comments — not in any human team.

### A note on the repo name

The repo is called `dotfiles` because it genuinely started as one: `install.sh`, `.bashrc`, and
`.claude/commands/` bootstrap a GitHub Codespace with Claude Code and pull a personal global
CLAUDE.md from a Gist. The product was then built *inside* it. Treat the repo as a monorepo whose
real content is `fsi-app/`; the dotfiles shell is vestigial but still functional.

---

## 2. Repository layout

```
/                                — Codespaces dotfiles shell (install.sh, .bashrc, .claude/commands)
├── CLAUDE.md                    — operational entry point for Claude sessions (this rewrite)
├── PROJECT.md / GAPS.md         — this knowledge-transfer set
├── CLAUDE_CODE_PROMPT.md        — HISTORICAL: the original build prompt (dark-editorial spec)
├── freight_sustainability_dashboard.jsx — HISTORICAL: the 234 KB single-file React prototype
│                                  (119 seed resources) the whole product grew out of
├── design_handoff_2026-05/      — HISTORICAL: May 2026 static-HTML design generation
├── docs/                        — mostly May-2026 one-shot runlogs (forensic archive), PLUS the
│   ├── decisions/ADR-001..009   —   load-bearing ADRs
│   ├── inventories/             —   live-state inventories (migrations.md is the migration SoT)
│   ├── design-principles.md     —   binding DP entries
│   └── design/redesign/         —   CURRENT approved design (July 2026, 11 HTML templates)
├── .github/workflows/           — CI + all scheduled jobs (cron lives HERE, not in Vercel)
└── fsi-app/                     — THE PRODUCT (Next.js 16 + Supabase)
    ├── .claude/CLAUDE.md        — THE DOCTRINE FILE (rules, contracts, post-mortems)
    ├── .claude/skills/          — 6 custom platform skills (binding, invariant-anchored)
    ├── .discipline/             — Rules-as-Code governance engine (CI + git-hook enforced)
    ├── src/                     — ~101k lines TS/TSX/CSS; 23 page routes, 76 API routes
    ├── supabase/migrations/     — 149 SQL migrations (numbered 001–153, with collisions/gaps)
    ├── scripts/                 — ~150 data-ops scripts + guarded-write lib + verify/ audits
    └── docs/                    — app-level audits, program state, dispatch reports
```

---

## 3. Tech stack, and why each piece appears to have been chosen

| Piece | Version | Why (as evidenced in the code/docs) |
|---|---|---|
| **Next.js (App Router)** | 16.1.6 | Server components fetch verified-gated data close to the DB; one Vercel deploy covers UI + API routes + the worker endpoints. Replaced the original Railway+Vite plan from `docs/FSI_HANDOFF.md`. |
| **React 19 + TypeScript (strict)** | 19.2.3 / 5.x | Standard; `tsc --noEmit` is a CI fitness gate (F9). |
| **Tailwind v4 + semantic tokens** | 4.x | `theme.css` is the token source of truth; components must not use raw hex. Light-first design (the original dark "luxury editorial" aesthetic was retired). |
| **Supabase (Postgres)** | supabase-js 2.98 | Auth (JWT + cookie SSR), RLS for community/tenant isolation, PostgREST for scripts, RPCs for aggregate reads, DB triggers as enforcement layer (`validate_item_provenance`, integrity-phrase trigger). |
| **Anthropic SDK** | 0.88 | Sonnet 4.6 for brief generation + web_search corroborator discovery; Haiku 4.5 for cheap source classification. All call sites are enumerated and locked in doctrine. |
| **Vercel Workflow DevKit** (`workflow`, `@workflow/next`) | 4.x | Durable, step-retryable orchestration of the generation pipeline (`src/workflows/generate-brief.ts`). Steps get full Node access; workflow body is sandboxed. Fire-and-forget from the API route. |
| **Zustand** | 5.x | Six small client stores; platform data stays immutable and workspace overrides are layered on top (see §5.3). |
| **Browserless** | (external service) | Headless rendering fallback for JS/bot-walled sources; API-first retrieval is the rule, Browserless the fallback. |
| **GSAP, lucide-react, leaflet/react-leaflet** | — | Animations, icons, and the Map surface respectively. |
| **node:test** | built-in | The only test framework. No jest/vitest/playwright anywhere. Tests are co-located `.test.mjs`/`.selftest.mjs` files run by `node --test` via `.discipline/run-test-suite.sh` and CI workflows. |
| **GitHub Actions** | — | Both CI (discipline/bug-class/data-audit) and **all scheduled jobs** (hourly source monitoring, nightly data audit, monthly trust recompute + spot check). `vercel.json` deliberately has **no crons** — a prior Vercel cron was inert (GET against a POST route) and was replaced. |

---

## 4. Domain model — the two-layer architecture

This is the most important conceptual commitment (from doctrine):

- **Layer 1: Sources** — the public portals where legislation/research lives. Registered in the
  `sources` table with a 7-tier type hierarchy and trust scoring (accuracy 40% / timeliness 20% /
  reliability 20% / citation 20%, blended with a tier-derived Bayesian prior in `src/lib/trust.ts`).
- **Layer 2: Intelligence Items** — the specific regulations/findings that live *inside* sources
  (`intelligence_items`). **The system monitors sources; sources produce items. Manual entry is
  not the model.**

Items carry an `item_type` that routes to exactly one brief format and one customer surface:

| item_type | Brief format | Surface |
|---|---|---|
| regulation, directive, standard, guidance, framework | regulatory_fact_document (15 sections) | Regulations |
| market_signal, initiative | market_signal_brief (8) | Market Intel |
| research_finding | research_summary (6) | Research |
| regional_data | operations_profile (8) | Operations |
| technology, innovation, tool | technology_profile (8) | (Technology — see GAPS #19: its status as a 6th surface is unresolved) |

The **ratified five-surface customer model** (invariant PI-1): Regulations, Market Intel,
Research, Operations, Community. Map and the Ask assistant are cross-cutting capabilities; Admin,
Settings, Profile, Account are platform chrome. Do not add a sixth customer surface without
operator authorization.

**Two-tier credibility moat (decision D-two-tier):** FACT-grounding eligibility uses `base_tier`
only — institutional identity, never reputation-derived `effective_tier`. Reputation
(`effective_tier`, citation network, decay) affects display/ranking, never grounding. This is
enforced by fitness function F12 and was re-asserted in phase-A1.

---

## 5. Architecture: how the pieces fit

```
                       ┌────────────────────────────────────────────────┐
                       │  GitHub Actions cron                           │
                       │  hourly: check-sources → drain-first-fetch     │
                       │  nightly: data-audit lane   monthly: trust,    │
                       │  spot-check                                    │
                       └───────────────┬────────────────────────────────┘
                                       │ x-worker-secret POSTs
                                       ▼
┌──────────┐   fetch/render   ┌──────────────────────────────┐    ┌─────────────────────┐
│ Public   │◄─────────────────│  /api/worker/*  &  /api/agent│    │ Anthropic API       │
│ sources  │  transport       │  /run → generate-brief        │◄──►│ Sonnet 4.6 (briefs, │
│ (EUR-Lex,│  escalation      │  workflow (durable steps):    │    │  web_search)        │
│ Fed Reg, │  ladder + PDF +  │  preflight → generate →       │    │ Haiku 4.5 (classify)│
│ IMO…)    │  Browserless     │  register → section → ground  │    └─────────────────────┘
└──────────┘                  │  → (re-research → erase) →    │
                              │  grow → link → auditGate      │
                              └───────────────┬───────────────┘
                                              │ service-role writes
                                              ▼
                              ┌──────────────────────────────┐
                              │  Supabase Postgres            │
                              │  intelligence_items, sources, │
                              │  sections, section_claim_     │
                              │  provenance, agent_runs,      │
                              │  staged_updates, integrity_   │
                              │  flags, community_*, orgs…    │
                              │  + validate_item_provenance   │
                              │    trigger (verified flip)    │
                              └───────────────┬───────────────┘
                                              │ RPCs / verified-gated reads
                                              ▼
                              ┌──────────────────────────────┐
                              │  Next.js server components    │
                              │  (lib/supabase-server.ts)     │
                              │  → props → client surfaces    │
                              │  → Zustand stores (overrides  │
                              │    layered over platform data)│
                              └──────────────────────────────┘

  Parallel human/agent lane: scripts/*.mjs (guarded writes via scripts/lib/db.mjs, snapshots,
  skill citations) — data-ops runs OUTSIDE the app, directly against Supabase, audited by
  .discipline + scripts/verify/ + the nightly data-audit CI lane.
```

### 5.1 The generation pipeline (the heart of the product)

Entry: `POST /api/agent/run` (auth required) → starts `src/workflows/generate-brief.ts`
(Workflow DevKit, fire-and-forget; progress lands in `agent_runs`). The steps, in order:

1. **preflight** — fail-closed gates: global pause, an open `DATA_AUDIT_BLOCK` integrity flag
   (red nightly audit blocks generation), and a $5/day aggregate spend cap summed from
   `agent_runs.cost_usd_estimated`. If the ledger can't be read, halt — never assume $0.
2. **generate** (`src/lib/agent/canonical-pipeline.ts`, the ONE generation path) — fetch the
   primary source via a transport-escalation ladder (API → direct HTTP → Browserless → seek-more
   → `NO_REACHABLE_SOURCE` hold; PDF fast-path); discover corroborators with Sonnet + web_search
   (never invent URLs); build tier-ordered source blocks with the **full primary document**
   (deliberately no truncation caps — a prior truncation defect is the reason); run
   `twoPassGenerate` (splits body/YAML on max_tokens truncation); parse the YAML contract with a
   3-tier fallback; write the **19-field contract** through `metadata-vocab.ts` (the live DB
   CHECK-constraint vocabulary map) at the single write site `synthesiseAndWriteBrief`.
   Default is **reuse**: re-synthesise from the stored source pool with zero re-scrape unless
   `refresh` is passed (retrieval-before-generation, invariant RD-8).
3. **register → section → ground** — register corroborator hosts (so tiers resolve at stamp
   time), extract format-selected sections, then the grounding transaction: every FACT claim's
   `source_span` must be a **verbatim substring of fetched content**, stamped span→source→tier
   via the single resolver `src/lib/sources/institution.ts`, finished by the
   `validate_item_provenance` RPC. A valid item flips to `provenance_status='verified'` by DB
   trigger — **no human tick**.
4. **Tiered failure recovery** — reason-aware re-ground → re-research (widen the pool) →
   **erase** (null the brief, drop sections/provenance, annotate the flag). "Research-or-erase":
   the system never leaves fabricated content standing.
5. **grow → link → auditGate** — credit discovered sources, wire deterministic entity
   cross-references, then a **non-bypassable cross-item audit gate** (unregistered-span-host,
   claims-tier, one-tier-per-host vs. a baseline snapshotted before the run). Gate failure
   erases the item and writes a `data_integrity` flag.

Cost: ~$0.15/item. New items are NOT minted here — `/api/agent/run` updates existing rows;
new items arrive via `staged_updates` (admin scan, human-approved) or the drain-first-fetch
path, both of which are being unified behind a single `mintIntelligenceItem()` chokepoint
(the currently-active program phase).

### 5.2 Read path and auth

- Three Supabase clients: browser anon (`supabase-browser.ts`), cookie-bound SSR
  (`supabase-server-client.ts`, RLS-respecting — used by community), and service-role
  (`supabase-server.ts`, RLS-bypassing, server-only; fails fast if the key is missing).
- Customer reads gate on `provenance_status='verified' AND is_archived=false` — **in app code,
  not RLS** (see GAPS #4: core tables are anon-readable at the RLS layer).
- API auth: `requireAuth()` (Bearer JWT) on ~74/76 routes; `requireCommunityAuth()`
  (cookie-first, RLS-aware) on community routes; `isPlatformAdmin` (a `profiles.is_platform_admin`
  column, deliberately NOT the workspace role) on all `/api/admin/*`; `x-worker-secret` header on
  worker routes. Rate limiting is an in-memory 60/min/user sliding window (known-weak, see GAPS).
- Server components fetch via `lib/data.ts`/`lib/supabase-server.ts` with a **fail-soft seed
  fallback**: on DB error, pages render from `src/data/seed-*.ts` and dispatch a `seed_fallback`
  integrity flag rather than crashing.

### 5.3 Client state

Six Zustand stores. The load-bearing idea: **platform data is immutable; workspace overrides are
a layer.** `resourceStore` holds platform items plus per-workspace overrides
(priority/archive/dismiss/notes), mutates optimistically with rollback, and merges via
`mergeWithOverrides()`. `workspaceStore` (org/role) is seeded synchronously from a single
server-side bootstrap (`resolveServerBootstrap()`, React.cache) to avoid mount-flash.
`settingsStore` debounces saves to `workspace_settings`. `sourceStore`, `navigationStore`,
`exportStore` do what their names say.

### 5.4 The data-ops lane (as important as the app)

Hundreds of one-shot `.mjs` scripts under `fsi-app/scripts/` are the audit record of every data
change. The critical piece is **`scripts/lib/db.mjs`**: the raw service-role write client is
module-private; the only exported writes are `guardedUpdate/guardedDelete/guardedInsert/
archiveRows/registerSource/reclassifyToSource`, each of which (a) refuses to run without a
`{skill, reason}` citation, (b) snapshots prior row state to `scripts/_snapshots/*.jsonl` before
mutating, (c) read-back-verifies where the invariant demands it. `readAll()` exists because the
PostgREST 1000-row cap once silently truncated a read and created 27 duplicate sources.

**Code-vs-data state separation (doctrine):** data changes are durable when the script executes,
not when the PR merges. A reverted PR does NOT undo data. Rollback = a new script.

### 5.5 Governance: `.discipline/` + skills + invariants

A Rules-as-Code engine enforced three ways: git hooks (pre-push, commit-msg), CI
(`discipline.yml`), and a PreToolUse skill gate. Components:

- `governance/invariants.mjs` — 53 invariants across the 6 platform skills, each either
  **enforced** (mapped to a rule/fitness/consistency/audit/selftest/migration artifact) or
  **exempt with a stated reason**; `invariant-coverage.mjs` is the meta-gate.
- `rules/` 012–019 (e.g. 015: row mutations must use the guarded path; 019: source
  reclassification must not simply archive).
- `fitness/` — 12 active functions (F2 admin-route gating, F6 migration numbering, F9 tsc,
  F12 base-tier moat, F13 single mint chokepoint, F15 spend chokepoint…).
- `consistency/` — C3 (migrations vs inventory), C4 (worktrees), C5 (program anchors vs code —
  the mechanism that forces re-reading code before each program phase).

The 6 platform skills in `fsi-app/.claude/skills/` are binding inputs to agent work
(`caros-ledge-platform-intent`, `environmental-policy-and-innovation`, `source-credibility-model`,
`analysis-construction-spec`, `sprint-followups-discipline`, `remediation-discipline`). Doctrine
requires a skill-inventory pass at the start of every dispatch.

---

## 6. Key design decisions and the reasoning behind them

1. **Source-monitoring, not manual entry.** The product's moat is autonomous discovery with
   grounding, so the schema and pipeline are organized around sources producing items.
2. **Fail-closed everywhere in the spend/write path.** Red audit lane blocks generation; missing
   spend ledger halts; missing service key throws rather than silently downgrading to anon.
   Reason: multiple documented incidents where a silently-swallowed error disabled cost gates
   (the `/api/agent/run` error-swallow post-mortem in doctrine is the canonical one).
3. **Grounding as verbatim-substring proof + DB-trigger verification.** Verification is
   mechanical (span must appear in fetched bytes; tier from institutional identity), so a human
   is NOT the correctness catch — the runtime is autonomous by design. The ICM section of
   doctrine explicitly forbids adding human-review gates to the runtime.
4. **Full-document delivery for regulatory grounding — no truncation/scoping.** A truncation
   defect once cut the qualifying clause out of a law. Do not "optimize" this with context caps.
5. **Doctrine-vs-state split.** `fsi-app/.claude/CLAUDE.md` holds rules only; counts and
   "what's done" live at live surfaces (/admin, `docs/inventories/`, git log) because written
   state drifts. When you see a number in a doc, distrust it.
6. **Guarded writes with mandatory skill citations + snapshots.** Every data mutation is
   attributable and reversible. This exists because ungoverned agent writes caused real damage
   (duplicate sources, orphaned archives).
7. **Staged updates require human approval.** The scan worker stages new items; it never
   auto-inserts into production. One of the few original (Feb-2026) rules that survived intact.
8. **Two-track migrations.** Schema DDL applies via Supabase CLI BEFORE the dependent code lands
   (so previews don't 500 on missing columns); data migrations commit alongside consumer code and
   run after merge.
9. **Light-first design, editorial tokens, Anton scoped to mastheads.** The July-2026 redesign
   (`docs/design/redesign/`, templates t01–t11, t02 as the index-page archetype) is the current
   visual authority. Three design generations exist in the repo; only this one is live.
10. **GitHub Actions as the scheduler.** Vercel cron was tried and was silently inert; Actions
    give logs, retries, and secrets handling.

---

## 7. Critical paths — what is load-bearing vs. safe to change

**Load-bearing (do not touch casually; read doctrine + SKILL first):**
- `fsi-app/src/lib/agent/canonical-pipeline.ts` (1,272 lines) — the ONE generation path and the
  single 19-field write site.
- `fsi-app/src/workflows/generate-brief.ts` — the durable orchestration + all fail-closed gates.
- `fsi-app/src/lib/agent/metadata-vocab.ts` — the DB CHECK-constraint boundary. Wrong values here
  = failed writes or corrupted vocab.
- `fsi-app/src/lib/sources/institution.ts` — the single tier resolver; the grounding stamp AND
  the claims-tier audit must run the same code.
- `fsi-app/src/lib/supabase-server.ts` (2,621 lines) — the entire server read layer.
- `fsi-app/scripts/lib/db.mjs` — the guarded-write layer; bypassing it violates rule 015.
- `fsi-app/.discipline/**` — changing it changes what CI enforces.
- `supabase/migrations/**` — append-only; never renumber or edit applied migrations (the 006/007
  collisions are accepted aesthetic debt — leave them).
- The `.mjs` primitive layer under `src/lib/agent/` and `src/lib/sources/` (transport-escalation,
  two-pass-generate, slot-forcing, span-check, pdf-extract…) — the most-tested logic in the repo.

**Safe(r) to change casually:**
- Surface components under `src/components/` (Ledger/DetailSurface pairs) — visual work, guarded
  by the design tokens and the redesign templates.
- `src/data/seed-*.ts` — static fallback only.
- Docs under `docs/` root (mostly historical runlogs).
- `scripts/` one-shot data-ops (already executed; they're an audit record — don't delete, but
  they have no runtime role).

---

## 8. Things that will trip up someone new

1. **The repo is not dotfiles.** The app is `fsi-app/`; work there.
2. **Docs lie about state by design.** Only doctrine is stable; counts/status in any `.md` are
   snapshots. Live state = /admin dashboard, `docs/inventories/migrations.md`, git log, the DB.
3. **Three design generations coexist** (origin dark `.jsx`, May-2026 `design_handoff_2026-05/`,
   July-2026 `docs/design/redesign/`). Only the July one is current. Root `CLAUDE_CODE_PROMPT.md`
   and `docs/FSI_HANDOFF.md` describe an architecture (Railway/Vite, dark editorial) that no
   longer exists.
4. **`fsi-app/STATUS.md` is stale** — it documents an older `redesign/full-migration` branch and
   references a Windows-only preview path. The July redesign superseded it.
5. **Data changes are durable on script execution, not merge.** A "closed without merge" PR may
   have already changed production data.
6. **9 committed migrations are marked NOT YET APPLIED** (146–153, 101) in
   `docs/inventories/migrations.md`. Code that reads their columns ships honest-pending fallbacks.
   Check applied state before assuming a column exists.
7. **The `.mjs`-beside-`.ts` split.** Pure, fixture-tested primitives are `.mjs` (with
   co-located `.test.mjs`); orchestration is `.ts`. A TS-only survey misses ~40 load-bearing
   modules.
8. **Tests exist but there's no `npm test`.** Run `bash .discipline/run-test-suite.sh` (the
   canonical CI list) or `node --test <file>`.
9. **Scheduled work is in `.github/workflows/`, not `vercel.json`.** Hourly source monitoring,
   nightly data audit (one lane is a standing benign red: `unregistered-span-host`), monthly
   trust recompute and Haiku spot-check.
10. **The program is mechanically phased.** `fsi-app/docs/program/GOVERNING-PROGRAM.md` +
    consistency check C5: the active phase (`ACTIVE_PHASE: phase-intake-gate` as of writing)
    declares code anchors that CI verifies against reality. Don't start phase work without
    reading it.
11. **Inline comments are the debt ledger.** TODO/FIXME count in `src/` is ~2. History and
    constraints live in prose comments (decision-log row numbers, post-mortem references),
    `integrity_flags` rows, and migrations.
12. **Shelved ≠ dead.** `SectorSynopsisView`, the 2,325 `intelligence_summaries` rows, the
    `institutions` table, and the sector-activation placeholder are deliberately retained.
    Doctrine says what's shelved; don't delete it as "dead code."

---

## 9. Current program state (snapshot, 2026-07-07 — will drift)

- **Active phase:** `phase-intake-gate` — building the single `mintIntelligenceItem()` chokepoint
  both mint paths must call. Sub-modules (entity-resolve, canonical-entities, source-role) are
  built and tested; the shared chokepoint is the remaining work.
- **Parallel track:** the July redesign integration is essentially through wave 3 (templates
  t01–t11 have integration commits; deviations logged in
  `fsi-app/docs/design/redesign/DESIGN-DEVIATIONS.md` as proposals for operator review).
- **Next phases (defined, not built):** phase-2 (source→sub-source hierarchy), phase-3 (revive
  the dormant freshness/change-detection loop — `change_detected` is currently hardcoded false),
  phase-community, phase-map-q2, phase-A2, phase-7 (cleanup, last).
- **Biggest unproven thing** (per `fsi-app/docs/PRODUCT-STATE-2026-06-20.md`): the end-to-end
  autonomous discover→generate→surface loop has never run as one flow; zero new intelligence
  items had been minted in the month before that audit.

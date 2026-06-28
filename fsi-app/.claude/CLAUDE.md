# Caro's Ledge — Doctrine

> **This file carries DOCTRINE, not STATE.** Operating rules, contracts, and architectural decisions
> live here. Live STATE — counts, what's built, which migrations applied, source/registry numbers,
> per-item status — lives at the live surfaces: the **/admin dashboard**, the **migrations inventory**
> (`docs/inventories/migrations.md`), the **invariant registry** (`.discipline/governance/invariants.mjs`),
> and **git log**. If a number or "what's done" claim appears below, it is drift — query the live surface,
> not this file. (Session history archived at `docs/archive/CLAUDE-session-log-2026-04.md`.)

## What This Is
Sustainability intelligence platform for international freight forwarding. Not a regulation tracker — a
**source-monitoring system** feeding the **five customer-facing surfaces** (Regulations, Market Intel,
Research, Operations, Community; the ratified model — owned by `caros-ledge-platform-intent`).

## Architecture Model
- **Layer 1: Sources** — Public portals where legislation lives (EUR-Lex, Federal Register, IMO, etc.)
- **Layer 2: Intelligence Items** — Specific regulations/findings that live INSIDE sources
- The system monitors sources. Sources produce intelligence items. Manual entry is not the model.
- Source trust: 7-tier hierarchy, trust scoring (accuracy 40% / timeliness 20% / reliability 20% / citation 20%)
- Promotion requires ALL criteria met + human review. Demotion triggered by ANY single condition.

## Dispatch Discipline: Verification Before Authorization (in force from 2026-05-06)

**Any dispatch that includes a downstream effect — database write, agent run, materialization, surface migration, deploy, source-of-truth content publication — must define the verification check inline before the dispatch is authorized.** The dispatch defines what "I did X" means and how to confirm X actually happened. No dispatch ships without this contract.

The PR-A1 California test pattern (commit landing in `arch/pr-a1-california-test-pattern`) is the canonical example: a read-only investigation phase ran first and surfaced that ~80% of the dispatched writes were already done, were duplicates, or were wrong on their premises. The investigation produced six explicit decisions for Jason to authorize before any write touched the database. Each authorized write then ran with its own per-step read-back verification check; if any check had failed, the script would have halted before the next step.

The shape every dispatch with a downstream effect must have:
1. **Inline verification check.** "After step N, query Y. The dispatch is verified if Y returns Z. Halt and surface if it doesn't."
2. **Read-only investigation first when state is uncertain.** If the dispatch's premises are not provable from the current branch state alone, the first deliverable is a read-only investigation report. Writes wait on Jason's authorization based on what investigation reveals.
3. **Per-step verification, not batch.** Each downstream effect verifies its own outcome before the next runs. Failure halts; failure does not silently roll forward.
4. **Honest divergence reporting.** When investigation findings contradict dispatch premises, surface the divergence as findings, not as in-flight work to overrule. Jason decides whether to revise scope or proceed.

The cost of skipping this discipline has been logged: PR-A1's investigation prevented a duplicate CARB source row, an unnecessary update to the deprecated `jurisdictions` column, and a search for a staged_updates drift remediation that didn't exist. Across two prior sessions before this rule landed, two perf waves shipped speculative changes against unverified premises; one regressed (the code-split wave, +1.4 kB per route).

Reference for the pattern: `fsi-app/scripts/pr-a1-investigate.mjs` (read-only investigation), `fsi-app/scripts/pr-a1-execute.mjs` (per-step authorized writes with inline verification), `docs/pr-a1-investigation-2026-05-06.json` and `docs/pr-a1-execute-log.json` (the durable artifacts each phase produced).

## Standing dispatch-inventory rule (in force from 2026-05-20)

**Every Caro's Ledge dispatch begins with a skill-inventory pass before any other work.** The agent inventories the 6 custom platform skills (`caros-ledge-platform-intent`, `sprint-followups-discipline`, `source-credibility-model`, `environmental-policy-and-innovation`, `remediation-discipline`, `analysis-construction-spec`) plus the load-bearing superpowers (`verification-before-completion` always; `writing-plans` + `executing-plans` for 3+ dispatch coordinations; `dispatching-parallel-agents`, `using-git-worktrees`, `subagent-driven-development`, `finishing-a-development-branch` as the dispatch context warrants).

Each custom skill carries a `when_to_load:` block in its YAML frontmatter listing the triggering conditions. The agent scans those blocks against the dispatch's scope and loads every skill whose triggers fire. Cross-skill load is additive, not exclusive: multiple skills typically apply to one dispatch.

This rule exists because skill load was previously discretionary (operator memory + the dispatcher's recall), and the 3-axis skill audit (2026-05-20) found drift in two dimensions: worktrees with stale or missing skill copies, and load-trigger rules added to `sprint-followups-discipline` that were not propagated. The class fix is self-describing frontmatter triggers + this standing rule + per-worktree skill sync discipline.

**How to apply.** The agent's pre-work report enumerates every custom skill considered and explicitly notes which loaded with which triggering condition fired. Example pre-work entry:

```
Skills loaded:
- caros-ledge-platform-intent (trigger: implementation dispatch on five-surface model)
- sprint-followups-discipline (trigger: design dispatch on Sprint 2)
- source-credibility-model (trigger: dispatch touches sources table, citation scoring)
- environmental-policy-and-innovation (trigger: dispatch touches intelligence_items)

Skills considered, not loaded:
- remediation-discipline (no failure-response framing; not a hotfix)
```

The pre-work entry is part of the dispatch report's standard preamble.

**What this rule is NOT.**

- NOT a replacement for the operator's standing memory feedback (`always-use-project-skills`). The memory captures the operator's intent; this rule captures the mechanism.
- NOT applicable to non-Caro's Ledge work (Pet Pursuit, other projects). Those projects have their own skill sets and inventory passes.
- NOT a license to skip the OBS coverage table or DP compliance section. Skill inventory is BEFORE the loop-closure discipline; both are required.

## Code-vs-data state separation (in force from 2026-05-06)

Code state and data state are separate stores with separate change mechanisms.

- **Code changes** land via PR merge to master, then deploy to Vercel.
- **Data changes** land via writes scripts executed with service-role privileges against Supabase. **Data changes are durable on script execution, not on PR merge.**

The PR captures audit trail and governance for the writes (scripts, verification logs, rationale, source citations). The data itself lives in the database regardless of PR merge state.

Rollback implications:
- Code reverts (`git revert` + redeploy) do NOT undo data layer effects.
- Data rollback requires a separate writes script that explicitly reverses prior changes, executed with the same service-role privileges and the same verification discipline.
- A closed-without-merge PR for a writes script still leaves the data changes durable. The PR was the audit trail; the data is the effect.

This separation is why writes scripts in `fsi-app/scripts/` live in the repo even though they're one-shot tools. They're the audit record of every data layer change, retrievable for forensics or rollback construction.

Worked example: PR-A1 (PR #31). The writes script ran during the investigate-execute cycle and updated 4 California intelligence_items, 2 California sources, and 2 sub-national retags (l7, NYC LL97). These changes are live in production right now, regardless of PR #31's merge state. PR #31 commits the scripts, JSON logs, and CLAUDE.md update; it does not commit the data, which already exists.

Implication for smoke testing: any check of the form "visit `/map`, confirm California shows 4 items" should pass _right now_, before any merge of PR #31. If it doesn't, that surfaces a surface-layer consumption bug, not a data layer issue.

## Reuse-before-construction (in force from 2026-05-07)

Before constructing a new component, abstraction, or utility, search the codebase for an existing one that serves the role. The default is reuse-with-adaptation, not net-new construction.

When investigation finds an existing piece that can serve, adapt it. When it doesn't, construct. The investigation phase already required by verification-before-authorization is the natural place to identify reuse opportunities — the question "does this already exist?" should be near the top of every investigation.

Construct only when:
- No existing component serves the role
- Existing component is mismatched in scope (forcing it would create coupling that's worse than constructing fresh)
- Cost of adapting exceeds cost of constructing

Worked examples from Wave 2 (2026-05-06):
- PR-D dispatch said "create UserFooterDropdown component"; investigation found `UserMenu` already serves that exact role. Refactor reduced to removing duplicate rail entries.
- PR-D dispatch said "scope F8 jump-to-top FAB"; investigation found `BackToTop` component already existed with full scroll logic. Two-line mount in AppShell.
- PR-E dispatch said "build sector taxonomy"; investigation found `ALL_SECTORS` (40 sectors with keyword arrays) already in `lib/constants.ts` plus `matchResourceSector()` filter. Chips wired to existing data, not inert UI.
- PR #37 cleanups dispatch identified W2.F orchestration mapping by searching existing code rather than building a new orchestrator.

Cost saved across Wave 2: ~40 minutes of net-new component design plus the ongoing maintenance cost of duplicates.

This principle pairs with verification-before-authorization. Investigation surfaces what exists. Reuse adapts what's there. Construction is the last resort, not the first instinct.

### Retrieval before generation — extends reuse to work-products and data (in force from 2026-06-23)

Reuse-before-construction above governs CODE (components, abstractions, utilities). The same default extends to WORK-PRODUCTS and DATA: **before generating, discovering, or re-deriving an answer, first check whether it already exists** — in the data (another column on the row, the item's own `agent_run_searches` pool, `provisional_sources`, the `sources` registry) or in prior work (earlier sessions, prior dispatch artifacts) — use what is found, and generate only the genuine residual. Naming the stores is deliberate: "check whether it exists" alone is too vague to follow; the WHERE-to-look list is what makes the discipline mechanical enough to honor. This binds hardest before any batch that spends.

This is a standing process discipline, registered as invariant RD-8 (exempt, process-class — like RD-2/RD-3, scoped by the meta-gate). It earned a rule because the principle was scoped wrong and slipped: reuse-before-construction covered code, verification-before-authorization framed its read-only-first for dispatch WRITES, and diagnose-before-fixing is general spirit — none said "the answer/data may already exist; check before (re)generating it." Worked example (2026-06-23): the reg corpus's enacted-text URLs were ALREADY discovered by the prior deep-dive generate and stored as corroborators in each item's `agent_run_searches` pool, so the backward re-point operation is PROMOTE-the-stored-URL (near-free), not re-discover (spend). A retrieval check first turned a discovery batch into a promotion. Pairs with the no-silent-truncation rule (the prior pass's output landed somewhere — find it).

## Development-process discipline — Interpretable Context Methodology (DEV PROCESS ONLY; in force from 2026-06-23)

Adapted from ICM (Van Clief & McDermott, arXiv:2603.16021) as sharpenings of HOW WE DEVELOP Caro's Ledge — the Claude + Claude Code + operator relay, staged review, edit-source discipline. Source: `docs/design/icm-dev-process-notes.md`.

**Boundary (non-negotiable).** These govern DEVELOPMENT, NOT how the product RUNS. The product runtime is AUTONOMOUS BY DESIGN — Layer B/C enforcement, audit gates, fail-closed grounding — built so a human is NOT the final correctness catch. ICM's premise (human-in-the-loop at every stage) is the OPPOSITE of the runtime goal. Never apply these to the runtime: do not add human-review gates to the autonomous pipeline, do not restructure generation toward review-at-each-stage. If a proposed "improvement" would make the running product need a human it was built not to need, that is the boundary being crossed — reject it.

### Reference-vs-working-artifact diagnostic (standing diagnostic step)

When an output is wrong (a brief, a generated artifact), FIRST classify the failure before diagnosing:

- **REFERENCE problem** — the rules/skill/prompt that should constrain generation are underspecified. Cure in the SKILL/system-prompt (applies to every future brief). Worked example: the producer-status overstep + the missing 2038-ban were REFERENCE failures — the skill's coverage-forcing didn't demand the qualification.
- **WORKING-ARTIFACT problem** — the input content was incomplete or mis-delivered to the model. Cure in the PIPELINE/delivery (the bytes that reach the model). Worked example: the truncation defect — the law was truncated before it reached the model; the rules were fine, the input wasn't.

The frame routes the fix before diagnosis. Misrouting wastes the fix — patching the skill when the input was truncated, or re-fetching when the skill was silent. Ask "reference or working-artifact?" first.

### Edit the source, not the output (standing rule)

Editing an OUTPUT patches the binary; editing the SOURCE (skill, prompt, pipeline) fixes the compiler. **A correction made to the SAME output framing across multiple runs is debugging information pointing at a fixable SOURCE-level problem — fix the source, not each output.** Recurring output edits are a BACKLOG of source-level fixes, not a maintenance routine. This is the difference between a system that needs the operator forever and one that improves with use (the autonomy goal). Pairs with retrieval-before-generation / RD-8: before re-deriving, check what exists — and when the re-derivation keeps needing the same correction, that correction belongs in the source. Worked examples: the legal-line + qualification-capture disciplines landed in the SKILL (+ EP-8 invariant), not as per-brief edits; the truncation fix landed in the PIPELINE, not as per-brief re-fetches.

### Scope-down vs full-delivery — know which the task needs

Stage-scoped context (give each stage only what it needs; models degrade on info buried in long contexts — "lost in the middle", Liu et al.) is correct WHEN relevance is pre-identifiable: dev tasks, code stages, skills scoped per task. **But regulatory grounding is the domain exception: relevance is NOT pre-identifiable — the qualifying clause, the carve-out, the per-year trajectory can be ANYWHERE in the law, and a scoping pass would discard exactly the exception that changes the answer.** That is why the truncation fix REMOVED caps and delivers the FULL document + coverage-forcing — the deliberate OPPOSITE of scope-down, and correct domain design. **Standing guard: do NOT "optimize" regulatory grounding by re-introducing scoping/context caps — that re-creates the truncation defect.** Scope-down where relevance is knowable in advance; full-delivery-plus-coverage-forcing where it isn't.

### Observability is sound; traceability is the named gap (design-only, scale-gated)

Validation (no action): our committed migrations, PRs, the disposition ledger, `integrity_flags`, and the prove-on-one artifacts make every intermediate a readable artifact — observability by construction, no separate explanation layer. Keep it. The named GAP is TRACEABILITY: observability = you can read the output; traceability = you can trace a wrong phrase back to the instruction/source that caused it. We have FACT→source traceability (`section_claim_provenance` ties a claim to its span + source); we LACK output-quality→instruction traceability (which prompt discipline / skill section produced a given framing). DESIGN-ONLY, do NOT build at 2-person scale: a lightweight trace of which Part-D discipline / skill section governed a claim's treatment would speed the recurring-edit diagnosis above — a future direction, revisit when scale warrants.

## Design audit framing (in force from 2026-05-07)

**Design audits are commentary on design fidelity. Preview files are design exploration source-of-truth, not architectural authority. When audit findings conflict with intended use, intended use wins.**

The preview files in `design_handoff_2026-04/preview/` are static HTML explorations of visual direction. They predate the live Next.js surfaces and intentionally lag behind them — preview HTML is the place to try aesthetic ideas cheaply, not the place that locks the architecture. When a preview shows a tab roster, layout, or affordance that the live surface no longer matches, the live surface is the authoritative shape; the preview gets updated to reflect the live structure (or the divergence is documented and accepted).

Audit findings split cleanly along this axis:

- **Functional and factual fixes** (broken click target, wrong route, missing aria-label, hydration warning, divergence between two live surfaces that both claim to be authoritative) — proceed autonomously per verification-before-authorization. The dispatch contract carries them.
- **Aesthetic drift the system can resolve from intended-use signals in dispatch context** (preview shows old tab list, live ships new tab list, dispatch context confirms the new list is intended) — proceed autonomously; update the preview to match the live surface, or note the intentional divergence.
- **Aesthetic drift the system cannot resolve from intended-use signals** (preview shows a treatment the live surface no longer ships, but no dispatch context tells the agent which one is intended) — route to integrity flags as a `category='design_drift'` row for Admin review, NOT to Jason chat. The flag becomes a tracked decision that survives session boundaries.

The principle eliminates the bottleneck where every audit finding routed to Jason for adjudication. Most findings are functional and clearly resolvable. The genuinely ambiguous ones — where intended use is the only way to break the tie — surface as durable Admin queue items, not as chat interruptions.

## Accordion default-state (in force from 2026-05-07)

**Accordions are CLOSED across the platform.** Never open the first category by default. The pattern `defaultOpen={i === 0}` is forbidden.

A first-open-by-default accordion makes the surface look pre-judged: it asserts that the first category is the most important without the operator having said so. Closed-by-default keeps the surface neutral and lets the operator's interaction reveal where attention goes. The pattern is enforced by code review and by integrity flags when audits surface it.

This applies to every accordion in the app: regulations grouped by topic, operations regions, settings sub-sections, archive items grouped by reason, anywhere `<Accordion>` or its equivalent is mounted.

- Next.js 16 / React 19 / TypeScript / Tailwind v4
- Supabase (PostgreSQL) — live. Applied-migration count is STATE — see `docs/inventories/migrations.md` and `supabase/migrations/`.
- Zustand stores (resourceStore, navigationStore, settingsStore, exportStore, sourceStore)
- lucide-react icons, GSAP available

## Perf Work Discipline (in force from 2026-05-06)

**Rule: no perf dispatch without measurement evidence.** Before any "perf wave," "code-split," "lazy-load," or "reduce X" dispatch, the first deliverable is a measurement that justifies the lever. If the measurement says the lever does not move the bottleneck, the dispatch is wrong and gets rewritten — not executed anyway. The full workflow lives in [docs/PERF-PLAYBOOK.md](../../docs/PERF-PLAYBOOK.md).

### Live now (free, build-time)
- **`@next/bundle-analyzer`** — run `npm run analyze` to produce per-chunk composition reports at `.next/analyze/`.
- **`scripts/measure-bundles.mjs`** — run `npm run perf:bundles` after a build for a grep-able per-route entry-vs-async chunk inventory. Snapshot before and after a perf change to confirm direction. Baseline at `docs/perf-snapshot-2026-05-06.txt`.

### Deferred until traffic warrants it
- **Vercel Speed Insights** (real-user Web Vitals) — deferred, not rejected. Single-tenant pre-pilot traffic is too sparse to drive decisions. Reactivate when daily sessions per top route reach ~100+ and at least one perf question on the table genuinely requires RUM. Cost at reactivation: $10/month/project on Pro.
- **Vercel Analytics** (page traffic + custom events) — same posture, same reactivation criteria, same $10/month at Plus tier. Typically enabled together with Speed Insights.

The deferral criterion is **traffic volume, not budget**. When the platform onboards a second org or the Dietl/Rockit pilot expands, revisit. Until then, build-time analysis is the right tool.

### Anti-patterns (logged in the playbook from past failures)
- The 2026-05-06 code-split wave: wrapped 6 heavy client components in `next/dynamic({ ssr: true })` from server pages. Net effect was +1.4 kB regression per route because `ssr: true` from a server component does NOT defer chunks in App Router; deferral requires `ssr: false` in a client-component shim, which violates SSR. Read `docs/PERF-PLAYBOOK.md` § "Anti-patterns" before reaching for `dynamic()`.

**When to skip the playbook**: clear bug fixes (e.g., the ISR Writes burn was a single misconfigured `revalidate=60` line), correctness-driven work that happens to also affect perf, or architectural changes whose math-confirmed gain is the proof. Perf-FIRST work follows the playbook.

## Design System
- **Light-first** (Apple HIG principles from frontend-design skill)
- Body typeface: Plus Jakarta Sans (300-700). Display typeface: Anton, scoped to masthead title, `.card-head h3`, and `.brief-section h3` only — see STATUS.md and the design previews for the canonical surfaces. Do not use Anton in body copy or in arbitrary section headers.
- Semantic color tokens only — no raw hex in components
- 8pt spacing grid, WCAG AA contrast, 44pt touch targets
- No ambient orbs, no dark-first aesthetic

## Customer Surfaces (ratified five-surface model)
The five customer-facing surfaces are **Regulations, Market Intel, Research, Operations, Community** —
owned by `caros-ledge-platform-intent`. The earlier "7 intelligence domains" navigation is RETIRED; do
not reintroduce a sixth+ customer surface without operator authorization (invariant PI-1). Each
intelligence `item_type` routes to exactly one surface (the Format Mapping in
`environmental-policy-and-innovation`); customer reads gate on `provenance_status='verified'`.

## Source Registry
Source registry counts + current state: /admin Source Health Dashboard. Counts move per commit; static
claims here would drift.

## Build state — NOT here (doctrine-not-state)
What is built / not built, accessibility coverage, completed components, applied-migration counts, and
brief-coverage numbers are STATE, not doctrine — they drift the moment they're written. Read them live:
**/admin**, `docs/inventories/migrations.md`, **git log**. (The prior "Completed / All Domain Views Built /
Accessibility / Not Started / Phase B Complete" lists were removed for this reason — they claimed false
completion and a retired 7-domain model.)

## Key Files

Foundation:
- `src/types/source.ts` — Source trust framework
- `src/types/intelligence.ts` — Intelligence item types
- `src/lib/trust.ts` — Trust scoring engine
- `src/lib/constants.ts` — Domains, modes, jurisdictions, verticals
- `src/data/source-mapping.ts` — Legacy resource → source linkage
- `src/stores/sourceStore.ts` — Source state management
- `src/components/sources/SourceHealthDashboard.tsx` — Source health UI
- `supabase/migrations/004_source_trust_framework.sql` — Trust framework schema
- `supabase/seed/seed-sources.sql` — Source registry seed

Agent runtime — the CANONICAL generation pipeline (do not modify without reading SKILL.md):
- `src/lib/agent/canonical-pipeline.ts` — the ONE generation path: generate → register → section → ground → grow. The 19-field write site (`synthesiseAndWriteBrief`), the span→source→tier stamp via the institution resolver, the claim-ledger grounding + `validate_item_provenance`.
- `src/workflows/generate-brief.ts` — the durable workflow orchestrating the steps (preflight → generate → register → section → ground → grow; tiered re-ground/re-research/erase). `/api/agent/run` starts this.
- `src/lib/agent/system-prompt.ts` — the synthesis/grounding contract.
- `src/lib/agent/parse-output.ts` — YAML parser (3-tier fallback for fence/inline drift).
- `src/lib/agent/metadata-vocab.ts` — live DB vocabularies (the CHECK-constraint SoT the write maps each field to).
- `src/lib/sources/institution.ts` — canonical institution → tier resolver (single module, consumed by the stamp AND the claims-tier audit).
- `src/lib/sources/canonical-fetch.mjs` — Browserless content-fetch helper.
(Retired: `source-pool.ts`, `browserless.ts`, `supabase/seed/b2-runner.mjs` — superseded by the above.)

Phase B.2.5 surfaces:
- `src/components/sources/IntersectionDetectionView.tsx` — Intersections sub-tab
- `src/components/sources/CanonicalSourceReview.tsx` — Canonical-source review tab + bulk actions
- `src/components/sources/B2ProgressBanner.tsx` — auto-refreshing regen progress strip
- `src/components/resource/IntelligenceMetadataStrip.tsx` — per-item metadata strip above brief
- `src/app/api/admin/intersections/route.ts` — intersection detection RPC wrapper
- `src/app/api/admin/canonical-sources/{pending,decide,bulk-approve,bulk-classify,recommend-classification}/route.ts` — canonical-source review pipeline
- `src/app/api/admin/b2-progress/route.ts` — regen progress aggregator
- `src/app/api/admin/recompute-trust/route.ts` — trust score Bayesian-prior recompute

## Constraints
- All exports use Blob download (no clipboard API, no window.open)
- Transport mode priority: air → road → ocean → rail
- Staged updates require human approval
- Claude skill runs separately, not embedded
- Light mode is default; dark mode is opt-in variant

## Integrity flags — agent contract (in force from 2026-05-07)

There are TWO distinct integrity-flag surfaces in this codebase. They are NOT interchangeable:

1. **Per-brief flags (migration 035)** — boolean columns ON `intelligence_items` (`agent_integrity_flag`, `agent_integrity_phrase`, `agent_integrity_flagged_at`, `agent_integrity_resolved_at`, `agent_integrity_resolved_by`). The full_brief trigger from migration 035 auto-detects integrity-concern phrases ("unable to verify", "could not confirm", etc.) and flips the flag. Admin resolution lives at `/admin → Integrity flags` (component: `IntegrityFlagsView.tsx`). Use this for problems with a SPECIFIC brief.

2. **Platform-level flags (migration 048)** — table `integrity_flags` with `category`, `subject_type`, `subject_ref`, `description`, `recommended_actions`, `status`. Admin queue lives at `/admin → Platform flags` (component: `PlatformIntegrityFlagsView.tsx`). Use this for concerns that AREN'T tied to a single intelligence_items row.

### When an agent surfaces a platform-level concern

When an agent detects a category-fitting concern it cannot resolve from dispatch context, it writes a row to `integrity_flags` via service-role INSERT. The flag becomes a tracked decision that survives session boundaries.

Schema (per migration 048):

```
- category: design_drift | data_quality | source_issue | coverage_gap |
            data_integrity | surface_concern
- subject_type: surface | item | source | jurisdiction | system
- subject_ref: route path | item_id | source_id | jurisdiction code |
               system component name
- description: human-readable description (1-3 sentences)
- recommended_actions: jsonb array of {action, rationale}
- status: open (default) | in_review | resolved | archived
- created_by: agent identifier (e.g., "wave-4-a5-agent",
              "wave-5-coverage-investigation")
```

Category guidance:
- `design_drift` — preview HTML diverges from live surface, intended state ambiguous
- `data_quality` — missing/malformed metadata across many rows
- `source_issue` — source registry inconsistency (broken URL, miscategorized tier, unverified canonical)
- `coverage_gap` — jurisdiction or topic with thin or zero coverage
- `data_integrity` — cross-row referential or invariant break
- `surface_concern` — UI/UX problem the agent surfaced during dispatch work

Flags surface in `/admin → Platform flags` for owner review. Status flow: `open → in_review → resolved | archived`. The platform admin (Jason) resolves the flag by picking from `recommended_actions` and optionally adding a `resolution_note` — this becomes the authoritative answer for future investigations of the same concern.

The agent never writes to chat about a category-fitting concern it can't resolve. The flag IS the channel.

## Known data debt

- **3 institutional body rows typed as `tool`** (g3 EEA, g12 ECLAC, t3 OECD Environment) are intelligence ABOUT institutions, not tools — they belong in the sources registry. The earlier "defer to Phase D" framing is SUPERSEDED: the source-vs-item reclassification mechanism now exists and is enforced — the guarded `reclassifyToSource` path (`scripts/lib/db.mjs`), rule 019, migration 135's DB guard, and the EP-4 / SC-2 invariants + `orphan-source-audit`. These three are `reclassifyToSource` candidates (register the institution as an active source, then archive the item). Whether they are still mis-typed is STATE — check /admin; if still `item_type='tool'`, reclassify via the built mechanism rather than leaving them mis-typed.

## API Security Policy
- **All API routes require authentication by default.** Every route must call `requireAuth()` from `src/lib/api/auth.ts` before processing. Unauthenticated requests receive 401.
- **Unauthenticated public routes require explicit justification** documented here with the route path and the reason it is public.
- **Rate limiting is enforced on all API routes.** 60 requests per minute per authenticated user. Exceeding the limit returns 429 with Retry-After header. Violations are logged to console.
- Auth guard: `src/lib/api/auth.ts` — verifies Supabase JWT from Authorization header.
- Rate limiter: `src/lib/api/rate-limit.ts` — in-memory sliding window. Replace with Redis in production.
- `robots.txt` blocks all AI crawlers and all `/api/`, `/dashboard/`, `/settings/`, `/admin/` routes.

### Authenticated Routes

All routes under `src/app/api/` call `requireAuth()` except `/api/auth/callback` (Supabase OAuth callback) and `/api/worker/*` which use worker-secret auth. Admin-only routes additionally check role via the admin role gate (`requirePlatformAdmin` or equivalent).

The route inventory drifts per commit; query it directly with `find src/app/api -name route.ts | sed 's|src/app/api||;s|/route.ts||'`. Listing routes here would always be stale.

---

## AGENT ARCHITECTURE

### Current model (format-selected single-brief generation; contract version is emitted live as `regeneration_skill_version`, not pinned in this doc)

**Format-selected single-brief generation.** `/api/agent/run` starts the `generate-brief` workflow for one `intelligence_items` row and produces ONE brief in the format selected by `item_type`:

- `regulation`, `directive`, `standard`, `guidance`, `framework` → regulatory_fact_document (15 sections — 14 content + Sources; most conditional)
- `technology`, `innovation`, `tool` → technology_profile (8 sections)
- `regional_data` → operations_profile (8 sections)
- `market_signal`, `initiative` → market_signal_brief (8 sections)
- `research_finding` → research_summary (6 sections)

Each generation writes the **19-field contract** (`full_brief` body + 18 metadata fields, incl. the four intersection-readiness fields), mapped to the live DB vocabularies and written at the single site `synthesiseAndWriteBrief`. See SKILL.md + `src/lib/agent/canonical-pipeline.ts` for the contract. Brief-coverage counts are STATE — read /admin, not here.

Runtime files (do not modify without reading SKILL.md first) — see the Key Files "Agent runtime" block (canonical-pipeline.ts is the single path) for the canonical list, including which runners are superseded:
- API route: `POST /api/agent/run` (starts `src/workflows/generate-brief.ts`)

Cost: ~$0.15 per item generation (Browserless + Sonnet). The eligible-item count is STATE — query /admin or the corpus, not this doc.

### Archived (pre Phase B.2.5)

**Multi-sector synopsis model.** The agent previously identified all items in a source URL, ran delta detection, and generated 15 sector synopses for all signal items in a single response. `sector_contexts` records were injected into the user message at runtime; `synopsis_prompt` per sector made each synopsis sector-specific. This model was retired when the SectorSynopsisView UI surface was deprecated. The 2,325 `intelligence_summaries` rows generated under that model are stale and pending decision (retire view + delete rows OR regenerate under new contract — see `docs/intelligence_summaries_proposal.md`).

**Anthropic Console Managed Agent.** Earlier CLAUDE.md revisions referenced a Console-side managed agent (`agent_011CZwC8PTbAfM355bVK8w7G`). Current code does not invoke the Managed Agent — `/api/agent/run` calls `api.anthropic.com/v1/messages` directly with `model: claude-sonnet-4-6`. The Managed Agent ID may still exist in the Anthropic Console but is not part of the running architecture.

### Permitted live Claude API calls in this codebase

All other routes read from the `intelligence_items` table. No live Claude API calls happen at page load or on unauthenticated user requests.

| Route | Model | Purpose | Rate limit / cooldown |
|---|---|---|---|
| `/api/agent/run` | claude-sonnet-4-6 | Per-item brief regeneration, format-selected | 1h cooldown per source |
| `/api/ask` | claude-sonnet-4-6 | User natural-language questions | 10/workspace/hour |
| `/api/admin/scan` | claude-sonnet-4-6 + web_search | Admin-triggered regulatory scan; stages results in `staged_updates` for review | 4h cooldown |
| `/api/admin/sources/recommend-classification` | claude-haiku-4-5 | Provisional-source AI classification (cached on row) | per-call |
| `/api/admin/canonical-sources/recommend-classification` | claude-haiku-4-5 | Canonical-source candidate AI classification (cached) | per-call |
| `/api/admin/canonical-sources/bulk-classify` | claude-haiku-4-5 (concurrency=5) | Batch classification of canonical candidates (≤30/call) | maxDuration 60s |
| `/api/admin/spot-check/recurring` | claude-haiku-4-5 | Monthly calibration spot-check: re-classifies a 20-source sample via the verification Haiku (`VERIFICATION_HAIKU_SYSTEM_PROMPT`) to detect classifier drift — source classification, NOT brief generation. Worker-secret auth; honors the global scrape off-gate (Phase 0.1). Sanctioned direct-Haiku caller; mirrors recommend-classification. | 4h cooldown; monthly cron (currently disabled) |

### Non-negotiable rules

- DO NOT change `/api/agent/run` to per-sector calls. The format-selected single-brief contract is the new architecture.
- DO NOT make live Claude API calls outside the routes above.
- DO NOT rebuild the agent runtime files without reading SKILL.md and this section first.
- DO NOT create duplicate intelligence items. `/api/agent/run` UPDATES the existing row matching `source_url`. `/api/admin/scan` stages new items in `staged_updates` for admin review — never auto-inserts.
- DO NOT leave any item without a full_brief. Every regeneration must emit the 19-field contract or fail honestly. Failed regenerations retain the older `regeneration_skill_version` and re-run on the next pass; the runner is idempotent.
- DO NOT process provisional sources. Every API call, scrape job, AI pipeline, embedding generation, health check, and search indexing task MUST gate on: `WHERE status = 'active' AND admin_only = false`. Provisional sources get one URL reachability check on insert and nothing more. Activation is a data change (set `status='active'`, `admin_only=false`), not a code change.

### agent/run error-swallow post-mortem (in force from 2026-05-08)

**Treat any `.select()` that destructures `data` without `error` as a code smell.** Always destructure the `error` field even if you intend to ignore it, and log when it fires.

What went wrong: `/api/agent/run` line 37 (pre-Wave-1a) was `const { data: sourceRecord } = await supabase.from("sources").select("id, last_scanned, status, tier")...`. The `error` field was dropped from the destructure. The `last_scanned` column had been referenced in code but never landed in any migration. PostgREST returned a "column does not exist" error on every invocation; the error was swallowed; `sourceRecord` was `null` on every call.

Four cost-protection mechanisms gated by `sourceRecord?.X` were silently disabled for an unknown duration:
1. **Provisional source gate** (line 44) — `sourceRecord?.status === "provisional"` was always falsy.
2. **Per-source pause check** (line 56) — `pauseReason(supabase, sourceRecord?.id)` was called with `id=undefined`, reducing the check to global-pause-only.
3. **1h scan cooldown** (line 62) — `sourceRecord?.last_scanned` was always undefined.
4. **last_scanned timestamp UPDATE** (line 374) — `sourceRecord?.id` was undefined, the UPDATE never ran.

Caught by the gate 3 precheck during Path B Wave 1a setup, not by production telemetry — because per-call telemetry didn't exist (which is itself part of what Wave 1a fixes via the `agent_runs` table). Wave 1a step 1 lands migration 051 (`ADD COLUMN IF NOT EXISTS last_scanned`), backfills from `sources.last_checked`, and adds the missing `error` capture at line 37 with a `console.warn` log.

Future-agent rule: when reviewing or writing Supabase calls, look for `const { data } = await supabase...` destructures. If the `error` is dropped, that's the bug shape this post-mortem prevents.

---

## Sector Activation (future feature, placeholder live)

**Status: SHELVED with placeholder UX.** Per-sector reporting is on the platform roadmap but not active. See `docs/intelligence-summaries-proposal.md` for the cost decision (2026-04-30) — the 2,325 `intelligence_summaries` rows stay, the `SectorSynopsisView` component stays, and per-sector synopsis regeneration is deferred until multi-workspace onboarding ships.

### What ships now (placeholder)

- Sector profile selection at `/onboarding` (first-time flow) and `/profile` (revisit/edit). Both surfaces use the shared `SectorSelector` component (`src/components/profile/SectorSelector.tsx`).
- "Notify me when per-sector reporting activates" toggle on both surfaces. Writes:
  - `workspace_settings.notify_on_sector_activation` (boolean)
  - `workspace_settings.sectors_activation_signup_at` (timestamp; stamped on first opt-in only, never overwritten on subsequent toggles)
- Migration 025 (`025_sector_activation_interest.sql`) adds the two columns. Schema migration — apply BEFORE merging the dependent code per STATUS.md rule 12.

### What activates the feature

When per-sector reporting is approved for activation:

1. Pick the per-sector architecture (lazy cache vs precomputed vs runtime synthesis) at activation time against then-current cost and latency constraints. The Path A vs Path B framing in `docs/intelligence-summaries-proposal.md` is a 2026-04-30 snapshot — revisit fresh.
2. Build the per-sector synopsis pipeline (writes back to `intelligence_summaries` or whichever store the architecture picks).
3. Read `workspace_settings WHERE notify_on_sector_activation = true` to drive a one-time email/in-app announcement at activation launch.
4. Wire SectorSynopsisView (currently still rendered against `full_brief` with fallbacks) to consume the per-sector store.

### What NOT to do until activation is approved

- DO NOT regenerate `intelligence_summaries`. Cost is not justified at current single-workspace usage.
- DO NOT delete the 2,325 existing rows. Decision was SHELVE not RETIRE.
- DO NOT remove `SectorSynopsisView`. The UI surface stays — the data path stays the same as today (reads `full_brief`).
- DO NOT auto-mount `/onboarding` on first login until the activation feature ships. The route exists for explicit linking from invite/announce flows; first-login auto-mount is a separate feature decision.

---

## Operating Principle: Creative intelligence, accurate grounding

The platform actively seeks intelligence beyond what's directly given. When source coverage is thin, it searches for additional sources. When canonical sources are broken or missing, it finds replacements. When regulations intersect non-obviously, it identifies and synthesizes the intersection. When a topic suggests sources should exist that aren't in the registry, it surfaces them as candidates.

This is the platform's core value: creative AND accurate. Generic LLMs are creative but unreliable. Conservative compliance tools are reliable but limited. Caro's Ledge does both.

Every component honors this principle:
- Source discovery: actively seeks canonical sources for items missing or broken sources
- Citation extraction: surfaces new sources from agent runs, even when not explicitly given
- Intersection detection: identifies non-obvious regulation interactions before users ask
- Brief generation: does substantive work to populate sections with real content
- Anticipated guidance: identifies what's likely coming based on scheduling sources
- Synthesis briefs: synthesizes cross-jurisdictional patterns from component regulations

But every claim is grounded in a verifiable source. The integrity rule is non-negotiable:
- No invented facts, no hallucinated content, no plausible-sounding generic filler
- When source coverage is thin, sections are honestly omitted (not filled with invented content)
- When canonical sources can't be found, the gap is flagged (not papered over)
- All synthesis is grounded in component sources cited inline
- All discovered sources are verified before integration

The agent's mandate: be creative about WHAT to find, conservative about WHAT to claim. If you can't ground a claim in a verifiable source, omit it. If you find new sources that should be tracked, surface them as provisional. If you notice connections that should be flagged, document them with citations.

The system's mandate: facilitate creative discovery (dynamic source pools, search-for-canonical-sources, citation extraction, intersection detection) within accuracy guardrails (provisional source review, integrity rule enforcement, citation verification, trust scoring).

This principle applies across every phase of platform development. Features should be evaluated against it: does this make the platform more creatively intelligent without compromising accuracy?

---


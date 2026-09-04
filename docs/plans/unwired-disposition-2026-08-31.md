# Unwired-module disposition register — Wave W1

**Date:** 2026-08-31 · **Lane:** W1 · **Plan reference:** `BUILD-PLAN-remediation-and-population.md`
§1 (completed waves), §6.3 ("the remaining unwired-module inventory ... now covered by new lane W1"),
§8 (ADR-015 owed run-intake surface).

**Purpose.** Every module below is real, working, tested code with zero production callers (confirmed
by repo-wide grep in this session, not just the lane audit's static graph) — or, for the three
admin routes and the demotion path, a real handler with no discoverable invoker. For each: what it
does, why it's unwired, the exact wire site, what's lost on delete, and a decisive recommendation.
Ratify column by column; each row stands alone.

## Worktree-state note (read before ratifying)

This register was built in worktree `wt-w1` (branch `build/wave-w1`), which branches from
`origin/master` and does **not** contain Waves A1–A4, S1, S2, G1, or M0 — those landed on sibling
worktrees not merged into this branch. Two consequences, checked directly against this tree's actual
files rather than assumed from the plan:

- **Already resolved elsewhere, not re-litigated here:** Wave A3 (`d63cb902`) removed the
  `critical_conflict`/`paywall_introduced` demotion-trigger vocabulary on its own branch. This tree
  still shows both cases live in `trust.ts` — expected, not a regression; A3's fix lands independently
  when that branch merges. This register's trust.ts row (§J) covers the **separate, broader** finding
  A3 flagged and left open: `evaluateDemotion` itself has no production caller at all, trigger-vocabulary
  fix notwithstanding.
- **Paths already moved:** the audit's §4 table names `src/lib/sources/census-writer.mjs` and
  `src/lib/sources/intake-url-corpus.mjs`. On this tree both live under `src/lib/intake/` (matching the
  current `F25-module-liveness.mjs` allowlist, not the audit prose). Rows below use the real, current
  path and note the audit's stale name once.

All 26 modules below were verified present, at the paths given, on this branch as of this commit —
none were casualties of a wave not in this tree.

---

## Summary — ratify in one pass

| # | Module | Recommendation | One-line basis |
|---|---|---|---|
| 1 | `src/lib/llm/program-total.mjs` | **DELETE the urgency, WIRE the fix** — fold into `spend-guard.mjs` | Real pagination-undercount bug (`agent_runs` 23,564 rows, 23× the 1000-row cap) but the standing ceiling it protects is retired under build-phase regime — low urgency, still correct to close |
| 2 | `src/lib/llm/spend-gauge.mjs` | **WIRE** — mount on `/api/health/spend` | Fully built read-only spend dashboard nothing renders; sibling route already exists to host it |
| 3 | `src/lib/llm/metered-emit.mjs` | **DELETE** | Its only possible caller (a batch-classification runner) does not exist anywhere in the repo — this guards a path with no other half built |
| 4 | `src/lib/llm/metered-gate.mjs` | **KEEP, no action** | Correctly wired to `metered-emit.mjs`; disposition follows #3 automatically |
| 5 | `src/lib/agent/derived-consistency.mjs` | **WIRE** — call from `canonical-pipeline.ts:1669` | One-sentence integration next to the sibling Gate-A call already there; own header comment already (falsely) claims this is done |
| 6 | `src/lib/dashboard/credibility.ts` | **DELETE** | Its target render surface (dashboard item cards) was redesigned since this was written; no current component has the seam it expects |
| 7 | `src/lib/dashboard/critical-items.ts` | **DELETE** | The hardcoded copy it claims to replace no longer exists — `DashboardHero.tsx` was rebuilt (Template-01, aggregate-driven) without ever integrating this module |
| 8 | `src/lib/coverage/identity.mjs` | **WIRE** — call from `census-writer.mjs:73` (`buildCensusRow`) | The DB columns it exists to compute are being populated by something outside this repo; this is the one legitimate writer |
| 9 | `src/lib/export/download.ts` | **DELETE** (with its dead caller tree) | Sole caller `BulkSelectBar.tsx` is itself unreachable; Wave A4 already deletes this whole tree on its own branch — this row just confirms the call on this tree |
| 10 | `.discipline/lib/adr-loader.mjs` | **DELETE** | Built for rule 013, which was deleted 2026-05-21; no surviving rule imports it |
| 11 | `src/lib/intake/census-writer.mjs` | **HOLD** (crawl-rebuild scope) | Correct code, no caller until the ADR-015 crawl rebuild is priced and built — wiring it alone with no walker feeding it writes nothing |
| 12 | `src/lib/sources/api-fetch.ts` | **DELETE** | Not merely uncalled — superseded: `canonical-pipeline.ts` has its own inline `apiFetchForHost` doing the live work; this is a parallel implementation nothing routes to |
| 13 | `src/lib/sources/amendment-diff.mjs` | **HOLD** (crawl-rebuild scope) | Same shape as #11 — correct, tested, waiting on the same undelivered orchestrator |
| 14 | `src/lib/sources/change-sweep.mjs` | **HOLD** (crawl-rebuild scope) | Same |
| 15 | `src/lib/sources/feed-walk.mjs` | **HOLD** (crawl-rebuild scope) | Same |
| 16 | `src/lib/sources/register-walk.mjs` | **HOLD** (crawl-rebuild scope) | Same |
| 17 | `src/lib/intake/intake-url-corpus.mjs` | **KEEP, no action** | Not a walker — a pinned test-fixture table for the intake gates; "unwired" is a graph-tool artifact, not a real gap |
| 18 | `scripts/lib/anthropic.mjs` | **DELETE** | The "canonical" wrapper by its own header, yet every real script-side Anthropic call already goes direct or through `spend-client.ts` — nothing adopted it |
| 19 | `scripts/lib/net-agent.mjs` | **DELETE** | Side-effecting dispatcher-installer nothing imports; if sandbox network instability recurs, wire it then with a real incident behind it |
| 20 | `scripts/lib/urgency.mjs` | **DELETE its .mjs form, keep the logic single-homed** | Hand-copied mirror of `src/lib/urgency.ts` with no importer and no test pinning the two together — the exact divergence pattern that caused run #66's false-collision incident, just not yet triggered here |
| 21 | `scripts/lib/fetch-quality.mjs` | **DELETE**, same reasoning as #20 | Mirror of `src/lib/sources/fetch-quality.ts`, zero importers, zero test |
| 22 | `src/app/api/admin/promotion-policy/route.ts` | **HOLD** | Deliberately fail-closed by design (no policy = no spend); §6 already rules this HOLD pending the community-promotion decision — do not wire ahead of that ruling |
| 23 | `src/app/api/admin/run-intake/route.ts` | **WIRE** — build the admin control + script path | ADR-015's owed surface, promised **twice** (ADR-012 2026-07-11, then ADR-015 2026-07-18) and delivered neither time; zero `agent_runs` in its history |
| 24 | `src/app/api/admin/users/route.ts` | **WIRE** — add a thin admin-console page | Platform-admin-gated user provisioning with no UI; today only reachable by hand-crafted `curl`, which is worse than the small page it needs |
| 25 | `src/lib/trust.ts` — `evaluateDemotion` (whole function) | **WIRE** — call from `recompute-trust`'s per-source loop | Zero production callers of the function itself, not just the two dead trigger cases A3 already removed; `evaluatePromotion` is called from that same loop today, `evaluateDemotion` is not |
| 26 | `scripts/gen/assumption-register-seed.mjs` (WO-20) | **WIRE** — run `--apply` after migration 271 lands | Migration + seeder + 21 tests exist; only a `--apply` invocation is missing; two of this register's own DELETE rows (#20 urgency, and the idf/pedigree constants) are on the seeder's own catalogued list |

**Recommendation split: WIRE 8 · DELETE 10 · HOLD 6 · KEEP-NO-ACTION 2** (26 rows total). *Corrected
2026-09-03 (ruling R-C): this line previously read "WIRE 8 · DELETE 8 · HOLD 6 · KEEP-NO-ACTION 3 (25
dispositioned rows + 1 linked no-action row = 26 total)". That was wrong — a row-by-row recount of each
row's own body-section "**Recommendation: ...**" sentence (the authoritative per-row verdict; see
`w1-dispositions.mjs`) gives DELETE 10, not 8 (rows 3, 6, 7, 9, 10, 12, 18, 19, 20, 21), and
KEEP-NO-ACTION 2, not 3 (rows 4 and 17 only — there is no third KEEP row). Row 4 (`metered-gate.mjs`)
is an ordinary KEEP-NO-ACTION row like row 17, not a separate "linked" exception carried outside the
count; treating it that way is what made the old line total only 25 before the "+1 linked" patch. WIRE
(8, rows 1, 2, 5, 8, 23, 24, 25, 26) and HOLD (6, rows 11, 13-16, 22) were already correct.*

---

## A. Spend-governance stack

### 1. `src/lib/llm/program-total.mjs`
**What it does.** `sumCostRows`/`readProgramTotalPaginated`/`fitsUnderCeiling`/`projectBatchFitsBuffer`
— a paginated reader for the program-total spend check, built to fix a real bug: an unpaginated
PostgREST read caps at 1000 rows and silently under-counts `agent_runs`, which now sits at 23,564
rows (23× past the cap).

**Why unwired.** `spend-guard.mjs` mentions "program-total" only in comments (lines 65, 130-131, 148),
never imports it. Confirmed this session, beyond what the lane audit checked: `seedSpend()` —
the function this module's paginated total is meant to feed — has **zero callers anywhere in the
repo**, not even the "runner script outside the lane" the L09 lane guessed might exist (grepped the
full tree, only `program-total.test.mjs` calls it). The standing dollar ceiling `seedSpend` feeds is
also currently retired-to-informational under the build-phase spend regime (`spend-regime.mjs`), which
is why this has sat unfixed without incident.

**WIRE option.** In `src/lib/llm/spend-guard.mjs`, wherever a caller currently needs the running MTD
total (today: nowhere — that's the gap), call `readProgramTotalPaginated(sb)` instead of any capped
read, and thread its result into `seedSpend()` before the first `assertBudget()` of a run. One sentence:
add a `seedSpend(await readProgramTotalPaginated(sb))` call at the top of whatever process-entry script
first calls `assertBudget` (today none does — see below).

**DELETE option.** Lose the only correct fix for a real, currently-latent undercount. If STEADY-STATE
regime is ever activated and standing dollar ceilings start gating spend again, the ceiling check would
silently trust a 1000-row-capped total 23× smaller than reality.

**Recommendation: WIRE, but treat as low-urgency.** The bug is real and the fix is already written and
tested — closing it is cheap. But nothing calls `seedSpend()` at all right now (build-phase regime does
not gate on dollar totals), so this is "fix it because it's free and correct," not "fix it because
something is exposed today." Wire it in the same change that ever gives `seedSpend` its first real
caller — don't invent a caller just to hang this on.

### 2. `src/lib/llm/spend-gauge.mjs`
**What it does.** `computeGauge`/`readSpendGauge`/`hasPricedLineMarker` — a free, read-only, paginated
MTD/today/per-item spend-actuals view with paid-run-to-priced-line traceability. No ceiling framing by
design (spend-control refactor 2026-07-13).

**Why unwired.** Confirmed: no `src/` or `scripts/` caller of `readSpendGauge`/`computeGauge` outside
its own test. A fully-built, fully-tested spend dashboard reader that nothing renders anywhere a human
would see it.

**WIRE option.** `src/app/api/health/spend/route.ts` already exists as a worker-secret-gated spend
probe (confirmed live, called by `.github/workflows/uptime-probes.yml`) — that route currently computes
its own ad hoc MTD sum rather than calling this module. Replace its inline sum with
`readSpendGauge(sb)` and return the gauge's richer shape (MTD/today/per-item/traceability) in the
response body; one function-call swap in `health/spend/route.ts`'s GET handler.

**DELETE option.** Lose the only paginated, traceability-aware spend view in the codebase; whoever
watches spend keeps reading the narrower ad hoc sum in `health/spend/route.ts` instead.

**Recommendation: WIRE.** This is the cheapest win in the register — an existing, already-cron-invoked
route just needs to call the better function it has sitting next to it.

### 3. `src/lib/llm/metered-emit.mjs`
**What it does.** `openMeteredBatch` — the intended sole path to a metered (Haiku, discounted) batch
run: asserts the metered gate and writes the `agent_runs.fetch_method='batch-marker'` authorization
row BEFORE the batch executes, fail-closed on either gate refusal or marker-write failure.

**Why unwired.** Confirmed: zero importers outside its own test. More significantly, checked this
session beyond the lane audit: **the runner this module exists to gate does not exist anywhere in the
repo.** No `batch-classification` runner script, no caller referencing `METERED_ELIGIBLE_CLASS`. This
isn't a wiring gap in an otherwise-complete feature — the other half was never built.

**WIRE option.** Would require building a batch-classification runner first (out of scope for a
one-sentence wire; there is no existing call site to point at).

**DELETE option.** Lose a correctly-designed authorization primitive for a feature class
(metered/batch classification) that has never been built and isn't scheduled anywhere in the plan's
queued lanes.

**Recommendation: DELETE**, together with its test. If metered batch classification is ever built,
this design (assert-then-mark-before-execute) is worth re-deriving from the git history rather than
carrying dead code forward on the chance it's reused verbatim.

**EXECUTED** — lane DEAD-EXEC, 2026-09-04, commit `18e62c28`. Module and test deleted. Its downstream
row (#4, `metered-gate.mjs`) is now newly unwired as a direct, verified consequence — per that row's own
"if #3 is deleted, leave this module in place" instruction, it was NOT deleted; added to F25's
`PROVEN_BUT_UNWIRED` allowlist instead, citing this row.

### 4. `src/lib/llm/metered-gate.mjs`
**What it does.** `assertMeteredCallAllowed`/`isMeteredCallAllowed`/`MeteredCallForbiddenError` —
standing financial law (operator ruling 2026-07-25): only Haiku batch-classification may ever be
metered, with named scoped/expiring amendments.

**Why unwired (in effect).** Genuinely imported (by `metered-emit.mjs` + its own test) — verified this
session that the two other files a stale refs=2 count might have suggested
(`admin/promotion-policy/route.ts`, `health/spend-health.mjs`) only *mention* "metered-gate" in
comments, not imports. So its one real caller is `metered-emit.mjs` — itself unwired (#3).

**WIRE / DELETE options.** None of its own — its disposition is entirely downstream of #3.

**Recommendation: KEEP, no action.** The gate's logic is correct, tested, and doctrine-grade; it should
outlive the specific `metered-emit.mjs` implementation. If #3 is deleted, leave this module in place —
it's the law a future batch-classification build would need to satisfy, and deleting sound doctrine to
match a deleted implementation is the wrong direction.

---

## B. Agent mint gates

### 5. `src/lib/agent/derived-consistency.mjs`
**What it does.** `parseRecurringRule`/`parseDerivedDate`/`isDerivedConsistent` — Gate-B
arithmetic-consistency check for DERIVED claims (does a claimed derived date/figure actually follow
from its stated recurring rule and basis date).

**Why unwired.** Confirmed: zero non-test importers repo-wide. Its own header comment claims it's
called by "both tiers" of DERIVED mint runners — false; the sibling Gate-A module
(`gate-a-derived.mjs`, `derivedCoveredTokens`) IS wired, at `canonical-pipeline.ts:40` (import) and
called at lines 1669 and 1703. Gate-B was written to run alongside Gate-A and never actually plugged
in.

**WIRE option.** `src/lib/agent/canonical-pipeline.ts:1669` — immediately after
`const derivedCovered = await derivedCoveredTokens(sb, itemId);`, iterate the DERIVED claims in scope
and call `isDerivedConsistent(claim, ...)` from `derived-consistency.mjs`, folding a failure into the
same hold/flag path Gate-A already uses at that call site. One import line + one loop call next to
existing, structurally identical code.

**DELETE option.** Lose the only arithmetic-consistency check for DERIVED claims — a DERIVED claim
whose recurring-rule math is simply wrong (e.g. an "annual June-1" rule producing a July date) currently
mints with no gate catching it.

**Recommendation: WIRE.** This is a real accuracy gate with a five-minute integration point sitting
next to an already-wired sibling that does the same shape of work on the same data. Its own header
comment already (incorrectly) claims this is done — closing the gap makes the comment true instead of
aspirational.

---

## C. Dashboard

### 6. `src/lib/dashboard/credibility.ts`
**What it does.** `getDashboardCredibility` — per-source tier/citation/bias-tag enrichment for
dashboard intelligence-item cards (tier badge, citation count, recency, bias tags — the Q9 credibility
chip set), following the Build 8/8.1/8.3 `PipelineRow` pattern used elsewhere.

**Why unwired.** Confirmed: no caller anywhere in `src/`. Fully implemented (tier lookup, citation-stats
RPC, bias-tag join, 60s cache).

**WIRE option.** The dashboard components that would consume this
(`src/components/home/DashboardTopPriority.tsx`, `DashboardByOwner.tsx`) currently render item cards
without per-source credibility chips at all — checked this session, neither imports the credibility
components (`BiasBadge`, `CredibilityBadge`, etc. — themselves confirmed §5 dead code, zero importers).
Wiring `credibility.ts` alone accomplishes nothing without also un-deleting/re-mounting that whole
credibility-chip component tree the audit's §5 already marks for deletion. Wiring this module and
deleting its only possible consumers in the same wave are mutually exclusive.

**DELETE option.** Lose a per-source enrichment query nothing currently has a mount point for.

**Recommendation: DELETE.** This module's entire intended consumer tree (`src/components/credibility/`)
is already on the confirmed-dead-code list (audit §5) with zero importers of its own. Wiring
`credibility.ts` would require reviving a component tree the audit separately recommends deleting —
that's a contradiction, not a genuine wire option. If per-source dashboard credibility chips are wanted
later, design them against the current `DashboardTopPriority.tsx`/`DashboardByOwner.tsx` shape rather
than resurrecting this pairing.

### 7. `src/lib/dashboard/critical-items.ts`
**What it does.** `getCriticalItemsSnapshot` — workspace-scoped critical/high items within a 14-day
deadline window, two-pass deadline query + timeline fallback + override overlay + top-3 sort, for the
dashboard masthead.

**Why unwired.** Confirmed: no caller anywhere in `src/`. Its own header says it "replaces" a
hardcoded `"3 inside 14 days, LL97 / FuelEU / CBAM"` helper copy on `DashboardHero.tsx`. Checked this
session: `DashboardHero.tsx` no longer contains that hardcoded copy at all — the component was rebuilt
under "Redesign TEMPLATE 01" and now reads priority-band counts from `getWorkspaceAggregates`
(migration 068 `byPriority`), a different data shape than what `critical-items.ts` produces. The
replacement target this module was built for was redesigned out from under it without either side
noticing the other.

**WIRE option.** None that preserves the module as-is: `DashboardHero.tsx`'s four tiles are
priority-band counts (CRITICAL/HIGH/MODERATE/LOW), not a top-3 deadline list — a structurally different
UI. Wiring would mean redesigning a new UI slot for `critical-items.ts`'s actual output shape, not a
one-line call.

**DELETE option.** Lose a correctly-built 14-day-deadline query with no current UI shape to feed.

**Recommendation: DELETE.** The component it was written to replace has already been replaced by
something else entirely; there is no live "hardcoded copy" left for this to correct, and wiring it now
means designing new UI, not restoring old.

---

## D. Coverage

### 8. `src/lib/coverage/identity.mjs`
**What it does.** `parseInstrumentUrl`/`classifyIdentifier`/`deterministicIdentity` — deterministic
CELEX/ELI/UK-legislation instrument-identity classifier.

**Why unwired.** Confirmed: its only importer anywhere in the repo is its own test. Meanwhile
`src/lib/coverage/index-data.ts` reads `identity_scheme`/`identity_shape_valid`/`identity_resolves`/
`identity_host_registered` directly off `census_worklist` rows (migration 228 columns) — populated by
something with **no writer found anywhere in this repo**. Checked this session: `census-writer.mjs`'s
`buildCensusRow` (line 73-95, the one function that constructs a `census_worklist` row) sets no
identity fields at all. Whatever populated the live 21,609 `identity_scheme` rows did so outside this
codebase (a one-off script, a manual SQL pass, or a session not preserved in git).

**WIRE option.** `src/lib/intake/census-writer.mjs:73` (`buildCensusRow`) — call
`deterministicIdentity(outcome.url)` from `coverage/identity.mjs` and set
`identity_scheme`/`identity_shape_valid`/`identity_resolves`/`identity_host_registered` on the returned
row alongside the existing `dryrun_disposition`/`surface_tags` fields. Single, well-scoped addition —
but only takes effect once `census-writer.mjs` itself has a caller (see #11).

**DELETE option.** Lose the one legitimate, deterministic (non-network, node-testable) writer for these
columns; whatever out-of-repo process populates them today stays the only source of truth, with no
committed code anyone can audit or re-run.

**Recommendation: WIRE**, in the same change that finally gives `census-writer.mjs` its caller (#11).
Do not wire in isolation — without a walker calling `census-writer.mjs`, adding identity classification
inside it changes nothing observable. Sequence: crawl-rebuild lands → `census-writer.mjs` gets its
caller → this integration is added at the same time, one PR.

---

## E. Dead-code chain

### 9. `src/lib/export/download.ts`
**What it does.** CSV/blob download helper for a bulk-select action on the regulations ledger.

**Why unwired.** Confirmed: sole caller is `src/components/regulations/BulkSelectBar.tsx`, and that
component's own tree is orphaned — nothing renders `BulkSelectBar` anywhere in the app (grep-confirmed
this session: its only references are itself and a mention inside
`F25-module-liveness.mjs`'s allowlist, not a real caller).

**WIRE option.** None — its only caller is itself dead. Wiring `download.ts` would first require
mounting `BulkSelectBar.tsx` into a regulations-ledger page, which is a separate, larger UI decision
already out of scope (this component is part of the pre-Template-02 ledger design the audit's §5
confirms superseded).

**DELETE option.** Lose an unreachable CSV-export helper. Nothing.

**Recommendation: DELETE.** Note for the record: Wave A4 (plan §1, `f8f33b12`) already deletes
`BulkSelectBar.tsx` and its four siblings on its own branch as part of the confirmed-dead-code sweep.
This tree (`wt-w1`) predates that merge, which is why both files still show up here — this row will
self-resolve the moment A4 merges into this line. Recorded so the register is honest about current
state rather than assuming a merge that hasn't happened in this worktree.

---

## F. Discipline governance

### 10. `.discipline/lib/adr-loader.mjs`
**What it does.** `listAllAdrs`/`listAcceptedAdrs`/`loadAdr`/`findIntersectingAdrs`/`matchScopeGlob` —
ADR frontmatter parser + glob scope-intersection matcher.

**Why unwired.** Its own docstring says it exists to serve "the 13th binding rule." `manifest.mjs`
documents rules 001-011 and 013 were deleted in the 2026-05-21 post-slim audit; none of the surviving
rules (012, 014-021) import it. Confirmed: nothing outside its own test calls it.

**WIRE option.** No live rule needs ADR-scope intersection today; wiring it would mean writing a new
rule 022 whose only justification is "there's an unused capability for this" — scope-inventing a rule
to justify keeping a module is backwards.

**DELETE option.** Lose a well-tested ADR frontmatter/scope-glob utility. If a future rule genuinely
needs ADR-scope intersection, the git history has this implementation to restore from.

**Recommendation: DELETE**, with its test. The rule it served no longer exists; keeping an orphaned
capability "just in case" is exactly the class F25 exists to surface and retire.

**EXECUTED** — lane DEAD-EXEC, 2026-09-04, commit `18e62c28`. Module and test deleted.

---

## G. Crawl/intake stack (ADR-015 scope)

These six modules — `census-writer.mjs`, `api-fetch.ts`, and the four walk/diff modules — are graded
separately because five of the six share one real cause: **ADR-015 restored source-monitoring as the
operating design (2026-07-18) and explicitly deferred the crawl-rebuild that would wire them, "no
build proceeds until the operator prices wave-one sizing."** They are not orphaned by accident; they
are built ahead of an orchestrator the operator has not yet funded.

### 11. `src/lib/intake/census-writer.mjs`
*(audit's §4 table names this `src/lib/sources/census-writer.mjs` — the file has since moved to
`src/lib/intake/`; current path used above and below.)*

**What it does.** `buildCensusRow`/`writeCensusRows` — the write half of the intake-census lane;
persists per-document disposition to `census_worklist` (migration 221) under a per-source mutation
lease. The read+classify half (`consumePortalCandidates`) is separate and out of this lane's scope.

**Why unwired.** Confirmed: only its own test and governance files reference it — no production caller.
It is complete, idempotent (UPSERT on `(source_id, document_url)`), and lease-guarded, waiting for a
walker to call it.

**WIRE option.** Needs a runner that enumerates documents (a register-walk / feed-walk / portal-crawl
pass) and calls `writeCensusRows(sb, outcomes, opts)` after each consume chunk — exactly the shape
`register-walk.mjs`/`feed-walk.mjs` (below) already produce outcomes for. There is no existing
orchestrator file to name a line in; the orchestrator itself is the undelivered ADR-015 crawl-rebuild.

**DELETE option.** Lose the one write seam the whole intake-census mandate depends on; the census
machinery becomes permanently un-completable without rewriting this from scratch.

**Recommendation: HOLD.** This is correct, tested code waiting on a funded, scoped orchestrator —
neither "wire it" (there's nothing to call it from yet) nor "delete it" (it's exactly the piece ADR-015
commits to building) fits. Ratify as: keep in the tree, re-open when the crawl-rebuild is priced.

### 12. `src/lib/sources/api-fetch.ts`
**What it does.** API-transport fetcher for sources with `access_method='api'` — parses JSON/XML
responses into the same `BrowserlessResult` shape the direct-HTTP and Browserless transports produce.

**Why unwired — distinct from the other five.** Its own header claims it's "used by the access_method
routing switch in `/api/agent/run`." Checked this session: that's false today.
`src/lib/agent/canonical-pipeline.ts` has its own separate, inline `apiFetchForHost` function
(line 154) that does the live API-transport work; `api-fetch.ts`'s own `apiFetch` export is used only
as a dependency-injection parameter *name* shared by `transport-runtime.mjs` and
`transport-escalation.mjs` (both of which take an injected `apiFetch` callback but are never actually
handed *this* module's implementation in the live pipeline). This isn't "waiting for an orchestrator"
like #11/#13-16 — it's a parallel, superseded implementation of work `canonical-pipeline.ts` already
does inline.

**WIRE option.** Would mean replacing `canonical-pipeline.ts`'s inline `apiFetchForHost` with an import
of this module's `apiFetch` — a real refactor (dedup two implementations of the same transport), not a
one-line call.

**DELETE option.** Lose a duplicate, unused implementation. `canonical-pipeline.ts`'s inline version
keeps working exactly as it does today — nothing currently depends on this file.

**Recommendation: DELETE.** Unlike the other five in this section, this isn't blocked on an
orchestrator — it's redundant with code that already runs live. If the API-transport logic ever needs
consolidating (e.g. because the inline and standalone versions drift), that's a dedup task against
`canonical-pipeline.ts`'s real implementation, not a reason to keep this one on standby.

**EXECUTED** — lane DEAD-EXEC, 2026-09-04, commit `18e62c28`. Module deleted. Its one real (test-only)
importer, `src/lib/sources/transport-hold-wiring.npmtest.mjs`, had its `apiFetch`-specific case removed
(the file's remaining cases already exercise the same live path via `canonical-pipeline.ts`'s
`buildLiveTransports`).

### 13–16. `src/lib/sources/amendment-diff.mjs`, `change-sweep.mjs`, `feed-walk.mjs`, `register-walk.mjs`
**What they do.** Four pure, `$0`, node-testable transports/analyzers for the ADR-015 crawl-rebuild:
`amendment-diff.mjs` segments/aligns/diffs two captures of one instrument into timeline-event
candidates; `change-sweep.mjs` bridges a detected source change to per-item re-verification
(`decideVerify` routing, snapshot-first); `feed-walk.mjs` parses RSS/Atom feed entries; `register-walk.mjs`
walks date-paged publisher registers (EUR-Lex OJ, Federal Register). All four are dependency-injected
(no network inside), all four feed the same `census_worklist` ledger `census-writer.mjs` (#11) writes.

**Why unwired.** Confirmed: each has zero importers outside `F25-module-liveness.mjs`'s own allowlist
entry — no production caller, no cross-references between the four (they're independently callable
transports, not a pipeline that self-assembles).

**WIRE option.** Same orchestrator as #11: the crawl-rebuild's runner would call `register-walk.mjs`/
`feed-walk.mjs` to enumerate documents, `amendment-diff.mjs`/`change-sweep.mjs` to process changes on
already-known instruments, and pipe outcomes into `writeCensusRows`. No such runner exists yet.

**DELETE option.** Lose four already-built, already-tested transports for the one feature ADR-015 rules
is the actual operating design — deleting them means re-writing all four when the crawl-rebuild is
eventually priced, at real cost, to re-arrive at code that already exists and passes its tests today.

**Recommendation: HOLD, all four.** Same basis as #11: these are the literal deliverable ADR-015
commits to, sitting finished and waiting on an operator pricing decision that's explicitly out of this
lane's scope (plan §6: "Designed, never built... needs its own plan + your go" — though that line is
about spec-08, the crawl-rebuild is under the identical "priced separately" clause in ADR-015 §5).
Deleting proven-correct, already-tested implementations of a design the operator re-affirmed twice
(ADR-012's original promise, then ADR-015's restoration) to save on maintenance would be the wrong
trade against the cost of re-building them.

### 17. `src/lib/intake/intake-url-corpus.mjs`
*(audit's §4 table names this `src/lib/sources/intake-url-corpus.mjs` — moved to `src/lib/intake/`.)*

**What it does.** `URL_CASES` — a committed, hand-curated golden URL corpus (source-role + root-vs-item
verdicts) used to pin the deterministic intake gates (`sourceRole`, `urlIsRoot`, `matchExistingSubject`)
against real-world URL shapes, per RD-14 ("line-read is not verification").

**Why it's flagged unwired, and why that's a false signal.** Confirmed: its only importers are
`intake-gates-golden.test.mjs` and a mention in `invariants.mjs`. But this is pure fixture data with no
exported function to "call" — it exists to be imported by tests, exactly as it is. This is the same
shape the audit's own §9 corrections warn about: a graph tool that can't distinguish "no production
importer" from "not the kind of module that has one."

**WIRE / DELETE options.** N/A — there is no production call site for a data-only golden-fixture file
to be wired into; it already does its one job (pinning the intake-gates test) correctly.

**Recommendation: KEEP, no action.** This is a false positive for "unwired" in the same family as
`trust.selftest.mjs`/`src/proxy.ts` the audit's own §9 already documents overturning — a graph-tool
artifact, not a real gap. Do not delete a golden-fixture corpus because a liveness graph can't see test
imports as "real" callers.

---

## H. scripts/lib hand-maintained mirrors

All four share one root cause the audit's own evidence names directly: **`canonical-key.mjs`'s header
documents that two previously-diverged hand-copied `.mjs`/`.ts` mirrors caused a real incident (run #66,
2026-08-11 — 6 false collision groups from a CELEX-suffix-discarding bug) and that the fix was
consolidating to one canonical module.** `urgency.mjs` and `fetch-quality.mjs` are the exact sibling
mirrors that incident should have retired and didn't; `anthropic.mjs` and `net-agent.mjs` are dead for
a different, simpler reason (never adopted).

### 18. `scripts/lib/anthropic.mjs`
**What it does.** `canonicalGenerate`/`textOf` — a script-side wrapper for the Anthropic Messages API,
documented as "canonical" by its own header and enumerated as rule-016's one sanctioned script-side
direct-call site.

**Why unwired.** Confirmed: zero importers anywhere in the repo. Large script-side calls route through
`streamMessagesText` (`src/lib/agent/anthropic-stream.mjs`) to avoid a documented buffered-POST hang bug
above `STREAM_ABOVE_MAX_TOKENS=8192` — this module was written as the sanctioned alternative and never
actually adopted by anything.

**WIRE option.** None with a specific line — there is no current script that should be calling this
instead of what it already calls; forcing an adoption would mean picking an existing script-side
Anthropic call site and rewriting it for no functional gain.

**DELETE option.** Lose the module `.discipline/rules/016-canonical-anthropic-path.mjs` names as
PERMITTED — deleting it requires deleting that allowlist entry in the same commit (F25's own note: this
is explicitly COUPLED — leaving the rule-016 entry after deleting the file makes the rule silently
sanction a file that no longer exists, which is exactly what F15's staleness audit is designed to catch
and turn red rather than silent).

**Recommendation: DELETE**, together with retiring its `rule-016` PERMITTED entry and its
`F15-spend-chokepoint.test.mjs` SANCTIONED entry in the same commit — F25's own header already flags
this exact coupling requirement.

**EXECUTED** — lane DEAD-EXEC, 2026-09-04, commit `18e62c28`. Module deleted; its `rule-016` PERMITTED
entry and F15 SANCTIONED entry retired in the same commit, per the coupling requirement above.

### 19. `scripts/lib/net-agent.mjs`
**What it does.** Side-effecting module that, on import, installs a bounded `undici` Agent
(`keepAliveTimeout:4000`, `connections:4`, no pipelining) as the global fetch dispatcher — built to
tame transient sandbox network instability against Anthropic/Browserless calls.

**Why unwired.** Confirmed: zero importers anywhere.

**WIRE option.** None specific — nothing currently exhibits the network instability this exists to
dampen; importing it into a script "just in case" changes global fetch behavior for that script with
no problem to solve.

**DELETE option.** Lose a prepared-but-never-needed fetch-dispatcher tuning module.

**Recommendation: DELETE.** If sandbox network instability against Anthropic/Browserless recurs, this
implementation is a two-minute restore from git history with a concrete incident to justify it —
better than carrying an unused global-state-mutating import forward speculatively.

### 20. `scripts/lib/urgency.mjs`
**What it does.** `urgencyScoreFromPriority`/`urgencyScoreFromTier` — a hand-maintained `.mjs` mirror of
`src/lib/urgency.ts`, "kept in sync" per its own header comment, for `.mjs` scripts that can't import
`.ts` without a build step.

**Why unwired.** Confirmed: zero importers, no own selftest pinning it against its TS twin — unlike
`canonical-key.mjs`, which replaced exactly this shape of risk with one consolidated module plus a
drift-guard test.

**WIRE option.** None that doesn't recreate the risk it represents: importing it into a script would
mean trusting a hand-copied mirror with no drift guard, the precise anti-pattern `canonical-key.mjs`'s
header calls out as the run-#66 root cause.

**DELETE option.** Lose nothing functional — `src/lib/urgency.ts` remains the single live
implementation. Note: `urgency.mjs`'s scoring constants are also one of the WO-20 assumption-register's
ten catalogued values (migration 271's own header names `scripts/lib/urgency.mjs` directly) — deleting
the file doesn't touch that catalogued constant, which lives in the register's fixture data
independent of this mirror.

**Recommendation: DELETE.** Any `.mjs` script that genuinely needs urgency scoring should import
`src/lib/urgency.ts` via `jiti` (the pattern several other `.npmtest.mjs` files in this codebase already
use to import real `.ts` source), not maintain a second hand-copied implementation with no test tying
the two together.

### 21. `scripts/lib/fetch-quality.mjs`
**What it does.** Mirror of `src/lib/sources/fetch-quality.ts`, "keep the two files in lockstep" per
its own header.

**Why unwired.** Confirmed: zero importers, no own selftest. Same risk shape as #20.

**WIRE / DELETE options.** Identical reasoning to #20.

**Recommendation: DELETE**, same basis as #20 — this is one class of finding, not two independent ones.

---

## I. Admin operator routes

### 22. `src/app/api/admin/promotion-policy/route.ts`
**What it does.** GET/POST for the promotion-policy engine's operator control; fail-closed by design
(no policy configured = no promotion spend authorized).

**Why unwired.** Confirmed: zero frontend or workflow callers repo-wide.

**WIRE option.** `src/components/regulations/CoverageCatalogueView.tsx` is the component whose own copy
promises promotion controls ("mount here alongside") that don't exist in the file (audit §3.9) — that's
the natural mount point, but building it is a UI task, not a one-line wire.

**DELETE option.** Lose the operator control for a policy engine `post_promotions`/`promotion_policy`
already sit at 0 rows behind.

**Recommendation: HOLD.** Plan §0 ruling 5 already decides this explicitly: **"HOLD sign-off, post
promotion, moderation."** Wiring this ahead of that ruling would contradict a standing operator
decision already on record in this plan. No action in this wave; re-open only if that ruling changes.

### 23. `src/app/api/admin/run-intake/route.ts`
**What it does.** "Run intake now" operator control — plan/apply modes, gated machine-approval (no
human-approve step, by design).

**Why unwired.** Confirmed: no frontend or workflow caller anywhere in the repo. Zero
`agent_runs` in its history per ADR-015's own audit citation ("0 manual-intake-run agent_runs").

**This is the twice-promised surface — flagged explicitly per the task brief.** ADR-012 (2026-07-11)
promised "an admin surface control + a script path" for this route and delivered neither — only the API
route itself was built. ADR-015 (2026-07-18), which supersedes ADR-012's manual-by-design framing,
re-promises the same two owed surfaces a second time: "the crawl rebuild discharges them: the intake
handoff lands at `run-intake-cycle` through `/api/admin/run-intake`, and the two owed surfaces (the
admin 'run intake now' control and the script path) are built as part of that work" (ADR-015 §4).
Confirmed this session: neither surface exists yet on this tree, and per ADR-015 §5 the crawl-rebuild
itself is drafted-but-unpriced ("no build proceeds until the operator prices wave-one sizing") — so this
is now a debt carried across two ADRs and still unpaid.

**WIRE option.** Two owed pieces, per ADR-015 §4 itself: (1) a small admin-console page (alongside the
existing `admin/sources` UI) with a "Run intake now" button POSTing to
`/api/admin/run-intake`; (2) a `scripts/run-intake.mjs` CLI wrapper calling the same route logic
directly, for operator/CI use without the UI. Both are named, scoped, and already spec'd by the ADR —
the missing piece is building them, not deciding what to build.

**DELETE option.** Not a real option — deleting the route would mean reversing ADR-015's decision
(source-monitoring is the operating design) without a superseding ruling, which is out of this lane's
authority.

**Recommendation: WIRE.** Of the three admin routes, this is the one with an explicit, twice-made
operator promise behind it and a specific, already-designed pair of deliverables (ADR-015 §4) — not a
speculative "maybe someone wants this." Recommend sequencing it as part of the crawl-rebuild pricing
decision (ADR-015 §5) rather than standalone, since the route's only real value is as the intake
handoff's front door, but the disposition itself is unambiguous: build it, don't hold it a third time.

### 24. `src/app/api/admin/users/route.ts`
**What it does.** POST creates an Auth user + org membership; GET lists org memberships.
Platform-admin-gated.

**Why unwired.** Confirmed: no frontend or workflow caller anywhere in the repo. No "manual by design"
framing in its own comments (unlike `run-intake`, which explicitly documents its no-human-gate posture).

**WIRE option.** A small `/admin/users` console page (list + invite form) calling this route — the
route itself already does the real work; this is the one row in the register that is purely "build a
thin UI over a complete API," no backend design decision required.

**DELETE option.** Lose the only non-`curl` path to provision an org user — with `organizations=1`,
`org_memberships=2` today, this is currently exercised rarely enough that its absence hasn't been
missed, but it's also the kind of gap that becomes urgent the moment a second real org needs
onboarding.

**Recommendation: WIRE.** Lowest-risk, highest-clarity wire in the register: a complete, tested,
authorization-correct API with genuinely no UI. Unlike `promotion-policy` (deliberately HELD by
operator ruling) or `run-intake` (blocked on a pricing decision), nothing stands between this route and
a page.

---

## J. Trust / demotion

### 25. `src/lib/trust.ts` — `evaluateDemotion` (the whole function, not only its two dead cases)
**What it does.** Bayesian-prior-blend source-trust scoring module; `evaluateDemotion` specifically
evaluates a source's demotion triggers (accuracy drop, reliability drop, accessibility failure,
conflict rate, paywall change) and returns a demotion verdict.

**Why unwired — and how this differs from Wave A3's finding.** Wave A3 (this session, on a sibling
branch not in this worktree) already removed the `critical_conflict`/`paywall_introduced` empty switch
cases and, per plan §1, explicitly flagged the broader residual: **"evaluateDemotion has no caller."**
Confirmed independently this session, repo-wide: `evaluateDemotion` is referenced only inside
`trust.ts` itself (definition + a comment) and `trust-evaluators.npmtest.mjs` (its test) — zero
production callers, not merely the two dead trigger cases. `evaluatePromotion` (the sibling function)
IS live — the only integration point checked, `src/app/api/admin/recompute-trust/route.ts`, calls
`recomputeEffectiveTier` and (per its own worker-secret-gated monthly cron,
`.github/workflows/trust-recompute.yml`) touches promotion-side scoring, but never calls
`evaluateDemotion` anywhere in that route.

**WIRE option.** `src/app/api/admin/recompute-trust/route.ts` — in the same per-source loop that
already computes updated trust metrics and calls promotion-side logic, add a call to
`evaluateDemotion(source)` and act on a fired verdict (tier reduction / flag) the same way the route
already acts on promotion verdicts. One additional function call per source in an already-existing
monthly-cron loop.

**DELETE option.** Lose the ability to ever demote a source automatically — sources can currently only
be promoted or manually tier-overridden; nothing in the live system reduces a source's tier based on
its own accuracy/reliability/accessibility history degrading. Given the codebase's demotion vocabulary
and scoring machinery is otherwise complete and well-tested (per L12's audit), this would be a real
capability loss, not a dead-weight removal.

**Recommendation: WIRE.** This is the single highest-value wire in the register: a monthly cron job
already exists and already loops every active source; the function that should run in that same loop is
fully built, tested, and simply never called. Sequence after Wave A3's trigger-vocabulary cleanup lands
(so the wired call inherits the corrected trigger set, not the two dead cases) — but the two are
independent fixes and this one should not wait on that one merging first.

---

## K. Assumption register (WO-20)

### 26. `scripts/gen/assumption-register-seed.mjs` (+ migration 271, `assumption-register-common.mjs`)
**What it does.** Seeds `assumption_register` (migration 271) with the 10 catalogued modelling
constants named in `docs/plans/wo20-assumption-register-spec.md` §2 — values currently living only as
inline code comments in `discover.mjs`, `pair-view.mjs`, two `recommend-classification` routes,
`scripts/lib/urgency.mjs`, and `factor-tier.mjs`, with no DB record of why each value is what it is.

**Why unwired.** Not a code-wiring gap — a sequencing gap. The seeder is dry-run by default and
explicitly refuses to run `--apply` against a database without migration 271 applied ("NOT RUNNABLE
AGAINST A REAL DATABASE UNTIL MIGRATION 271 IS APPLIED" — its own header). Per plan §1, migration 271
itself was pending coordinator-apply as of this session's earlier waves. The seeder, its 21 tests, and
its fixture data are all complete and correct; only the `--apply` invocation (a coordinator-only action
per plan §4) is missing.

**WIRE option.** Once migration 271 is confirmed applied live, run
`node scripts/gen/assumption-register-seed.mjs --apply` (coordinator action, per plan §4's "all guarded
DB writes" list — not a lane action). No code change required.

**DELETE option.** Lose the only committed record of why ten modelling constants (including two named
directly in this register — `urgency.mjs`'s score mapping, #20/#21's dead-mirror class) are set to the
values they're set to; those constants keep living as bare inline comments with no queryable register.

**Recommendation: WIRE.** This is pure sequencing debt, not a design or code question — the schema,
seeder, and tests are already built and reviewed. Flag for the coordinator: confirm migration 271 is
live, then run the one `--apply` command.

---

## Top 5 highest-value wires (ranked)

1. **`evaluateDemotion` → `admin/recompute-trust/route.ts`'s monthly loop (#25).** A complete demotion
   engine sitting next to an already-cron-scheduled loop that calls its sibling promotion function —
   the single largest capability gap in this register (sources can currently only ever be promoted,
   never automatically demoted) for the smallest integration.
2. **`admin/run-intake` UI + script surfaces (#23).** Discharges a debt made twice by name (ADR-012,
   then ADR-015) with the deliverable already spec'd in ADR-015 §4 — the only row in the register with
   an explicit, dated, twice-repeated operator promise behind it.
3. **`derived-consistency.mjs` → `canonical-pipeline.ts:1669` (#5).** A real accuracy gate for DERIVED
   claims with a near-identical, already-wired sibling call two lines away to copy the pattern from.
4. **`spend-gauge.mjs` → `health/spend/route.ts` (#2).** The cheapest wire in the register: swap one
   inline computation in an already-cron-invoked route for the better, paginated, tested function that
   already exists to replace it.
5. **`coverage/identity.mjs` → `census-writer.mjs:73` (#8).** Closes the specific gap the audit flags
   as its strongest wiring anomaly (a live DB column with no in-repo writer) — sequenced together with
   #11 so the wire lands the moment `census-writer.mjs` itself gets a caller.

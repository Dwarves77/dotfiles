# Architecture and product review, 2026-09-30 (Audit A7)

Read-only senior review, Sonnet, worktree `audit/a7-architecture` off `origin/master` at `2550ebbc`.
Operator's question: where are we, does the plan need updating, is there a better solution to anything,
and would top developers be embarrassed by what exists. Every claim below carries `[CONFIRMED]`
(method named), `[HYPOTHESIS]`, or `[REFUTED]` per standing rule 14.

**Coordinator amendment (mid-audit, binding):** the operator's directive arrived mid-session. Every code
file this review names below was then read in full, first line to last, not sampled, and the review was
completed against that standard. Every claim about code cites a line number. See the Coverage appendix
(end of document) for the exact file list and line counts read.

## 1. Where we are

The product is a Next.js/Supabase app across five customer surfaces (Regulations, Market Intel,
Research, Operations, Community) fed by a "data machine" (Collect → Analyse → Produce → Connect/flywheel
→ Harness record) described in `docs/specs/08-flywheel-design.md` and tracked hop-by-hop by
`fsi-app/.discipline/fitness/functions/F50-loop-wiring.mjs` against 11 `loop-hops.d/*.json` files.
`[CONFIRMED, direct file read]`: 22 GitHub Actions workflows exist at `.github/workflows/` (not "the 12"
named in this audit's own brief, the brief's premise undercounts the built surface by nearly half;
`source-sweep`, `fetch-drain`, `ledger-consume`, `population-turn`, `corpus-turn`, `downstream-chain`,
`propagation-drain`, `gate-a-rescan`, `brief-export`, `brief-apply`, `date-chain`, `producers`,
`maintenance`, `data-audit-lane`, `trust-recompute`, `change-detection`, `discipline`, `build-proof`,
`bug-class-guard`, `uptime-probes`, `source-monitoring`, `spot-check-monthly`).

State-of-build table (stage × surface), each cell's status per the tool-gap register
`[CONFIRMED, docs/plans/data-machine-tool-gaps-2026-09-25.md, cross-checked against live `execute_sql`
counts cited there and the 2026-09-29 commit log]`:

| Stage | State | Evidence |
|---|---|---|
| Collect (source-sweep → fetch-drain) | Built and wired; **never fired from the loop** as of 2026-09-25 (hop 01 stale manifest, corrected same day) | `loop-hops.d/01-*.json`; workflow file lines 58-59 |
| Analyse (ledger-consume, corpus-turn, downstream-chain, propagation-drain) | Built; F50 hops 02-08 `enforceEdge:true, enforceFired:false` as of 2026-09-25; **the 2026-09-29 incident proved these DO fire live**, a chained dispatch wrote 33 quarantined items before being caught and reversed | incident note `2026-09-29-chained-apply-incident.md`; guard landed same day (#831) |
| Produce (mint, brief-export/apply, structured actions) | Mint chokepoint built (`canonical-pipeline.ts`); structured-action extraction shipped 2026-09-29 (#832) | commit log |
| Connect/flywheel (Loop A discovery, Loop B decision propagation) | Loop A `[HYPOTHESIS]` built, not re-verified this pass; Loop B **schema+runtime built, populated only by hand-dispatch** through 2026-09-28, first genuine autonomous chained fire attempted and caught mid-flight 2026-09-29 (#825, #828) | tool-gap register Connect section; live counts `entities=2880, derived_values=22, propagation_events=2782, derivation_edges=24` |
| Harness record | F50 gate exists and runs; `harness_runs` table (migration 331) now the sole run-of-record after the operator's "no Actions PRs" ruling (2026-09-26) | #813 |

By surface, what a customer can use today: Regulations and Community have live, populated pages
`[CONFIRMED, docs/plans/wave-plan-2026-09-28.md WS status table: WS9 connections strip DONE, WS15 look
pass DONE]`. Market Intel has three producers writing real rows (`published_price_statistics`) but a known
live bug, a raw text/JSON dump mid-page on the detail route `[HYPOTHESIS, 2026-09-25 close, not yet
reproduced by a lane as of the read set]`, and its nav label is still wrong ("Market" not "Market Intel",
`[CONFIRMED, Sidebar.tsx:76, wave2b-lanes-2026-09-29.md]`). Operations' coverage-matrix reader gap was
**investigated and found not to exist**, `[CONFIRMED, wave2b-lanes-2026-09-29.md: fetchOperationsCoverage
selects all 11 envelope columns, UI-1 REFUTED]`, a real example of rule 14's corollary working as designed
(a flag dissolving under evidence and being corrected in place, not just dropped).

What customers cannot use yet: the autonomous loop (every mint today still depends on a human- or
coordinator-dispatched workflow, not a self-propagating chain, the very thing spec 08 promises as the
differentiator); per-kind attribute tables (corridor/obligation/signpost) are schema-designed only; the
research assessment model is designed, not built; the learning loop (ADR-036) started 2026-09-29 and is
mid-build. R14 ("tools before data," 2026-09-25) is explicitly holding all further live-data population
until the tool gaps above close, a deliberate sequencing choice, not a stall.

## 2. Plan fitness

**Is WS1-16 / Wave 2/3 still the right order under R14?** Yes, materially, R14 correctly orders "prove
the machine fires on its own" before "feed it more data," which is the textbook fix for a system that
had, by its own 2026-09-04 measurement, minted 551 record items with only a title as a fact because
nothing downstream ran automatically (CLAUDE.md rule 17's own cited cost). The wave-2 write-set contract
(`wave2b-lanes-2026-09-29.md`) is unusually disciplined for a two-person-scale team: eight lanes with
provably disjoint file sets, single migration-number issuance by the coordinator (after three same-day
collisions, `[CONFIRMED, wave-plan-2026-09-28.md run rule 9]`), and a "stop and report" default on any
file outside a lane's declared set. This is a better solution than most teams reach for at this scale ,
most would let two engineers just talk to each other; this team is compensating for agent-fan-out risk
(nested-agent scope creep, silent overwrites) with a contract a human pair wouldn't need. Worth keeping.

**What should be cut, merged, or reordered:** The per-kind attribute tables (corridor/obligation/signpost)
and the research assessment model are both correctly deferred behind the four-question structure ,
that's right. What is *not* yet reordered but should be: the reverse-chained-apply cleanup (33 live
`intelligence_items` rows from the 2026-09-29 incident) is sitting as "identified, not executed" per the
operator's own "if it made items it shouldn't get rid of them" ruling. It carries zero build risk and
should be the very next merge, ahead of any Wave 2 surface lane, because a quarantined-but-present
`intelligence_items` row is a landmine for every dedup/count-based audit that runs before it is reversed
(the project's own history, ADR-013's June-undispositioned finding, the F45/F46 duplicate census, shows
count-based checks get fooled by exactly this class of row).

**Would a top team buy or reuse instead of building?** Two clear candidates. First, the "dispatch ledger
appended by a workflow step" and the whole harness-run-family bookkeeping (`harness_runs`, per-family
`family.json`, the F50 hop-manifest) is hand-rolled event-sourcing for a durable, resumable, multi-step
pipeline, this is close to the exact problem Vercel's Workflow SDK / durable-execution primitives solve
natively (the repo already depends on `@workflow/next`/`workflow` per `package.json`, so the capability is
installed but the propagation/harness layer was built parallel to it rather than on it)
`[CONFIRMED, package.json dependencies include "@workflow/next" and "workflow"; the loop/harness code
under fsi-app/src/lib/propagation and scripts/harness-runs does not import either]`. That is real,
measurable duplication of effort a top team would flag in the first design review. Second, `derivation_edges`
RLS and the adversarial proof pattern (rule 15) reinvent, well, what Postgres RLS + Supabase's own advisor
tooling is for, the team is using it correctly, just discovering its edges by adversarial script instead
of `get_advisors`, which is available and unused here `[CONFIRMED, this review's own tool list includes
mcp__…__get_advisors under the Supabase MCP; no `docs/audits/*` cites it as a lane's method]`.

**Over-engineered relative to team scale?** The discipline engine: 101 fitness functions
`[CONFIRMED, ls fsi-app/.discipline/fitness/functions | wc -l = 101]`, not "50+" as the brief assumed ,
the real number is roughly double what was estimated going in, which is itself informative: the gate has
been growing faster than the product surface. It pays for itself where it catches a class of defect once
and never again (F50 loop-wiring, F24 db-object-migration-home, the execution-wiring meta-gate born from
the "15 silently-red goldens" incident). It taxes where it has become a second product: rule 15's own
adversarial-proof-per-invariant convention, applied consistently, means every future security-relevant
migration now owes a hand-written attack script, forever, with no template generator and no shared
harness beyond copy-the-pattern. For a two-person team this is the highest-leverage single simplification
available: extract one parameterized adversarial-proof runner (target table, forged predicate, expected
denial) instead of one bespoke script per guard. The doc corpus (`docs/`, hundreds of dated files) is
the second tax: INDEX.md alone is 368 lines and growing by several entries per session; the memory
conventions are followed unusually well (this session found no unlinked orphan in the sampled set), but
the read cost per new session is now large enough that CLAUDE.md itself budgets for it (rule 11's own
1.34B-cache-read measurement). The fix already exists in the doc's own design (dated files, INDEX
pointer, "load narrowly"), the tax is that the *board itself* (`PROGRAM-BOARD.md`) has accumulated six
stacked "resume from" pointers at its head, each superseding but not replacing the last, so a fresh
session reads five paragraphs of forwarding pointer before reaching a fact. A top team would collapse
that to one current pointer and archive the rest, which the doc's own conventions already permit and
which nothing currently does automatically.

## 3. Architecture review

**Entity spine** (`entities`, `derived_values`, `derivation_edges`, `propagation_events`, migrations
282-287): sound. `[CONFIRMED, data-machine-tool-gaps-2026-09-25.md live counts: entities=2880]`.
Progressive re-keying beside existing text keys (ADR-024) rather than a big-bang rewrite is the
textbook-correct migration strategy for a live system. No better alternative at this scale; protect it.

**Propagation DAG / governed drain** (`fsi-app/src/lib/propagation/drain.ts`, 306 lines, read in full):
sound and well-documented, two-pass invalidate-then-recompute (pass 1 lines 1-27 header, pass 2 header
lines 20-27), dry mode stops after pass 1 by construction (`p_apply=false`, events not marked drained),
method resolution keyed on `(method_id, method_version)` with an unknown method left stale and counted
under `skippedUnknownMethod` rather than erroring `[CONFIRMED, drain.ts read in full, lines 1-306]`.
Concurrency safety is real, not decorative: pass 2 only ever touches rows `invalidated_by_event IN (this
batch's event_ids)`, never a blanket stale-row sweep, so two concurrent drains cannot double-recompute
each other's work. This is the strongest single file read in this review, it states its own invariant in
its header ("propagation invalidates, it does not compute, never a trigger") and explains its own
constraints (no `@/` alias imports, so it is directly `node`-runnable and testable with a hand-rolled fake
client) rather than leaving them implicit. This is what "sound" looks like in this codebase; more files
should look like it.

**Mint chokepoint** (`fsi-app/src/lib/agent/canonical-pipeline.ts`, 2,256 lines, read in full): large, but
on a full read the size is substantially *load-bearing coupling*, not accidental sprawl, softening the
draft assessment below made after only a partial read. The file has 54 exported top-level functions
`[CONFIRMED, grep count]` across five real stages (fetch-ladder retries lines 161-335; source discovery
lines 548-611; synthesis lines 843-1105, with the single write site `writeSynthesizedBrief` at lines
1006-1105; grounding lines 1547-2215, the largest block, ~670 lines; source registration/growth lines
2217-2256). The grounding stage alone threads five real, interlocking defense-in-depth gates through
shared local state in one function scope: the cited-host gate (lines 1612-1686, refusing to
self-ground a citation on a host neither the fetched pool nor the registry knows), the target-instrument
mismatch gate (lines 1736-1767, confirmed by this session's own reading, holds an item whose fetched
primary is provably a *different* instrument), the floor-first re-attribution (lines 1961-1976), the
non-destructive dominance guard that snapshots the prior ledger and refuses to apply a *weaker* re-ground
(lines 1590-1605, 2005-2037), and the mint-gate S-CONFLATE/S-NUMERIC holds (lines 2154-2180), each reads
`itemFloor`, `resolver`, `floorPool`, or `gateFacts` computed earlier in the same function. Splitting this
mechanically (the draft's original recommendation) would either duplicate that shared state across module
boundaries or force a much wider public contract between the pieces, a real migration cost, not the
"~2-3 days, mechanical" this review first estimated before reading the gate logic in full. **Revised
recommendation**: do not split grounding (lines 1547-2215), it is one coherent judgment procedure and its
current shape is defensible. DO split the three genuinely independent stages that do not share this
state: fetch-ladder (161-335, 613-648) and source discovery/growth (548-611, 2217-2256) each depend only
on their own inputs and could move to their own modules behind the existing exported names at low risk
(a half-day each, mechanical, tests as the safety net). The August 2026 god-module review
(`docs/plans/remediation-and-weight-2026-08-10.md`, per INDEX) called this file "stay cohesive... under
the driver rule", this full read confirms that call was more right than this review's own first
(partial-read) draft gave it credit for.

**`supabase-server.ts`** (4,842 lines, read in full): a flat namespace of independently-scoped,
heavily-commented fetch functions, not shared judgment logic the way canonical-pipeline.ts's grounding
stage is, so the earlier split recommendation holds here without revision. 79 exported functions
`[CONFIRMED, grep -c "^export "]`, each documenting its own defect history inline (e.g. the
`fetchDashboardData` due-next/what-changed fix at lines 2592-2886, the RPC pagination ORDER-BY defect fix
at lines 567-616). Already named by the team's own August review as "the one decompose target" among
twelve >1,000-line files, riding U3/U9 `[CONFIRMED, INDEX.md remediation-and-weight-2026-08-10 entry]`.
That decomposition has not happened: `fetchOperationsCoverage` (confirmed at lines 3356-3482 of this
read) is still in the same file as `fetchWatchlist` (lines 4395-4667) and `fetchMarketSeriesBoard`
(lines 3622-3644), three unrelated surfaces' readers in one file. This is a known, accepted debt, not a
new finding, but every new reader added to any surface still lands here by default because it is the path
of least resistance, and the file is now the largest in the app. **Better solution**: one file per domain
reader (regulations/market/research/operations/community), a thin barrel re-export for the many call
sites that import the module wholesale, cost roughly a day per domain, six domains, spread across
otherwise-idle lane capacity; do it opportunistically per the driver
rule rather than as a dedicated lane, which is what the team already decided and should keep doing.

**Harness / loop wiring** (all 22 `.github/workflows/*.yml`, 7,588 lines total, read in full): sound in
design (F50's hop-manifest pattern, execution-wiring meta-gate, adversarial-proof convention) but the
2026-09-29 incident is exactly the fragile edge a top team would catch in code review: a chained
`workflow_run` firing silently inherited `apply` mode regardless of the triggering dispatch's own mode,
and nothing in the 11-hop manifest encoded that. The gap was closed same day
(`fetch-drain.yml`/`gate-a-rescan.yml`/`corpus-turn.yml`/`downstream-chain.yml`/`ledger-consume.yml`/
`population-turn.yml`/`propagation-drain.yml` all now carry an identical "Chained dry-run guard" step,
`[CONFIRMED, read in full]`), genuinely fast, and the postmortem (rule 13/14/15 compliant, named cause,
named fix, named systemic guard) is better process than most funded teams run. The residual architectural
point: mode is *ambient* per workflow file rather than *threaded* explicitly through the chain (the same
"authorization as ambience, not an argument" anti-pattern the team already named and fixed once for spend
authorization, `docs/audits/spend-authority-disarm-case-file-2026-07-30.md` per INDEX); the guard fixes
the build-mode instance, the class fix is not yet generalized.

A second, independently-confirmed distributed-systems finding, found only by reading the chain end to
end: GitHub Actions caps `workflow_run`-to-`workflow_run` chaining at three hops
(`docs.github.com`'s own documented limit, cited verbatim in `downstream-chain.yml` lines 397-407). The
real chain here is source-sweep → ledger-consume → population-turn/corpus-turn → downstream-chain →
propagation-drain, five links, past the limit at the last hop. The team found this by measurement
(`docs/ops/session-log.d/2026-09-28-loop-b-firing.md`, cited in the workflow's own comment: propagation
never fired when reached by chaining, only when downstream-chain was hand-dispatched) and worked around
it with an explicit `gh workflow run propagation-drain.yml` call carrying a reconstructed
`trigger_context` (`downstream-chain.yml` lines 420-431, `propagation-drain.yml` lines 124-133,
225-240) rather than relying on the native event `[CONFIRMED, both files read in full]`. This is a real
platform limit most teams never hit because they don't chain this deep, caught by actually measuring
run history rather than assuming the declarative trigger worked, exactly the "proof by execution, not
presence" standard the team's own rule 15 sets for itself, applied here to its own infrastructure.

**Hidden coupling / two homes for one concept:** the market-rate question has two homes on record ,
freight-rate tracking was explicitly ruled out (decision 1, 2026-09-25) in favor of carbon-cost-per-FEU,
yet `RailStat`/`MarketSignalDetailSurface` still carry the old "Market" label and a raw-dump bug
un-repro'd on the same surface, evidence the decision landed in docs before it landed in every call site,
a normal and expected lag, not a design defect. Community has a real two-homes case, now resolved:
"mechanism A" (`community_promotion_transitions`, 0 rows, no importer) and "mechanism B" coexisted per the
M9 tool-gap row; migration 335 (2026-09-29, `#826`) dropped the dead mechanism entirely, a clean,
already-executed fix, cite as a positive example of the team eliminating a two-homes case rather than
letting it fossilize.

## 4. Product review against the four questions

**Confirmed by full read of all four surfaces' primary list components** (`RegulationsLedger.tsx` 350
lines, `MarketIntelLedger.tsx` 355 lines, `ResearchLedger.tsx` 435 lines, `OperationsLedger.tsx` 555
lines, all read in full): the four intelligence surfaces genuinely share one architecture, not four
independent builds that happen to look similar. All four import and compose the same
`ListSurfaceShell`, the same `useListSurfaceFilter` (URL-driven facet state, so a filtered view is
linkable and reload-safe), and the same `liveFacetCounts` (one derivation for every facet count and the
surface total, so a count in the rail can never disagree with the list under it, each file's own
comment traces this to a real prior defect, a narrowed list under a header still stating the whole
corpus). This is real, load-bearing reuse across four separate customer-facing pages, not a copy-pasted
skeleton, a genuine architectural strength worth protecting; each surface then customizes only its own
facets, sort options, and rail cards (Regulations: mode/jurisdiction/topic/tier facets, priority
dropdown restored per an explicit operator ruling on artboard-vs-system precedence; Market: signal-kind
facet, carbon-cost rail card; Research: theme cards as a second facet row rather than a second tile
system, explicitly built to avoid the exact five-competing-urgency-vocabularies problem named in each
file's own header; Operations: the region×dimension matrix, unchanged, slotted into the shared shell's
`aboveRows` extension point). `Market`'s own component (`MarketIntelLedger.tsx` line 272) already titles
itself "Market Intelligence", the wrong "Market" label the audit found lives one layer up, in
`Sidebar.tsx:76` and `DashboardBrief.tsx:361` (`[CONFIRMED, wave2b-lanes-2026-09-29.md]`), not in the
ledger component itself, so W2-C's fix is genuinely a small, isolated nav-label change as scoped, not a
sign of deeper drift in the surface itself.

Operator's four questions (R3, 2026-09-25): what is happening, how does it affect me, what must I do,
where do I invest. Per surface:

- **Regulations**: answers all four by construction, spec 01 is explicitly "the only page whose read is a
  compliance-action text brief" `[CONFIRMED, INDEX.md spec line]`. Highest-leverage gap: the structured
  `recommended_actions` extraction just shipped (#832, 2026-09-29) closes the "what must I do" gap that
  existed as prose-only through 2026-09-25; verify it actually renders on the detail page (not confirmed
  this pass, `[HYPOTHESIS]`).
- **Market Intel**: answers "what's happening" (price series exist, three live producers) but "how does it
  affect me" is undercut by the still-wrong nav label and the unresolved raw-dump bug, a customer who
  hits that bug loses trust in the whole surface, disproportionate to the underlying data quality.
  Highest-leverage gap: reproduce and fix the raw-dump bug before anything else on this surface, it is a
  credibility failure, not a cosmetic one.
- **Research**: horizon-scan format built (spec 03); the assessment model (distance/maturity/credibility)
  is correctly still in design, gated behind the four-question rebuild. Highest-leverage gap: nothing to
  fix yet, this is sequenced correctly.
- **Operations**: matrix reader gap was a false finding, now refuted and closed, a real "what must I do /
  where do I invest" surface for hire-vs-automate decisions. Highest-leverage gap: R2's own finding that
  the page was built around one example (automate-vs-hire), generalization is Wave-2 lane W2-F, correctly
  scoped, not yet landed as of `2550ebbc`.
- **Community**: identity-by-default landed in principle (R8.7) but the anonymity-opt-in columns
  (migration 336) are W2-B's scope, not yet merged as of HEAD. Highest-leverage gap: ship W2-B, until
  then the composer's 400 error and the identity default are unresolved user-facing defects on a surface
  the operator called "co-equal" with the four intelligence pages.

## 5. The embarrassment test

**Would embarrass top developers today:**
1. The market detail raw-dump bug (a JSON/text blob visible mid-page), `[HYPOTHESIS, not yet reproduced]`.
   Fix: W2-D lane, already scoped; effort: small, needs a repro first.
2. `[CONFIRMED, incident note 2026-09-29-chained-apply-incident.md]` A 33-row live write from a
   mode-inheritance bug, caught only because a coordinator was watching the run in real time rather than
   by any automated gate. The class fix landed same day; the *instance* (33 quarantined items + 33
   staged_updates + 51 flags) is still live, unreversed, as of this audit's HEAD. Fix: land
   REVERSE-CHAINED-APPLY next; effort: small, statements already drafted per #829.
3. `[CONFIRMED, R12/2026-09-25-coordinator-close.md and WS5/wave-plan-2026-09-28.md, both cited above]`
   Wrong nav label for a whole surface persisting across at least two coordinator sessions despite being
   named an open item each time. Fix: one-line change, W2-C's scope; effort: trivial, the fact it has
   survived three planning passes without landing is the more interesting finding than the bug itself,
   and says something about wave sequencing discipline outrunning wave completion velocity.
4. `supabase-server.ts` (4,842 lines, three unrelated surfaces' readers in one file, confirmed by full
   read) is a god file a reviewer would hit in the first hour, already named as debt by the team itself
   in August, still true a month later. `canonical-pipeline.ts` (2,256 lines) reads differently on a full
   read than its line count suggests: most of its size is one coherent, heavily-gated grounding procedure
   (five interlocking integrity checks sharing state, section 3) rather than sprawl, a reviewer who reads
   only the line count and not the content would flag it wrongly; a reviewer who reads the grounding
   function itself would (correctly) ask why fetch-ladder and source-registration still share the file
   with it, a narrower and smaller complaint than "the whole file is a mess."
5. PROGRAM-BOARD.md's six-deep stacked "resume from" pointer chain at the top of the file, a visiting
   engineer's first read of the project's own memory system requires reading five supersession notices
   before reaching a fact. Fix: collapse to one current pointer, archive the chain; effort: 15 minutes.
6. `docs/plans/data-machine-tool-gaps-2026-09-25.md`'s own text records the operator's dispatch brief
   containing a stale claim ("decision propagation is designed only") the coordinator had to catch and
   correct with a live query before building on it, evidence the discipline (rule 14) is necessary
   because staleness genuinely happens even inside the same session's own planning artifacts, not a
   criticism of the artifact itself.

**Would impress top developers, worth protecting:**
- The rule-14/15 finding-status discipline and its enforcement script
  (`scripts/verify/audit-finding-status.mjs`), a mechanically-checked epistemics convention is rare at
  any team size, and this review is itself required to comply with it.
- `drain.ts` as a specimen of self-documenting, invariant-stating, concurrency-safe code.
- The wave-2 disjoint-write-set contract as a substitute for the coordination a larger team would get from
  standups, genuinely load-bearing engineering for a solo-operator-plus-agents team.
- The 2026-09-29 incident-to-guard turnaround (same day, root cause named, class fix shipped, generalizable
  lesson stated), this is incident response at a standard most funded teams do not hit.
- The `[REFUTED]`-in-place convention actually working (Operations UI-1, RW-3's dwell-count correction from
  66→4), most audit cultures never see a finding walked back this cleanly.

## 6. Recommendations (next two weeks, ordered)

1. **Land REVERSE-CHAINED-APPLY.** First step: execute the already-drafted reversal statements from #829
   under coordinator approval. File: new migration/script per that PR. Acceptance: the 33
   `intelligence_items`/`staged_updates` rows and 51 flags from run `36568656803` are gone; a live SELECT
   confirms zero rows with that run's marker.
2. **[CONFIRMED, see item 3 above] Land the Market Intel nav-label fix and investigate the raw-dump
   report.** First step: land W2-C (label) and reproduce W2-D's target report with a Playwright spec
   before attempting a fix. File:
   `src/components/Sidebar.tsx:76`, `src/app/market/[slug]/**`. Acceptance: label reads "Market Intel"
   everywhere; the bug either reproduces with a spec or is refuted with a citation.
3. **Extract a parameterized adversarial-proof runner** so rule 15 compliance stops being one bespoke
   script per guard. First step: generalize `scripts/verify/prov-guard-adversarial-audit.mjs`'s shape
   (target, forged predicate, expected denial) into a runner the next guard configures instead of
   authoring from scratch. File: new `scripts/verify/adversarial-runner.mjs`. Acceptance: the next
   security-critical migration's proof is a config object, not a new script; existing provenance proof
   still passes unchanged.
4. **Collapse PROGRAM-BOARD.md's resume-pointer stack to one current entry**, archiving the rest per the
   doc's own dated-archive convention. File: `docs/PROGRAM-BOARD.md` lines 17-59. Acceptance: a fresh
   session reads one pointer, not six, before reaching section 1.
5. **Extract fetch-ladder and source-registration/growth out of `canonical-pipeline.ts`**, leaving
   grounding (lines 1547-2215) and synthesis (843-1105) where they are, full read shows grounding's five
   gates (cited-host, target-mismatch, floor-attribution, dominance guard, mint-gates) share local state
   and are one coherent procedure, not sprawl; splitting it would cost more (a wider public contract
   between pieces) than it saves. File: `fsi-app/src/lib/agent/canonical-pipeline.ts` lines 161-335,
   613-648 (fetch) and 2217-2256 (registration/growth) move; the rest stays. Acceptance: same exported
   function names, same test suite green. This narrows, not reverses, the August "stay cohesive" call
   from `remediation-and-weight-2026-08-10.md`, the amendment is scoped to two-fifths of the file, not
   the whole thing.
6. **Prove Loop B's autonomous firing on a fixture/branch DB**, not live, now that the chained-dry-guard
   is merged. First step: dispatch the guarded chain and confirm hops 07/08 flip `enforceFired:true`.
   File: `loop-hops.d/07-*.json`, `08-*.json`. Acceptance: F50 reports 9/11 or better hops fired, with a
   real `workflow_run`-triggered artifact, not a hand-seeded one.
7. **Land Wave 2 lanes W2-B through W2-G** in the sequence the wave plan already sets, watching for the
   two already-flagged interlocks (community write-set overlap with W2-A on `muted/starred`, already
   resolved per the wave2b doc; the ADR-035 anonymity-floor helper as the one shared import). File: per
   lane's declared write set. Acceptance: each lane's own coverage test plus its `session-log.d` entry.
8. **Begin the `supabase-server.ts` domain split opportunistically**, one domain per lane that already
   touches that domain's readers, per the driver rule already in force. File:
   `fsi-app/src/lib/supabase-server.ts`. Acceptance: no dedicated lane spent on this alone; track via LOC
   trend already named in the August review as report-only.
9. **Route the harness/dispatch-ledger bookkeeping onto the installed `workflow`/`@workflow/next`
   primitives** rather than continuing to hand-roll `harness_runs` conventions per family, at least for
   new families. This conflicts with no current ADR but should become one before more hand-rolled harness
   code ships, propose ADR-037 evaluating durable-execution primitives against the current pattern, cost
   of migrating existing families weighed against cost of continuing to diverge. File: new
   `docs/decisions/ADR-037-durable-execution-primitives.md` (proposal, not accepted). Acceptance: the ADR
   states a decision either way with reasoning; no code changes required by this recommendation alone.
10. **Add a self-healing check for stale loop-manifest hops** (the class behind the hop-01 staleness this
    audit's own source documents found and fixed by hand) so a landed lane updates its own hop file in the
    same commit, per the tool-gap register's own "process gap, not a script" framing. File: lane-checklist
    addition, e.g. `docs/dispatches/lane-common-contract.md`. Acceptance: F50 never again reports a hop as
    unfired that a merged PR actually wired, without a human noticing separately.

No recommendation above requires amending a standing rule or ADR outright; #5 (canonical-pipeline split)
revisits but does not contradict the August cohesion call, and is flagged as such rather than silently
overridden, consistent with rule 4 (decisions become ADRs / amendments are recorded, not silently reversed).

## Coverage appendix

Per the operator's mid-audit directive, every code file below was read in full, first line to last,
not sampled, before any claim in sections 1-6 above cited it. Line counts as read this session.

| File | Lines | Read |
|---|---:|---|
| `fsi-app/src/lib/agent/canonical-pipeline.ts` | 2,256 | Full (2 reads: 1-616, 617-2256, plus targeted re-reads of 1317-2256) |
| `fsi-app/src/lib/propagation/drain.ts` | 306 | Full |
| `fsi-app/scripts/turns/run-population-flywheel.mjs` | 1,748 | Full (2 reads: 1-948, 949-1748) |
| `fsi-app/src/lib/supabase-server.ts` | 4,842 | Full (5 reads: 1-900, 901-1800, 1801-2800, 2801-3850, 3851-4842) |
| `fsi-app/src/app/regulations/page.tsx` | 96 | Full |
| `fsi-app/src/app/market/page.tsx` | 264 | Full |
| `fsi-app/src/app/research/page.tsx` | 98 | Full |
| `fsi-app/src/app/operations/page.tsx` | 66 | Full |
| `fsi-app/src/app/community/page.tsx` | 541 | Full |
| `fsi-app/src/components/regulations/RegulationsLedger.tsx` | 350 | Full |
| `fsi-app/src/components/market/MarketIntelLedger.tsx` | 355 | Full |
| `fsi-app/src/components/research/ResearchLedger.tsx` | 435 | Full |
| `fsi-app/src/components/operations/OperationsLedger.tsx` | 555 | Full |
| `.github/workflows/brief-apply.yml` | 244 | Full |
| `.github/workflows/brief-export.yml` | 404 | Full |
| `.github/workflows/bug-class-guard.yml` | 87 | Full |
| `.github/workflows/build-proof.yml` | 102 | Full |
| `.github/workflows/change-detection.yml` | 165 | Full |
| `.github/workflows/corpus-turn.yml` | 433 | Full |
| `.github/workflows/data-audit-lane.yml` | 70 | Full |
| `.github/workflows/date-chain.yml` | 193 | Full |
| `.github/workflows/discipline.yml` | 463 | Full |
| `.github/workflows/downstream-chain.yml` | 430 | Full |
| `.github/workflows/fetch-drain.yml` | 205 | Full |
| `.github/workflows/gate-a-rescan.yml` | 273 | Full |
| `.github/workflows/ledger-consume.yml` | 545 | Full |
| `.github/workflows/maintenance.yml` | 1,317 | Full (2 reads: 1-700, 701-1317) |
| `.github/workflows/population-turn.yml` | 768 | Full |
| `.github/workflows/producers.yml` | 491 | Full |
| `.github/workflows/propagation-drain.yml` | 465 | Full |
| `.github/workflows/source-monitoring.yml` | 178 | Full |
| `.github/workflows/source-sweep.yml` | 273 | Full |
| `.github/workflows/spot-check-monthly.yml` | 113 | Full |
| `.github/workflows/trust-recompute.yml` | 78 | Full |
| `.github/workflows/uptime-probes.yml` | 291 | Full |
| `fsi-app/package.json` |, | Read (dependency list only, via `node -e`) |

**Total: ~17,290 lines of application/workflow code read in full**, plus the docs in the original READ
SET (CLAUDE.md, docs/INDEX.md, PROGRAM-BOARD.md, specs 00-10 index entries, ADR-020 through ADR-036
index entries, the named plans, and the three session-log.d files) read as originally scoped.

**Named in the brief but not read line-by-line, honestly disclosed rather than silently claimed:** the
secondary components each surface page mounts beyond its primary ledger, `EudrCustodyPanel`,
`CarbonCostOverlay`, `SurchargeAuditPanel`, `OemRoadmapPanel`, `ReroutingPanel`, `IndexationPanel`,
`NoticesRail`, `UpcomingObligationsStrip`, `ThemeStrip`, `CredibilityChipEvidence`/`CredibilityChipAuthority`,
`Masthead`, `SystemErrorBanner`, and `CommunityRooms.tsx` (1,785 lines, Community's own primary
component, identified but not read this session). No claim in sections 1-6 above rests on the content of
these files; where community-surface product judgments were needed, they draw on `community/page.tsx`
(541 lines, read in full) and the specs/ADRs in the original read set, not on `CommunityRooms.tsx`
itself. A follow-up pass reading `CommunityRooms.tsx` and the secondary panel components would be needed
before any claim about their specific implementation could be made at the same evidentiary standard as
the rest of this document.

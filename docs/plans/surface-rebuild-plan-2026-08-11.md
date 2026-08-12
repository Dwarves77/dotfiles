# Surface rebuild plan: substrate first, then shape (2026-08-11)

Re-verification of all four intelligence surfaces against live code at HEAD `3533e12`, and the build plan
that follows from it. Supersedes the sequencing in `spec-audit-synthesis-2026-05-23.md`, which remains
useful as a record of intent but is materially stale as a record of state.

## 1. Why this document exists

The Operations redesign was scoped after Operations was found built to the wrong spec. The remaining plan
assumed the other surfaces were sound. Nobody had checked. The Market Intel audit already named
"built to wrong spec" as a pattern rather than an incident, and the synthesis doc has said since
2026-05-23 that **five of six** substantive surfaces had fundamental gaps. That claim was never
re-verified and never acted on beyond Operations.

Re-verified today: the other three surfaces have the same disease. More importantly, the per-surface
framing is itself the error. Four defects are identical on all four surfaces and live below them.

## 2. What was re-verified, and how the 2026-05-23 audits held up

Each surface was read against live code, not against the audit docs. Roughly 55 to 70 percent of the
2026-05-23 findings are now stale, and they are stale in one direction: **the chrome was rebuilt, the
data and the read-shape were not.**

| Surface | Detail route | Format renderers | Analysis contract | Verdict |
|---|---|---|---|---|
| Regulations | exists | 7 of 15 first-class | cost + binding unanswerable | QUALIFIED NO on its own intent |
| Market Intel | exists | 1 of 8 first-class, 7 prose | prose with market chrome | violates |
| Research | exists | 6 of 6, conditionally | no horizon axis at all | violates |
| Operations | exists | 8 of 8 headings, 0 first-class | no cross-region comparison | violates |

Stale claims worth retiring explicitly: no detail routes (all four now exist), Market severity vocabulary
lossy (now spec-exact), Market TRL framing (file deleted), Research titled "Research Pipeline" with a
stage legend (gone), Research rows linking to `/regulations` (gone), Operations "Coming soon, Phase D"
banner (gone), Operations stub chip gallery (file deleted).

**A prior of mine was refuted and is recorded here.** I believed `/research` still shipped the editorial
draft-staging queue rejected by the 2026-07-12 `research-is-horizon-scan` ruling, because
`src/app/research/page.tsx:44` says "The pipeline_stage UI control still functions." Traced properly:
`pipelineStage` is selected, mapped, adapted, typed, and **never rendered**. The only stage UI is admin
chrome. The doctrine is CLEAN; the false statement is in a code comment. I was one step from shipping a
fix for a violation that does not exist, on the authority of a comment.

## 3. The four substrate defects (identical on all four surfaces)

**S1. No detail route is surface-guarded.** `fetchIntelligenceItemUncached`
(`src/lib/supabase-server.ts:2340-2344`) gates on exactly one predicate, `provenance_status='verified'`.
No `item_type`, no `domain`, no surface check. All four `[slug]/page.tsx` files call it and `notFound()`
only when it returns null. Consequence: every verified item is reachable at four URLs under four
contradictory framings, and each detail surface **relabels** the item's stored sections with its own
heading map while silently dropping out-of-range keys. A 15-section regulation opened at
`/operations/<slug>` renders keys 1 to 8 under Operations headings and drops 9 to 15.

**S2. Counts and rows come from two different classifiers.** Tiles, bands and masthead totals read
`get_surface_counts()`, whose population is `surface_of(item_type, domain)` (migration 148, codegen'd
from `src/lib/surface-of.mjs`). Rows come from each surface's own `item_type` filter in its own RPC.
Same page, two populations, permanently disagreeing. Regulations compounds it with
`domain: row.domain || 1` (`supabase-server.ts:536`, `:1077`), so every null-domain row in the corpus
renders on the Regulations ledger regardless of item type, and is counted somewhere else.

**S3. UI bound to fields that have no producer anywhere in `src`.** Approximately 17 across the four
surfaces. Regulations alone has six, including `penaltyRange`, `costMechanism` and `enforcementBody`,
which are the entire "what it costs" clause of its contract; they were de-mapped as absent from schema
and the consuming tiles were left in place. Market has `marketData` (the key-figure column),
`recommendedActions`, and `cross_references` (fetched and dropped). These render permanent em-dashes.
They are not missing data, they are unwired contracts.

**S4. One page's renderer is doing another page's job.** `ProseSection`, the Regulations prose renderer,
supports bold, italic, code and URL, and no tables or lists. It is imported by
`MarketSignalDetailSurface` and `OperationsDetailSurface`. The two pages whose contracts are explicitly
comparative and numerical are physically unable to render a comparison table. This is
`analysis-follows-page-intent` violated in component form.

## 4. Why four separate audits could not see this

Each audit read one surface. A defect present on all four reads as "this page is under-built", four
times, and produces four rebuild line items instead of one substrate line item. The synthesis then
sequenced five rebuilds. Every one of those rebuilds would have re-implemented the same four bugs,
because none of them live in a surface.

## 5. The three-layer model, and where the gap actually is

| Layer | Question | Verifier | Status |
|---|---|---|---|
| 1. Sourcing | Which sources feed this surface? | `surface-contract-gate.golden.mjs` (PI-5) | EXISTS |
| 2. Data | Is it routed here, is the format complete? | `surface-visibility-audit.mjs`, `format-structure.mjs` | EXISTS |
| 3. Render | Does the page show it, in the shape its contract names? | none | **MISSING** |

Every finding in section 3 is Layer 3. Layers 1 and 2 are well governed, which is exactly why the
defects survived: the existing gates all pass on a corpus that the pages then fail to render correctly.

## 6. Why one mechanism works for every page

The plan does not invent a per-page test. Four things already exist, per page, in code:

1. **`src/lib/surface-of.mjs` is already the single SSOT for item to surface.** It already codegens
   migration 148's SQL, already carries a vocab drift guard, and is already consumed by 18 modules
   including `item-links.ts` (which decides outbound links) and `mint-item.ts` (the mint chokepoint).
   It is not consumed by the detail routes or the row RPCs. Making it authoritative on those two paths
   closes S1 and S2 on all four surfaces at once, with no new mechanism and no new vocabulary.
   The asymmetry to note: the platform already knows which surface an item belongs to when it writes a
   link *out*; it just never checks when a request comes *in*.

2. **The doctrine register already demands the per-page check.** `analysis-follows-page-intent` is
   marked `exempt` with the reason: "ENFORCEMENT-TO-BUILD with a named landing point: the per-page
   writer-agent contracts + goldens land WITH THE SURFACE BUILD UNITS... NAMED-RESIDUAL, REVISIT when
   the first surface build unit lands, grows an `enforcedBy` at that point." The acceptance gate is not
   a new idea, it is a registered debt with a named trigger, and the invariant-coverage meta-gate is
   what makes it collectible rather than aspirational.

3. **The contracts are already written per page, in one place**, as one testable sentence each
   (platform-intent SKILL.md): Regulations is compliance-action text; Market Intel is comparative and
   numerical; Research is structured horizon assessment; Operations is structured jurisdictional data.

4. **Each page already declares its format sections in code**
   (`src/lib/agent/formats/{regulation,market,research,operations,technology}.ts`) and each detail
   surface already declares its render map as a constant (`KNOWN_KEYS`, `RESEARCH_SECTION_HEADINGS`,
   `KNOWN_OPERATIONS_KEYS`). "Is section N first-class on this surface" is a set comparison between two
   values that both already exist.

So `scripts/verify/surface-acceptance.mjs` is one script with a four-row table, not four scripts. It
generalizes because every surface already declares its surface key, its contract, its format sections,
and its render map. Nothing about the design is Operations-shaped.

## 7. The plan

### Phase 0. Substrate (fixes all four pages, contains no design decisions)

These are bug fixes against existing binding contracts, not feature builds, so they sit inside the
platform-intent Authority Grant rather than requiring scope authorization.

- **0.1 Surface guard.** One helper: reject when `surfaceOf(item.item_type, item.domain)` does not equal
  the route's surface. Four call sites, `notFound()` on mismatch. Closes the four-URL leak and the
  section relabeling.
- **0.2 One population per page.** Move the row RPCs onto `surface_of`, or point the count RPC at the
  row predicate. Recommend the former: `surface_of` is already the codegen'd SSOT with a drift guard,
  and the alternative forks the vocabulary a fifth time.
- **0.3 Producer or deletion.** Each of the ~17 orphan fields gets a producer or gets removed together
  with its JSX, replaced by an honest absence state. No permanently dashed slot survives Phase 0.
- **0.4 Stop coalescing null domain to 1.** `surface_of` already defines unmatched as `uncategorized`,
  "never a customer surface, a defect signal". Honour it instead of defaulting to Regulations.
- **0.5 Per-page prose renderer.** Market and Operations stop importing the Regulations `ProseSection`.
  Minimum: table and list support, so a comparative section can render as one.

### Phase 1. The acceptance gate, built before the redesigns

`scripts/verify/surface-acceptance.mjs`, wired as fitness function F26. Per surface, asserts:

1. route guard holds (a foreign item 404s rather than rendering);
2. count population equals row population;
3. zero bound fields without a producer;
4. format sections rendered first-class at or above the declared floor;
5. no phase-language, worker jargon, raw enum, or internal id in customer-visible strings;
6. no cross-surface renderer import.

Seeded as a two-way ratchet at today's measured numbers, same shape as F23: over-baseline fails, and
under-baseline also fails with the value to re-seed to. This is what makes Phase 2 provable. Every
Build 7-11 dispatch returned a green Value Delivery Check while the surfaces were on the wrong
architecture; the gate is the thing those checks lacked.

### Phase 2. Per-surface shape work, ordered by measured contract-distance

- **Operations.** Make the dimension chip render a cross-region column instead of drawing a border. The
  control's own `aria-label` already says "Spotlight a dimension across regions"; the data is already
  keyed `${regionCode}|${dimKey}`. Zero backend. Then the EU/US data hole.
- **Market Intel.** Feed one numeric channel end to end. The comparative chrome is built and correct;
  every input is an orphan (`marketData` has no producer, `trajectory_points` is not in the system
  prompt, the price board has no scheduler).
- **Regulations.** Ungate the seven already-built section cards from the `hasFull` toggle, which today
  disables itself precisely on items whose `full_brief` failed to parse, hiding sections that are stored
  and paid for. Then add `binding_status`, which exists nowhere in the repo and is the load-bearing word
  in "binding regulatory intelligence".
- **Research.** Project the real `theme` column through to the index and add an Unclassified band.
  Today a finding matching no theme regex is counted in the tiles and rendered in zero bands, with no
  empty state. Verified content is silently invisible.

### Phase 3. Community and Dashboard

Scoped separately. Community is human-operated by construction and explicitly outside machine intake
(`community-is-human-space`), so its contract is a different shape and needs its own read rather than
an assumption that it matches the four.

## 8. Decisions (RULED, operator 2026-08-11)

1. **Format-binds-UI: PER-SURFACE, decided at Phase 2.** Decision #17 is not closed as a single
   cross-surface rule. Each surface sets its own first-class floor when its shape work is scoped.
   Consequence for Phase 1: criterion 4 ships as a **ratchet on today's measured counts only**
   (Regulations 7, Market 1, Research 6-conditional, Operations 0), not against a spec-derived floor.
   The ratchet still bites both ways, so a surface cannot silently lose a renderer, and each Phase 2
   unit raises its own ceiling deliberately.
2. **Sequencing: SUBSTRATE FIRST, all four surfaces.** Phase 0 and Phase 1 run across all four before
   any per-surface shape work. The Operations redesign lands with the merge gate already in place.
3. **Operations EU/US: SOURCE FREE, IN SCOPE.** Free HTTP sourcing is permitted and is real sourcing.
   EU and US fetchers for the five sourced dimensions are in Phase 2 scope, not descoped. The dead
   one-shot `sprint3-a6-find-new.mjs` is not revived; it stays on the deletion manifest and the new
   producer is built wired rather than hand-run.

## 9. What this changes about the flywheel sequence

Task 1 and the PART 3 §7 order are unaffected; they are discipline and dead-code work below the
surfaces. What changes is that the Operations redesign (O1 to O4) should not run as a single-surface
unit. Phase 0 and Phase 1 sit in front of it, apply to all four surfaces, and convert O1 to O4 from a
redesign into a redesign with a merge gate.

## Related

- [spec-audit-synthesis-2026-05-23](./spec-audit-synthesis-2026-05-23.md) — superseded on sequencing and
  on state; retained as the record of the five-rebuild intent and the 24 operator decisions.
- [flywheel-build-plan-2026-08-10](./flywheel-build-plan-2026-08-10.md) — this plan inserts Phases 0 and
  1 ahead of the Operations redesign.

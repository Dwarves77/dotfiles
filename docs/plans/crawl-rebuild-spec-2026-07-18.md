# Two-Tier Crawl Rebuild Spec (2026-07-18)

> **SUPERSEDED 2026-07-18 as a build basis** (recovery mandate). This spec was authored from the
> dormant-systems wiring map, not a behavioral read of the ingest pipeline. The behavioral read
> ([ingest-behavioral-read-2026-07-18](../audits/ingest-behavioral-read-2026-07-18.md)) established that it
> duplicated existing discovery machinery (`discoverCorroborators`, seek-more `generateCandidates`,
> `growSourcesFromBrief`, `extractPortalLinks`) and ignored the two real gaps: complete per-source
> extraction (the system is one-document-per-item everywhere) and the OPEN change-to-analysis loop
> (`intelligence_changes` has no re-ground consumer). DO NOT build from this document. Its
> register-enumeration research (EUR-Lex / Federal Register / gazette endpoints) is salvage material only.
> The build plan grounded in the real pipeline supersedes it.

**Status: SUPERSEDED (was: DRAFT for operator review).**

**Authority.** [ADR-015](../decisions/ADR-015-restore-source-monitoring-supersede-adr-012.md) restored
the founding source-monitoring design as the operating model (superseding ADR-012's manual-by-design
reframe). This spec is the restoration design ADR-015 named. It is specced against the current intake
structures and the keep-and-integrate set from the
[dormant-systems audit](../audits/dormant-systems-audit-2026-07-18.md), and nothing else.

**Live grounding (queried 2026-07-18, project kwrsbpiseruzbfwjpvsp).** 276 live items (210 verified, 66
quarantined = the drain queue); 825 active sources; `monitoring_queue` 580 rows (source-watch registry,
fed by check-sources accessibility pings); `portal_link_candidates` 0 (P2-5 portal-crawl never ran);
`coverage_gap_candidates` 109 (Session C's census: 106 MISSING / 2 HAVE_QUARANTINED / 1 AMBIGUOUS_ARCHIVED;
38 major / 71 minor). `system_state`: `scrape_cadence=off`, `global_processing_paused=false` — the app is
in the dormant (cadence-off) state, which `isGloballyPaused()` reads as globally paused, so no fetch fires
today regardless of `SCRAPE_HOLD`.

---

## 1. The shape: two tiers over one intake path, behind the existing gate stack

The founding design was a single expensive path (fetch + model-ground everything it discovered). The
restoration splits discovery into two tiers so the cheap half can run broadly and continuously while the
expensive half stays operator-priced and rare:

- **Awareness tier (cheap, enumerated).** Answers "what instruments/feeds exist that we do not have an
  item for yet." Enumerates a known universe, classifies each entry with Haiku (cents), diffs against
  current holdings, and STAGES the genuine deltas. No paid fetch, no grounding. Homed at the existing
  `/api/worker/check-sources` worker.
- **Depth tier (expensive, grounded).** The existing canonical grounding pipeline
  (`generate-brief` workflow through `/api/agent/run`): fetch the primary, extract the claim ledger,
  validate provenance. Unchanged by this spec except that its input now includes awareness-tier deltas.
  Gated behind `GROUNDING_ACQUIRE_ENABLED` + an operator-priced line, exactly as today.

Both tiers feed **one intake path** — `run-intake-cycle` reached through `/api/admin/run-intake`. There
is no parallel front door: an awareness-tier delta becomes a `staged_updates` row and is materialised by
the same `mintIntelligenceItem` chokepoint every other caller uses. This is the binding constraint from
ADR-015 and the audit's keep bar: anything that would need a second intake path or bypass a gate is out
of scope by definition.

```
awareness tier (cheap)                              depth tier (expensive, operator-priced)
  universe enumeration                                 GROUNDING_ACQUIRE_ENABLED + operator line
  -> Haiku classify                                    -> generate-brief workflow (/api/agent/run)
  -> diff vs holdings          ONE INTAKE PATH            -> fetch primary (assertFetchAllowed)
  -> stage delta        ---->  run-intake-cycle   ---->   -> extract + ground + validate_item_provenance
                              (/api/admin/run-intake)
        (every arrow above passes the existing gate stack — section 6)
```

## 2. The awareness tick (homed at /api/worker/check-sources)

`/api/worker/check-sources` already runs the right shape: a scheduled worker, worker-secret auth, gated by
`isGloballyPaused()` + `scrapeWindowOpen()` + per-source `auto_run_enabled`, that today does an
accessibility probe plus (dormant) content-change fingerprinting (PR #252) and portal-link harvest
(PR #253). The awareness tier is a new step INSIDE this worker, not a new worker:

1. **Enumerate** the active universe for the current wave (section 4). For wave one this is the
   regulatory-register listing endpoints (EUR-Lex OJ daily-view, Federal Register API, gazette
   classification indexes) — each a cheap listing/HTTP call, every one through `assertFetchAllowed` so the
   scrape hold gates it like any other fetch.
2. **Classify** each enumerated entry with Haiku (source-type, jurisdiction, freight-relevance) — cents,
   through the existing spend chokepoint (RD-10), never Sonnet.
3. **Diff against holdings** — the retrieval-before-generation discipline (RD-8) made mechanical: an entry
   whose canonical instrument key / identifier already exists in the corpus (or in `coverage_gap_candidates`,
   or a prior stage) is DROPPED; only the genuine delta survives. This reuses the existing
   `canonical_instrument_key` uniqueness machinery (migration 200 + EP-11).
4. **Stage** each surviving delta as a `staged_updates` transit row (RD-20: transit-only, max-age bounded),
   carrying its classification. No mint here — staging is the awareness tier's terminal.

The tick writes `monitoring_queue` (already the source-watch registry, 580 rows) and, for portal-style
sources, feeds `portal_link_candidates` (the built-but-never-run P2-5 ledger, currently 0 rows). The
change-detection fingerprint (P2-6, migration 161) tells the tick which enumerated sources actually changed
since last tick, so a steady-state tick re-classifies only movement, not the whole universe.

## 3. The one intake path (run-intake-cycle + the two owed surfaces)

The depth tier and the operator both reach intake through `run-intake-cycle` (the machine-gated
mint→ground→validate cycle, RD-20) invoked at `/api/admin/run-intake`. The audit's finding G-1 recorded
that ADR-012 promised two invocation surfaces for this route that were never built; ADR-015 makes them
debts this rebuild discharges:

- **Admin "run intake now" control** — a button on the admin surface (`AdminDashboard`) that POSTs
  `/api/admin/run-intake` over the staged deltas, runs ONE full cycle, and STOPS. Visibility-only on the
  result (staged / minted / rejected-with-reason), never a human approval gate (RD-20).
- **Script path** — a `scripts/` runner that does the same for headless/operator-CLI use, spend-gated by
  the same chokepoint.

At the cadence flip, the scheduled caller invokes the SAME `runIntakeCycle` over the awareness tier's
staged deltas — "manual" reduces to a button that does what the clock does
(doctrine `manual-intake-run-is-the-one-pipeline`). No manual-only branch in the pipeline.

## 4. Source-type-agnostic by construction: waves, not architecture

The awareness tick is specced source-type-agnostic: it enumerates a universe, classifies, diffs, stages.
"Regulatory-register enumeration" is the wave-one universe, NOT the architecture. Later waves change only
the enumerated universe and the classifier's expected types; the tick, the intake path, and the gate stack
absorb them with **no structural change**.

### Wave one — regulatory registers (Regulations surface)

- **Universe:** EUR-Lex OJ daily-view, Federal Register API, national gazette classification indexes, and
  the priced MISSING set from Session C's census (`coverage_gap_candidates`: 106 MISSING instruments — 38
  major / 71 minor — spanning global 32 / eu 24 / asia 11 / meaf 9 / latam 8 / uk 5 / us 5 + US states).
- **Feeds:** the Regulations surface (reg-family item types). Staged deltas mint reg items that the depth
  tier grounds at the reg-family authority floor.

### Wave two — Market Intel feeds (Market Intel surface)

- **Universe:** the dispositioned free market/press feeds Session C's census identified as the initial
  Market Intel universe (the ~62 free feeds ruled keepable). Enumeration is feed-pull (RSS/API listing);
  the same tick classifies each entry `market_signal`/`initiative`, diffs against holdings, stages.
- **Same tick, same intake, same gates.** The only delta from wave one is the enumerated universe (feeds
  instead of registers) and the classifier's expected type. No new worker, no new route, no new gate.
- **Note (transport):** wave two needs a feed-listing transport. The former `rss-fetch.ts` was purged
  (dormant-systems P-5) because it was a dead false-header module; if a feed transport is wanted it is
  re-specced here against `assertFetchAllowed` + snapshot-first, as a wave-two build item, not revived.

### Wave three — research-source monitoring (Research surface horizon feedstock)

- **Universe:** research-role sources — standards-body drafts (ISO/CEN committee stages), ICAO/IMO
  committee outputs (MEPC/CAEP working papers), academic/institute working papers and horizon-scan press.
- **Same tick, same intake, same gates.** Enumerated universe = research-role listing endpoints;
  classifier expected type = `research_finding` (+ some `technology`/`innovation`).
- **This wave discharges the `research-is-horizon-scan` feedstock gap** named in the Phase 2 register
  amendment (audit G-6): the doctrine says Research's feedstock is autonomous machine-ingested intake from
  research-role sources; wave three is that autonomous intake. When it lands, the register entry grows its
  `enforcedBy` (the research-feedstock intake wired to the awareness tick).

## 5. Per-wave independent sequencing

Each wave is a separate enumerated universe + classifier profile over the shared tick/intake/gates, so the
operator can sequence and price waves independently. Wave one does not block wave two or three; a wave is
"turned on" by adding its universe to the tick's enumeration set and its expected types to the classifier.
Section 9 costs wave one only; waves two and three carry their own sizing when the operator sequences them.

## 6. Gates every tier passes (the keep bar, made explicit)

The founding design lacked this stack; the restoration runs entirely inside it. Every arrow in the section
1 diagram passes:

| Gate | What it enforces | Where |
|---|---|---|
| `assertFetchAllowed` (SCRAPE_HOLD) | no fetch — enumeration or depth — fires while the hold is engaged | every transport |
| `isGloballyPaused` / `scrapeWindowOpen` / `auto_run_enabled` | the awareness tick fires only on a scheduled day, only when not paused, only for enabled sources | check-sources worker |
| `GROUNDING_ACQUIRE_ENABLED` + operator-priced line (RD-31) | no paid depth-tier grounding without an explicit operator go | depth tier |
| dedup-before-ground (RD-8) + `canonical_instrument_key` uniqueness (EP-11) | the awareness diff drops anything already held; no duplicate mint | tick step 3 + mint |
| mint gates (RD-41: S-CONFLATE hard / S-NUMERIC soft) + congruence (1a/1b) | source↔claim-type congruence + accuracy at mint | `mintIntelligenceItem` |
| source-link mint invariant (RD-22) | no source-less live item | mint chokepoint |
| snapshot-first verify (RD-29) + holdings-gate (RD-33) | no paid acquire when a fresh snapshot exists | verify-item |
| staged-transit max-age (RD-20) | staged deltas resolve (materialise / reject / route-to-flag), never park | staged_updates |
| per-item leases (RD-38 / mig 211) | no two writers on one item | drain/intake |

## 7. Coverage honesty — what each wave does and does NOT feed

Gaps labeled as gaps. Per customer surface:

| Surface | Wave 1 (registers) | Wave 2 (market feeds) | Wave 3 (research) | Gap after all three |
|---|---|---|---|---|
| **Regulations** | FEEDS (new reg instruments discovered + staged) | no | no | Sub-national/minor-jurisdiction registers not in the wave-1 universe stay manual until added; labeled. |
| **Market Intel** | no | FEEDS (market_signal/initiative from the ~62 free feeds) | partial (research-press signals cross-ref) | Paid/subscription market feeds are NOT in the free universe; corporate-press coverage is only as wide as the enumerated feed set. |
| **Research** | no | no | FEEDS (research_finding horizon feedstock) | Paywalled journals not enumerable for free stay out; labeled. |
| **Operations** | INDIRECT (regional_data reg items ground via wave 1) | INDIRECT (regional cost signals) | no | Operations has NO dedicated awareness wave in this spec — its `regional_data`/cost surface is fed only as a side effect of the other waves. A dedicated Operations feed wave is a NAMED GAP, not specced here. |
| Map | INDIRECT (view over Regulations) | no | no | Inherits Regulations coverage; no own feed. |

**The load-bearing honesty statement:** this spec feeds Regulations (wave 1), Market Intel (wave 2), and
Research (wave 3) directly. It does NOT give Operations its own discovery wave; Operations coverage remains
a side effect. That is a labeled gap for a future Operations feed wave, not something this spec silently
covers.

## 8. What this spec deliberately excludes

- **The relabel primitive Session A specced** (the byte-precise `[slot_key]` re-tagging tool for the drain
  queue). Deferred to the session that resumes Session A, so the builder and operator of that tool are the
  same session. Not built here, not specced here.
- **Any grounding-model or floor change.** The depth tier is the existing pipeline unchanged.
- **The `source_trust_events` never-emitted event-type narrowing** (dormant-systems P-6 deferral): it
  collides with the phase-3 fruition reputation work and is held for a separate operator ruling. See the
  decision line below — this spec is the evidence that ruling turns on.

### 8.1 Decision line — the deferred `source_trust_events` event-type narrowing (operator ruling owed, this spec = evidence)

The P-6 purge held back the "never-emitted trust-event types" (the conflict-resolution promotion/demotion
vocabulary on the live `source_trust_events` table). The operator sustained that hold on the merits and
routed the final ruling through THIS spec, as evidence. The rule is binary:

- **IF this spec's DEPTH TIER uses those event types, they STAY.** It does not. The depth tier is the
  existing `generate-brief` grounding pipeline UNCHANGED (section 1) — it emits only the already-live event
  types (`tier_override` / `tier_override_revert` / `manual_review` and the tier-recompute events written by
  the 6 live writers). It introduces no conflict detection, no promotion/demotion, and no new
  `source_trust_events` event type. The never-emitted conflict-resolution vocabulary is on no path in this
  spec.
- **IF sealed corroboration keeps reputation out of eligibility PERMANENTLY, they PURGE at that ruling.** It
  does. The moat is permanent by construction (`institution.ts` resolves reg-fact eligibility from
  `base_tier ?? null`; dynamic reputation / `effective_tier` never confers eligibility — SC-9). Phase-3
  fruition builds a NEW reputation-metric class and widens the CHECK with NEW event types; it does not
  revive the OLD conflict-resolution promotion/demotion engine (which was purged as `computeConflictResolutionImpact`).

**So the evidence points to PURGE**, at the operator's ruling: the deferred event types are used by neither
the crawl depth tier nor the phase-3 reputation work, and the sealed-corroboration moat is permanent. What
is held for the operator is the ACT of narrowing the CHECK on the live 905-row `source_trust_events` table
(a break-risky migration on live data) — not the judgment, which this spec settles. When the operator rules
purge, the narrowing lands as a content-gated migration in the same tombstone-then-delete form as
migration 215. Until then the never-emitted values sit inert in the CHECK, certifying nothing.

## 9. Costed wave-one sizing (the number the operator prices before any build)

Wave one has two phases. The awareness half is cheap and continuous; the depth half is the priced
acquisition of the discovered instruments.

**Phase 1 — awareness tier build + first full enumeration (cheap, one-time + continuous).**
- Build: the enumeration step + Haiku classifier + diff + stage, wired into check-sources, plus the two
  owed `/api/admin/run-intake` surfaces (admin button + script). Pure code; no paid model calls to build.
- First enumeration run cost: Haiku classification over the wave-one universe. Order of magnitude: the
  register-listing enumeration surfaces a few hundred candidate entries; at Haiku classify (~cents per
  entry) the first full pass is single-digit dollars. Steady-state ticks re-classify only changed entries
  (P2-6 fingerprint), so ongoing awareness cost is negligible.
- **Phase 1 is safe to run under the current dormant state** (no paid grounding), gated by the cadence
  flip for the scheduled path and runnable on demand via the admin button.

**Phase 2 — depth-tier grounding of the discovered MISSING set (paid, operator-priced).**
- Universe: the 106 MISSING instruments in `coverage_gap_candidates` (38 major / 71 minor), the priced
  60→400 expansion Session C already sized.
- Per-item grounding cost is the existing pipeline's ~$0.15–0.35/item (Browserless + Sonnet), so the full
  106-item depth pass is on the order of **$16–37** depending on the major/minor mix and re-fetch depth —
  the same class of number as Session C's expansion pricing. This is the figure the operator prices.
- Phase 2 runs ONLY behind `GROUNDING_ACQUIRE_ENABLED` + an explicit operator-priced line, one paid pass
  per item (RD-10), snapshot-first (RD-29). It can be sequenced in batches (major-first, or by jurisdiction)
  so the operator prices a batch at a time rather than the whole set at once.

**The operator prices Phase 2 (and authorises Phase 1's build) before any build begins.** The machine
proposes no default and anchors no number; the ranges above are facts (item counts) plus a clearly-labeled
projection (per-item cost × count), per `operator-sets-cost` (RD-31).

## 10. Build sequence (once priced)

1. Phase 1 code: awareness step in check-sources + the two `/api/admin/run-intake` surfaces + behavioral
   golden (RD-35: input a known register listing, assert enumerate→classify→diff→stage fires end-to-end).
2. First awareness enumeration (on-demand via the admin button, dormant-safe).
3. Operator reviews the staged deltas vs `coverage_gap_candidates`.
4. Phase 2 depth grounding, operator-priced, batched.
5. Cadence flip (operator's word) turns the awareness tick scheduled; steady state begins.
6. Waves two and three sequenced independently, each adding its universe + classifier profile to the same
   tick, priced separately.

---

*This document is a design proposal for operator review. It builds no code and mints/grounds nothing.
It is specced against the current intake structures and the dormant-systems audit's keep-and-integrate set,
per ADR-015.*

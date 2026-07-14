# Fetch-align-diff engine — scope + build state (Wave-β B3, 2026-07-14)

The amendment-diff engine, pulled forward as part of the holdings-audit unit (operator amendment 2). It
turns the scraping-era corpus defect into the feature's proving ground: **every re-collection both heals the
corpus and exercises the amendment-tracking the customer buys.** The incomplete original captures are exactly
the test set an amendment-diff engine needs.

Related: [holdings audit](../audits/rd33-retro-apply-2026-07-14.md) (sibling batch unit) ·
[run-structure-protocol](../runbooks/run-structure-protocol.md) (this is a tier-3 corpus-mutating step) ·
[funded-pass flight-state](../ops/funded-pass-flight-state-2026-07-14.md).

## What is BUILT ($0, deterministic, tested)

`fsi-app/src/lib/sources/amendment-diff.mjs` — pure core, 7 goldens (`amendment-diff.test.mjs`). No LLM, no
fetch. Reuses `holdings-audit.mjs` `detectPublisherShape` + `extractCleanText`.

| Stage | Function | What it does |
|---|---|---|
| structural align | `segmentByShape(text, shape)` | splits a document into provisions by publisher shape (eur-lex Articles, legislation.gov.uk Sections, federal-register §, gazette/other); dedups TOC vs enacting (keeps longer); preamble as its own segment; no-markers → one `whole` segment |
| span-match | `normHash` + `alignSegments` | matches provisions by key + normalized content hash; **unchanged = same key, same hash** |
| delta extraction | `alignSegments` + `segmentTextDiff` | `added` / `removed` (key set diff) + `changed` (same key, different hash) carrying a deterministic sentence-level add/remove diff |
| timeline routing | `toTimelineEvents(diff)` | routes the delta to milestone-shaped event candidates (`{kind, provision, label, milestone_date}`) — the pure transform |
| end-to-end | `diffDocuments(prev, next, {url})` | detect shape → segment both → align → counts + full delta |

## What is DEFERRED (rides the pass — a write, a tier-3 step)

The engine is the pure transform. Its use — **fetch a re-collection of a truncated capture → diff it against
the held (incomplete) capture → persist the timeline events** — is a corpus-mutating, paid step. Per the
run-structure protocol it is **tier 3** (paid + corpus-mutating) and runs only after **GATE A** (the operator
authorizes truncated re-collections). Specifically deferred:

- The persistence adapter (`toTimelineEvents` → `item_timelines` rows). `item_timelines` is milestone-shaped
  (`item_id, milestone_date, label, sort_order`); the caller supplies `milestone_date` (the amendment's dated
  effect) and maps `label`. A richer per-provision amendment store, if wanted, is a schema decision at wiring
  time — not built speculatively.
- The fetch half (re-collect the fuller document) — a Browserless spend gated by the acquire lock + GATE A.
- Wiring into `canonical-pipeline` so a re-ground of a re-collected source emits amendment events.

## Test-set framing (why this is the proving ground)

The holdings audit found the truncated / grounding-cap-exposed captures (365 items hold a >40KB snapshot the
40K grounding read never saw in full; the STUB/FURNITURE captures). Each such item, when re-collected, feeds
the diff engine a real old→new pair. The re-collection heals the corpus (the fuller document grounds the
item) **and** produces the first genuine amendment deltas — the customer feature exercised on real data, at
the moment the corpus is repaired. That is the strategic point the operator registered.

## Launch-clause note

Amendment-tracking is a customer-facing capability; its first real exercise is these re-collections. The
coverage-floor definition (moved up, before T10) should account for whether amendment-tracking is a launch
capability or a fast-follow — priced against how many held captures are re-collection candidates.

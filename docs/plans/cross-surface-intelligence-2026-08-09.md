# Cross-surface intelligence — the differentiator, made real (2026-08-09)

The core value: each surface is educated by the others. A Market Intel item knows it matters BECAUSE a
Research programme is underway or BYD ships in 6 months; an Operations item knows a regulation matters
BECAUSE of the tooling in its regions. Shared provenance lets the platform see connections others can't —
"enlightenment and direction." Operator-stated 2026-08-09. This plan makes it real; today it is dormant.

## Live state (measured, not assumed)

800 verified items · **25 with an intersection_summary (3%)** · ~161 with scenario tags, ~164 with
compliance tags (the tags that drive detection — so ~80% are signal-less) · **61 cross-reference edges**
corpus-wide. The machinery exists (intersection_summary / conversion_trigger / cross_references fields,
`item_cross_references` + `related_items_derived()` view [mig 146], `detect_intersections` RPC,
`LinkedItemsCard`), but the connections are barely populated.

## Root cause (confirmed by code read)

Generation is NOT fed the related corpus items. `synthesiseAndWriteBrief` builds the user message from the
item's own title + sources only; there is no "related items" block (grep: zero). So the model emits
`related_items` / `intersection_summary` from its OWN training knowledge, ungrounded in our corpus — and
under the integrity rule, when it can't ground a connection it correctly emits null. Result: 3%. The
connections that would "get us ahead" can't form because the writer is blind to the other surfaces.

## The fix — source-growth applied to connections

Sources grow by being referenced within existing briefs (`source-growth.ts`: parse citations → register →
grow). Connections grow the same way: discover candidates from what items SHARE, feed them into generation
so the causal link is grounded, surface them, and let it compound.

1. **Connection discovery (the $0 engine, DB-derivable).** For an item, find candidate cross-surface
   connections from SHARED PROVENANCE — same `canonical_instrument_key`, same source, overlapping
   `compliance_object_tags` / `operational_scenario_tags`, jurisdiction+topic overlap, or an existing
   citation edge. Score + rank. This is the analog of source-growth's citation parse; no model call.
   (Reuse: extend the entity linker `src/lib/entities/link-items.ts` + `related_items_derived()`, don't
   rebuild — they already write `item_cross_references` under the moat boundary.)
2. **Grounded generation (the key fix).** Before synthesis, inject the top candidate related items (title +
   surface + item_type + key tags + one-line gist) as a "RELATED CORPUS ITEMS" block, with the instruction:
   cross-reference these where a REAL connection exists, and state the causal direction ("this matters
   because [Research X] is underway", "flips to pressure when [BYD launch, Q2 2027]"), grounded — never
   invent a link. The model now writes the "this matters because ___" chain against the real corpus.
   `intersection_summary` + `conversion_trigger` + `cross_references` populate with grounded content.
3. **Surface it (per the reader's profile).** `LinkedItemsCard` already renders links; wire it on all five
   surfaces and fold the connection into the read-time lens ("relevant to you AND connected to [item] on
   [surface]"). The reader sees the web, filtered to their operation.
4. **Compound.** As edges populate, connection discovery finds second-order links (A↔B, B↔C ⇒ surface
   A→C candidacy); a periodic pass re-scores. Connections beget connections — the growth loop.

## Grounding guarantee (non-negotiable)

A cross-reference is asserted ONLY when the related item is real (in the corpus) and the shared basis is
real (shared instrument/source/tag/citation). No invented links — the same integrity moat that governs
FACT spans governs connections. A guessed "this matters because" is worse than none.

## Build sequence

1. Connection-discovery module (pure scorer + a corpus candidate query) + test. $0. [foundation]
2. Feed candidates into `synthesiseAndWriteBrief` (the grounding block). Core-path change — careful,
   typecheck, a small live pilot before corpus-wide.
3. Backfill pass: run discovery over the verified corpus to populate `item_cross_references` from shared
   provenance (immediate edges, model-independent), then selective regeneration to write grounded
   `intersection_summary` on high-value items — measured on the pilot first.
4. Surface on all five surfaces + read-time lens.
5. Compounding pass (periodic re-score).

## Sequencing vs the rest

This is the CENTERPIECE. It composes with read-time anchoring (Track 2 of the anchoring plan): anchoring
says "this matters to YOU"; cross-surface says "this matters BECAUSE of that." Together they are the
enlightenment-and-direction product. Corpus buildout (Decision 3) still runs in parallel and independent.

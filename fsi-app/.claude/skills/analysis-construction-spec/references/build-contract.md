## 9. Build contract for Claude Code
The specs above are what to write. This is what to build.

Scope: this contract covers the four BRIEF-DRIVEN surfaces (Regulations, Market, Research,
Operations) plus Technology. Community is the fifth customer-facing surface but is NOT brief-driven
it is peer-generated content (working groups, forums). It feeds no brief or surface (ADR-041, no
editorial pickup, no promotion). Its direction is owned by the Community workstream (group/region
structure, author identity), not this spec.

Per non-regulatory prose format (Research, Market, Technology), reusing the regulatory code pattern:
1. A section-extractor keyed to the format's section list, analog of extract-regulation-sections.ts.
2. An item-detail display, analog of RegulationDetailSurface; wire the existing surface to render
   generated sections, not seed.
3. One validated known-good exemplar (analog of PPWR v7). The only new authoring beyond this spec.
4. Point content-generate.mjs at the format's item_types; the system prompt is already format-aware.

The grounding engine is not one engine. The reused span engine covers the fact sections. Three
capabilities are net-new and are where the build actually lives:
- CORROBORATION-COUNT for Market: discover independent sources, dedup by independence, count within
  the window.
- MATRIX-COMPLETENESS for Operations: confirm the same dimension is sourced across the regions a
  comparison spans; gate the comparison sections on the two-region threshold.
- TRANSITIVE-INTEGRITY for synthesis sections in every format: ground them last; mark valid only if
  every factual claim traces to a grounded input section and no new unsourced fact is introduced.
Build each capability before generating the sections that declare it.

Cross-pollination (No-Vacuum Rule): the non-regulatory formats must EMIT the four intersection-
readiness fields (the 13-field agent contract already does this — verify content-generate.mjs keeps
the full contract for every format) AND CONSUME them where a section's direction is supplied by a
linked item on another surface. The surfaces render the relationships via the persisted connection
graph, read through src/lib/connections/pair-view.mjs and served at /api/admin/intersections (the
detect_intersections RPC this replaced was dropped in migration 265). A non-reg brief that cannot point at the item it depends on is missing a
layer of direction the regulatory items get for free.

Operations runs as its own data-sourcing program with source-registry expansion and the coverage
threshold above. It does not block the three prose formats.

Routing, separate from formats: the research surface is showing regulations and Market is showing a
standard (GHG Protocol). Fix item_type-to-surface routing so each surface shows only its types.

Competitive sections (S5) will frequently omit-with-note, because competitor footprint, tender, and
RFP wording are rarely public. That is the integrity rule working. Never fill S5 with speculation to
look complete; sparse-but-true beats full-but-invented. Expect COMPETITIVE EDGE to be the thinnest
lens in real output, and do not read its emptiness as a pipeline failure.

Discipline: the brief-formats skill is authoritative for the regulatory format and the shared rules;
reconcile against it, not the mockups. Surfaces define the grouping axis; this spec defines per-item
sections and per-section grounding; wire all three, reinvent none. Ground every claim; no legal
interpretation pre-empted; supply stays paused.

Sequence: run the regulatory proof in parallel now (ready, metered). Then, one at a time, validating
each against its known-good exemplar before scaling: Research first (6 sections, tightest, fixes the
most-broken surface, grounding model closest to regulatory), then Market, then Technology. Operations
runs as its own parallel program.

Exemplar is spec validation, not only QA: Research's first end-to-end exemplar confirms or corrects
this document. Expect it to send edits back to S3 and S5 here. Nail Research's one exemplar, let it
correct the spec, then scale and move to Market.

Verification bar per format: one real item renders all its sections end to end (generate or source,
extract, ground by the declared model, display) against the known-good exemplar, with severity, the
four lenses, the Context Rule, and the No-Vacuum link visible in the output, before any scale.

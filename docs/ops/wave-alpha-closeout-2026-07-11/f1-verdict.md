# F-1 Contradiction — Verdict (2026-07-11)

**Finding (Chrome audit, live site):** `/regulations/:id` still renders the literal placeholder source row
"Source Name / URL · Tier estimate · Why this source matters" with no backing record — which PR #267's
render gate should make impossible.

## Verdict: **LIVE GATE-ESCAPE** (not a stale deploy)

**Production commit:** master `71bcbd46a30e6b4e5f953a4949c3b8e276dacf8b` (Vercel production-target deployment
`dpl_EunDvKVCELnLuEfW3cyzufddoZZ2`). PR #267 (`605102b4`, merged 2026-07-09) is an ancestor of `71bcbd4`
(merged 2026-07-10). **Production INCLUDES #267.** So the finding does NOT dissolve at deploy — a renderer
escaped the gate.

## The escaped renderer + why the CI detector missed it

#267 closed the fabricated-source class at two places: the **parser** (`parseSourcesList` skips every
table's header) and the **four structured renderers** (`SourcesList`/`ObligationsTable`/`RegulationTimeline`/
`ActionList` via `source-entry-filter.mjs::renderableSourceEntries`, which drops header-echo names —
"source name"/"url"/"tier estimate" are all in `HEADER_LITERALS`).

The escape is a THIRD render path #267 never touched: the "Full regulatory analysis" accordion on the reg
detail (`RegulationDetailSurface.tsx:684`) renders the **raw brief markdown** via
`<IntelligenceBrief markdown stripSources />`. That path uses the older #172 `stripSourcesSection`
(`IntelligenceBrief.tsx:20`), whose title match is `/^sources\b/` — it strips `## Sources` but NOT
`## New Sources Identified` (starts with "new"). The "New Sources Identified" table — the agent-emitted
corroborator-leads table present in ~97/103 reg-family briefs, header row "Source Name | URL | Tier estimate"
— therefore survives the strip and renders verbatim as raw markdown.

**Why the corpus-wide CI detector + the #267 gate both missed it:** both operate on the **parsed,
structured** entry set (the trust boundary is parse→render for the structured components). The raw-markdown
accordion is an **UNPARSED** render path — it emits `stripSourcesSection(fullBrief)` straight to the markdown
renderer, so no structured-entry gate ever runs on it. The gate guarded the structured door; the raw-markdown
door was a second, ungated entrance to the same room. Class lesson: a render-trust gate must cover EVERY
path that emits brief content to a customer surface, including raw-markdown/`stripSources` fallbacks, not
only the structured renderers.

## Fix (rides the layout dispatch, standalone branch `fix/chrome-layout-f1-2026-07-11`)
Broaden `stripSourcesSection` to strip the sources-lead artifact sections (`## New Sources Identified`,
`## Sources Identified`, `## Additional/Corroborating Sources`) — they are pipeline registry-growth
artifacts, never customer content — with red-then-green tests (both-tables-stripped, numbered + bold header
variants, no-over-strip of a legitimate numbered content section). The GUARD dispatch adds a
placeholder-literal assertion to the fixture-based overflow check so this class is build-catchable.

**Production impact:** the fix ships when `fix/chrome-layout-f1-2026-07-11` merges to master (sequenced AFTER
the Wave-α master PR per operator). Until then the escape is live in production on reg-detail briefs that
carry a New Sources table.

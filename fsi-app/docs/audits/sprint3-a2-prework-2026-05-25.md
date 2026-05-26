# Sprint 3 A2 — Agent Prompt Extension Prework

**Date:** 2026-05-25
**Status:** AWAITING OPERATOR REVIEW. No code changes applied. Diff staged below.

---

## Goal

Extend the agent emission contract to include `signal_band` (market signals) and `theme` (research findings) columns. After deployment, refactor the regex classifiers in `MarketPage` / `ResearchView` to read columns first, falling through to regex only for legacy data.

---

## Current state — agent emission contract

File: `src/lib/agent/system-prompt.ts` (line 234, line 339-354)

The agent currently emits **13 fields** in a YAML frontmatter block at the end of every regeneration:

```yaml
---
severity: ACTION REQUIRED
priority: CRITICAL
urgency_tier: watch
format_type: regulatory_fact_document
topic_tags: [emissions, reporting]
operational_scenario_tags: [CBAM-declaration, ...]
compliance_object_tags: [importer, ...]
related_items: [<uuid>]
intersection_summary: "..."
sources_used: [<uuid>, <uuid>]
last_regenerated_at: 2026-04-29T18:42:00Z
regeneration_skill_version: "2026-04-29"
---
```

`signal_band` and `theme` are NOT emitted. The MarketPage / ResearchView surfaces derive them client-side via `BAND_KEYWORDS` and `THEME_KEYWORDS` regex classifiers (v3 Phase 3C belt-and-braces).

---

## Proposed diff — agent prompt (`src/lib/agent/system-prompt.ts`)

### Change 1 — Field count (line 234)

```diff
-Every regeneration writes 13 fields to intelligence_items. The full_brief column carries the markdown body produced under the format selected above. The other 12 fields are emitted as a YAML frontmatter block at the very end of the markdown output, after any New Sources Identified section. Downstream code parses the YAML and writes the fields to the row. An absent or malformed YAML block is a failed regeneration.
+Every regeneration writes 15 fields to intelligence_items. The full_brief column carries the markdown body produced under the format selected above. The other 14 fields are emitted as a YAML frontmatter block at the very end of the markdown output, after any New Sources Identified section. Downstream code parses the YAML and writes the fields to the row. An absent or malformed YAML block is a failed regeneration.
```

### Change 2 — Add `signal_band` + `theme` field descriptions (insert after `topic_tags` line 243)

```diff
 - topic_tags — array of 0-3 tags from the topic_tags controlled vocabulary below. Tags outside the vocabulary fail the regeneration.
+- signal_band — one of price | corporate | corridor when format_type is market_signal_brief; null otherwise. Drives /market band routing column-first.
+- theme — one of emissions | fuels | transport | reporting | packaging | corridors | research when format_type is research_summary; null otherwise. Drives /research theme routing column-first.
 - operational_scenario_tags — array of 0-5 tags describing operational scenarios this item touches.
```

### Change 3 — Add `signal_band` vocabulary section (insert after `topic_tags` controlled vocabulary, ~line 278)

```diff
+
+signal_band vocabulary (locked, closed, exactly 3 values for market_signal_brief; null for other formats):
+
+- price — fuel prices, carbon prices, freight rates, surcharge changes, allowance auctions
+- corporate — corporate ESG announcements, M&A, financing rounds, board moves, S&P/MSCI rating changes
+- corridor — green shipping corridors, port partnerships, route-level operational changes
+
+Emit null when format_type is anything other than market_signal_brief. Tags outside this list fail the regeneration when format_type IS market_signal_brief.
+
+theme vocabulary (locked, closed; same 7 values as topic_tags; for research_summary only, null otherwise):
+
+- Mirror values from topic_tags: emissions, fuels, transport, reporting, packaging, corridors, research
+- Emit null when format_type is anything other than research_summary.
+- When format_type IS research_summary, theme is the single most central theme for the finding (not a multi-value tag list). Distinct from topic_tags which is multi-value and applies to all formats.
```

### Change 4 — Update YAML example block (line 339-354)

```diff
 ---
 severity: ACTION REQUIRED
 priority: CRITICAL
 urgency_tier: watch
 format_type: regulatory_fact_document
 topic_tags: [emissions, reporting]
+signal_band: null
+theme: null
 operational_scenario_tags: [CBAM-declaration, customs-declaration-import, emissions-reporting-Scope3]
 compliance_object_tags: [importer, customs-broker, manufacturer-producer]
 related_items: [b3c4d5e6-f7a8-4901-2345-678901234567]
 intersection_summary: "..."
 sources_used: [a1b2c3d4-..., fedcba98-...]
 last_regenerated_at: 2026-04-29T18:42:00Z
-regeneration_skill_version: "2026-04-29"
+regeneration_skill_version: "2026-05-25"
 ---
```

### Change 5 — Bump skill version (line 250)

```diff
-- regeneration_skill_version — fixed string identifying the SKILL.md contract version. For regenerations under the current contract, the value is "2026-04-29".
+- regeneration_skill_version — fixed string identifying the SKILL.md contract version. For regenerations under the current contract, the value is "2026-05-25".
```

---

## Proposed diff — parser (`src/lib/agent/parse-output.ts`)

### Change 1 — Add SIGNAL_BAND_VALUES + THEME_VALUES constants (insert after FORMAT_TYPE_VALUES, ~line 29)

```diff
+const SIGNAL_BAND_VALUES = ["price", "corporate", "corridor"] as const;
+const THEME_VALUES = TOPIC_TAG_VALUES; // mirrors topic_tags
```

### Change 2 — AgentMetadata interface (line 71)

```diff
 export interface AgentMetadata {
   severity: typeof SEVERITY_VALUES[number];
   priority: typeof PRIORITY_VALUES[number];
   urgency_tier: typeof URGENCY_TIER_VALUES[number];
   format_type: typeof FORMAT_TYPE_VALUES[number];
   topic_tags: typeof TOPIC_TAG_VALUES[number][];
+  signal_band: typeof SIGNAL_BAND_VALUES[number] | null;
+  theme: typeof THEME_VALUES[number] | null;
   operational_scenario_tags: string[];
   compliance_object_tags: typeof COMPLIANCE_OBJECT_VALUES[number][];
   ...
 }
```

### Change 3 — Required fields list (line 223)

```diff
   const required = [
     "severity",
     "priority",
     "urgency_tier",
     "format_type",
     "topic_tags",
+    "signal_band",
+    "theme",
     "operational_scenario_tags",
     "compliance_object_tags",
     ...
   ];
```

### Change 4 — Add validation block (insert after topic_tags validation, ~line 283)

```diff
+  // signal_band — null, OR one of 3 values, AND only allowed when
+  // format_type is market_signal_brief.
+  const signalBandRaw = fields.signal_band.trim().toLowerCase();
+  const signalBand = signalBandRaw === "null" || signalBandRaw === "" ? null : signalBandRaw;
+  if (signalBand !== null) {
+    if (!SIGNAL_BAND_VALUES.includes(signalBand as any)) {
+      throw new AgentOutputParseError(`Invalid signal_band: "${signalBand}". Allowed: ${SIGNAL_BAND_VALUES.join(", ")} or null`);
+    }
+    if (fields.format_type !== "market_signal_brief") {
+      throw new AgentOutputParseError(`signal_band may only be non-null when format_type is market_signal_brief (got format_type="${fields.format_type}")`);
+    }
+  }
+
+  // theme — null, OR one of 7 values, AND only allowed when
+  // format_type is research_summary.
+  const themeRaw = fields.theme.trim().toLowerCase();
+  const theme = themeRaw === "null" || themeRaw === "" ? null : themeRaw;
+  if (theme !== null) {
+    if (!THEME_VALUES.includes(theme as any)) {
+      throw new AgentOutputParseError(`Invalid theme: "${theme}". Allowed: ${THEME_VALUES.join(", ")} or null`);
+    }
+    if (fields.format_type !== "research_summary") {
+      throw new AgentOutputParseError(`theme may only be non-null when format_type is research_summary (got format_type="${fields.format_type}")`);
+    }
+  }
```

### Change 5 — Return metadata object additions

```diff
   return {
     body: bodyWithoutYaml,
     metadata: {
       severity: fields.severity as any,
       priority: fields.priority as any,
       urgency_tier: fields.urgency_tier as any,
       format_type: fields.format_type as any,
       topic_tags: topicTags as any,
+      signal_band: signalBand as any,
+      theme: theme as any,
       operational_scenario_tags: opScenTags,
       compliance_object_tags: compObjTags as any,
       ...
     },
   };
```

---

## Proposed diff — worker first-fetch (`src/app/api/worker/drain-first-fetch/route.ts`)

### Change — Extend `seedRow` to write the new columns (line 304-314)

```diff
   if (enrichment) {
     seedRow.title = (enrichment.title || source.name || source.url).slice(0, 200);
     seedRow.summary = enrichment.summary;
     seedRow.severity = enrichment.severity;
     seedRow.priority = enrichment.priority;
     seedRow.urgency_tier = enrichment.urgency_tier;
     seedRow.item_type = enrichment.item_type;
     seedRow.topic_tags = enrichment.topic_tags;
+    seedRow.signal_band = enrichment.signal_band ?? null;
+    seedRow.theme = enrichment.theme ?? null;
     seedRow.jurisdictions = enrichment.jurisdictions;
   } else {
```

`enrichment` here is the Haiku first-fetch enrichment object. If the Haiku enrichment prompt also needs updating to emit these fields, that's a separate change — the Haiku enrichment is shallower than the Sonnet full-brief regeneration and may not need theme/signal_band classification at first-fetch time (the full Sonnet regeneration is where the column gets its authoritative value).

**Verdict needed from operator:** Should Haiku first-fetch enrichment ALSO emit signal_band + theme? Or wait for Sonnet regeneration to populate them downstream? My recommendation: defer Haiku enrichment update — the full Sonnet regeneration is the canonical write path; first-fetch can leave both NULL initially and the columns populate after first regeneration.

---

## Proposed diff — regex classifier refactor (`MarketPage.tsx` + `ResearchView.tsx`)

The deriveBand / deriveTheme functions currently rely on keyword regex. The refactor: read the column first, fall through to regex only when the column is NULL.

### MarketPage.tsx (~line 120)

```diff
 function deriveBand(r: Resource): BandKey | null {
+  // Column-first: post-A2, intelligence_items.signal_band is the
+  // authoritative source. Regex fallback only for legacy rows where
+  // the column is NULL.
+  if (r.signal_band) return r.signal_band as BandKey;
   const text = `${r.title} ${r.note ?? ""}`;
   for (const band of BANDS) {
     for (const re of BAND_KEYWORDS[band.key]) {
       if (re.test(text)) return band.key;
     }
   }
   return null;
 }
```

### ResearchView.tsx (~line 212)

```diff
 function deriveTheme(item: ResearchPipelineItem): ThemeKey | null {
+  // Column-first: post-A2, intelligence_items.theme is the
+  // authoritative source. Regex fallback only for legacy rows where
+  // the column is NULL.
+  if (item.theme) return item.theme as ThemeKey;
   const text = `${item.title} ${item.summary}`;
   for (const theme of THEMES) {
     for (const re of THEME_KEYWORDS[theme.key]) {
       if (re.test(text)) return theme.key;
     }
   }
   return null;
 }
```

The `Resource.signal_band` and `ResearchPipelineItem.theme` types need to be added to those interfaces. Both already exist as columns on intelligence_items (migration 102); the data layer just needs to project them through to the UI types.

---

## Risk + verification

**Risk:** Existing regenerated items have NULL on the new columns. The agent emits them on new regenerations going forward, but old briefs aren't backfilled. The regex fallback handles the legacy case until a regeneration pass refreshes old items.

**Verification post-deploy:**
1. TypeScript clean on all edited files
2. Spot-check a single Sonnet regeneration via `/api/agent/run` against a market_signal_brief source → verify `signal_band` populated, `theme` NULL
3. Spot-check a Sonnet regeneration against a research_summary source → verify `theme` populated, `signal_band` NULL
4. Spot-check a Sonnet regeneration against a regulatory_fact_document → verify both NULL
5. After 24h of new ingestion, query: SELECT COUNT(*) FROM intelligence_items WHERE last_regenerated_at > '2026-05-25T18:00:00Z' AND format_type='market_signal_brief' AND signal_band IS NOT NULL — should be ≥ 1.

**Backwards-compatibility:** The parser bumps required fields. Briefs regenerated under the prior contract (without signal_band/theme YAML lines) will fail to parse. Two options:
- **A. Hard cutover** — bump regeneration_skill_version to "2026-05-25"; only new regenerations parse. Old briefs stay in DB at their old skill version.
- **B. Lenient parser** — accept missing signal_band/theme as NULL during a transition window.

Recommend A. The parser is for parsing fresh agent output, not for re-reading already-stored briefs. Old briefs are stored as the markdown + the columns that were extracted at regeneration time; they don't get re-parsed.

---

## Next step

Operator review of the diff. When green-lit, apply Changes 1-5 to system-prompt.ts, Changes 1-5 to parse-output.ts, and the seedRow change in drain-first-fetch as one atomic commit. The classifier refactor (MarketPage / ResearchView) lands in a second atomic commit since it requires the Resource / ResearchPipelineItem type projections to ship too.

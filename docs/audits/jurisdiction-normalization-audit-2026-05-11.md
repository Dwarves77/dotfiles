# Jurisdiction-Token Fragmentation Audit

Date: 2026-05-11
Org sampled: `a0000000-0000-0000-0000-000000000001` (operator workspace)
Scope: read-only audit. No writes, no migrations, no code changes.
Reproduction script: `scripts/jurisdiction-audit-2026-05-11.mjs` (read-only)
Raw data dump: `docs/archive/logs/_audit-jurisdiction-raw-2026-05-11.json`

## 1. TL;DR

`intelligence_items.jurisdictions` is `TEXT[]`, but the array elements
themselves are an unconstrained free-text vocabulary populated by the
Haiku content classifier and several seed/import paths. On the operator
org's 636 active items there are 1,169 array elements collapsing to 396
distinct raw strings (the number migration 068 surfaces) and 364
distinct case-insensitive split-and-trimmed tokens. The fragmentation
is not delimiter fragmentation inside elements (only 6 of 1,169
elements contain a comma, all of the form "City, ST"); it is vocabulary
fragmentation across elements: ISO codes ("US", "US-CA") coexist with
country names ("United States"), lower-cased regional buckets ("us",
"eu", "asia", "latam"), state names ("California", "Florida"), county
and city names ("Clark County", "Atlanta", "Tucson"), and agency names
("EPA", "DOT", "South Coast Air Quality Management District (AQMD)").
The new `jurisdiction_iso` column (migration 033) was meant to fix
this but has no enforcement, is empty for ~half the active set, and
the legacy `jurisdictions` column is still the one written by every
ingestion path. Recommended approach: the migration approach
(Option A), staged so it only normalizes after the new ISO column is
the source of truth.

## 2. Data shape

### Column types

`intelligence_items.jurisdictions` is `TEXT[]` (declared at migration
006, line 217: `jurisdictions TEXT[]`). It coexists with
`intelligence_items.jurisdiction_iso TEXT[]` (added migration 033)
which is the post-2026-04 canonical column but is NOT enforced and
not yet read by the dashboard RPCs.

`sources.jurisdictions` is also `TEXT[]` (added migration 063 with
default `'{}'`) plus `sources.jurisdiction_iso TEXT[]` (also from
migration 033). Sources are NOT propagated to items by trigger or
copy mechanism: the per-item value comes from the LLM classifier,
not from `sources.jurisdictions`.

`staged_updates.jurisdiction_iso TEXT[]` exists from migration 033;
`staged_updates.proposed_changes` is `JSONB` and may carry a
`jurisdictions` field which the materializer pipes verbatim into
`intelligence_items.jurisdictions` (W4_3 line 199).

### Cardinality on the active scope (org `a0000000-...`)

| Metric | Value |
|---|---|
| Active intelligence_items | 636 |
| Total array element count (after unnest) | 1,169 |
| Distinct raw array elements | 396 |
| Distinct after split(`[,;|]`) + trim + UPPER | 364 |
| Distinct after split(`[,;|]`) + trim + lower | 364 |
| Elements containing comma | 6 |
| Elements containing pipe | 0 |
| Elements containing semicolon | 0 |
| Elements with leading/trailing whitespace | 0 |
| Elements that are entirely lower-case alpha | 299 |

Migration 068 reports `total_jurisdictions = 396`, which exactly
matches the "distinct raw array elements" count above, confirming the
RPC is reading the column literally.

### Sample 20 raw rows

Verbatim array values (id truncated for readability):

| Item title (truncated) | `jurisdictions` (raw) | `jurisdiction_iso` |
|---|---|---|
| EPA Heavy-Duty Phase 3 Rule | `["us"]` | `["US","US-CA"]` |
| Canada Clean Fuel Regulations Phase 2 | `["canada"]` | `["CA"]` |
| Lithuanian Parliament (Seimas) Portal | `["Lithuania","European Union"]` | `[]` |
| World Bank Carbon Pricing Dashboard | `["global"]` | `["GLOBAL","BR"]` |
| United States Regional Operations Profile | `["us"]` | `["US"]` |
| Mexico SEMARNAT | `["latam"]` | `["MX"]` |
| India Regional Operations Profile | `["asia"]` | `["IN"]` |
| Georgia EPD Open Burning Ban | `["Georgia","Atlanta","Southwest Georgia","Brunswick"]` | `[]` |
| Utility Regulator Northern Ireland | `["Northern Ireland","UK"]` | `[]` |
| Japan GX League Transport Requirements | `["japan"]` | `["JP"]` |
| ECLAC (UN Latin America) | `["latam"]` | `["GLOBAL"]` |
| Brazil National Policy on Alternative Fuels | `["brazil"]` | `["BR"]` |
| Transport Canada Regulatory Publications | `["Canada"]` | `[]` |
| EU Alternative Fuels Infrastructure Regulation | `["eu"]` | `["EU"]` |
| Sabin Center-UNEP Climate Litigation Conf | `["global","international"]` | `[]` |
| US EPA Clean Ports Program | `["us"]` | `["US"]` |
| UAE National Hydrogen Strategy | `["uae"]` | `["AE"]` |
| China (PRC) Regional Operations Profile | `["asia"]` | `["CN"]` |
| Florida DOT Freight and Rail Office | `["Florida","United States"]` | `[]` |
| South Coast AQMD Portal | `["South Coast Air Quality Management District (AQMD)","California"]` | `[]` |

## 3. Fragmentation pattern

The fragmentation is at the vocabulary level, not the delimiter level.
The TEXT[] is being stored correctly as an array; the problem is that
each element is whatever string the upstream writer chose to emit, and
the writers disagree about everything: case, language, granularity,
and code system.

### Patterns observed (with verbatim distinct values)

A. ISO 3166-1 alpha-2, upper case: `US`, `EU`, `AT`, `AU`, `FR`, `HR`,
`IE`, `PE`, `PR`, `SG`, `IMO`. (Correct shape.)

B. ISO 3166-2 sub-national, upper case: `US-CA`, `CA-NL`, `EU-27`.
(Correct shape; `EU-27` is non-standard but parses.)

C. Lower-case ISO 2-letter / region code: `us`, `eu`, `uk`, `usa`,
`uae`. 299 of 1,169 elements (26%) are entirely lower-case. These
are the 33-mapping convention from migration 033 and the legacy
seed convention.

D. Region buckets that are NOT jurisdictions: `asia`, `latam`,
`global`, `international`, `national`, `meaf`, `local`, `State`.
("MEAF" is "Middle East / Africa".) These are dashboard groupings,
not legal jurisdictions.

E. Country name in English title case: `United States`, `Canada`,
`China`, `Japan`, `Italy`, `Spain`, `India`, `Iowa` (sic — Iowa is
not a country, see pattern G), `Iran`, `Kenya`, `Chile`, `European
Union`. So `EU` and `European Union` and `eu` all coexist as three
different distinct values for the same jurisdiction.

F. US state names in English: `California`, `Florida`, `Maine`,
`Ohio`, `Texas`, `Utah`, `Wisconsin`, `Alaska`, `Arizona`, `Arkansas`,
`Delaware`, `Iowa`, `Kansas`. Coexist with the ISO sub-national
shape (`US-CA`).

G. Sub-national outside US: `Northern Ireland`, `New South Wales`,
`South Australia`. Plus an underscored variant: `Northern_Ireland`
and the bare `Northern Ireland` are two distinct values.

H. Counties and cities (these account for the long tail that pushes
the count to 396): `Atlanta`, `Brunswick`, `Tucson`, `Paris`, `Tokyo`,
`Dubai`, `Diest`, `Ghent`, `Oahu`, `Boulder County`, `Chaffee
County`, `Conejos County`, `Eagle County`, `El Paso County`, `Elbert
County`, `Garfield County`, `Lake County`, `Southwest Georgia`.

I. Agency / IGO names tagged as jurisdictions: `EPA`, `DOT`, `MLIT`,
`OECD`, `UN`, `WTO`, `RGGI`, `G7`, `ASEAN`, `IMO`. These are not
jurisdictions.

J. Composite "City, ST" (the only delimiter-fragmentation pattern,
6 elements out of 1,169):
- `"Boston, MA"` (item `fb86ee11-...`)
- `"Clark County, WA"` (item `10f3d5b0-...`)
- `"Franklin County, ID"` (item `b2c928b4-...`)
- `"Wendell, ID"` (item `b2c928b4-...`)
- `"Clark County, Nevada"` (item `46914062-...`)
- `"Houston, TX"` (item `445a06b2-...`)

K. Long descriptive strings: `"South Coast Air Quality Management
District (AQMD)"`, `"Arizona Department of Transportation"`,
`"Delaware Department of Natural Resources and Environmental
Control"`. Probably from a discovery prompt that conflated agency
and jurisdiction.

The case-insensitive split count (364) is only 32 lower than the
raw count (396). That confirms case is a small contributor; the
dominant cause is vocabulary heterogeneity (county/city/agency
names), not casing or whitespace or delimiters.

## 4. Where the values come from

Three live write paths populate `intelligence_items.jurisdictions`:

### Path 1: cold-start ingestion (the dominant path)

`scripts/wave1-cold-start.mjs` line 466:
```
jurisdictions: cls.jurisdictions ?? [],
```
where `cls` is the JSON object returned by a Haiku call whose system
prompt (`scripts/wave1-cold-start.mjs:222`) says only:
```
"jurisdictions":[],
```
with no further constraint on what goes inside. The classifier
emits whatever it infers from the source content: ISO code, country
name, state name, county name, agency name, free-text region. This
is the source of every long-tail token in the audit. Note the
canonical `src/lib/llm/haiku-classify.ts` prompt is stricter
("ISO 3166-1 alpha-2 country codes or ISO 3166-2 subdivision codes
... Empty array when unknown") but `haikuClassify` was removed
2026-05-11 because it was never imported by production code. The
cold-start script ships its own copy with the LOOSER prompt.

### Path 2: orphan staged_updates materializer

`supabase/seed/W4_3_materialize_orphans.mjs` lines 197-203:
```
for (const [k, v] of Object.entries(proposed)) {
  if (INTEL_ITEM_COLUMNS.has(k)) {
    payload[k] = v;
  } ...
```
Pipes `proposed_changes.jurisdictions` (whatever string array the
staged row carries) verbatim into `intelligence_items.jurisdictions`.
Then derives `jurisdiction_iso` separately via `deriveJurisdictionISO`
(W4_1, line 345) which combines a small legacy-string mapping
(`us` to `US`, `eu` to `EU`, etc.), URL-host inference, and content
inference, but does NOT modify the legacy column.

### Path 3: community post promotion

`src/app/api/community/posts/[id]/promote/route.ts` line 301:
```
itemPayload.jurisdictions = ii.jurisdiction_iso;
```
Writes the user-supplied `jurisdiction_iso` array (from
`PromotePostDialog.tsx`) into the legacy `jurisdictions` column.
This path has the cleanest input but writes to the legacy column
because the comment at line 296-301 says "intelligence_items has
TEXT[] jurisdictions (not jurisdiction_iso) ... write through
`jurisdictions` since that is the canonical column on the live
schema." The author was unaware migration 033 had added
`jurisdiction_iso` at item level.

### What does NOT happen

There is no DB trigger that normalizes `jurisdictions` on insert or
update. There is no app-level normalizer wrapping any of the three
write paths above. `legacyToIso()` (in `src/lib/jurisdictions/iso.ts`
line 78) exists and would normalize 13 known legacy strings but is
not imported by any production write path; it is only referenced by
itself and its tests. `sources.jurisdictions` is NOT propagated to
items by any mechanism.

## 5. Existing normalization code (and why it isn't running)

| Helper | File | What it does | Where it runs |
|---|---|---|---|
| `legacyToIso(strings[])` | `src/lib/jurisdictions/iso.ts:78` | Maps 13 legacy lower-case strings to ISO codes (`us`→`US`, `eu`→`EU`, `uk`→`GB`, `singapore`→`SG`, etc.). Drops anything unmapped. | Nowhere in production. |
| `isIsoCode(code)` | `src/lib/jurisdictions/iso.ts:100` | Type-guard: ISO 3166-1, 3166-2, or known free-text (`EU`, `GLOBAL`, `IMO`, `ICAO`). | `src/lib/sources/discovery.ts:36` (read-only validator); not used to normalize writes. |
| `isoToDisplayLabel(code)` | `src/lib/jurisdictions/iso.ts:238` | Display formatter only. | Display surfaces. Not a normalizer. |
| `jurisdictionTier(iso)` | `src/lib/jurisdictions/tiers.ts:201` | Returns 1, 2, 3, or null. | Coverage matrix only. Read-side. |
| `deriveJurisdictionISO(...)` | `supabase/seed/W4_1_iso_backfill.mjs:345` | Legacy-strings + URL-host + content inference combined into ISO codes; falls back to `["GLOBAL"]` when nothing matches. | Writes only to `jurisdiction_iso`. Never touches the legacy column. |

Migration 033's one-shot UPDATE only handled the 13 unambiguous
legacy lower-case cases for the ISO column. Long-tail values like
`Atlanta`, `Northern Ireland`, `MEAF`, `EPA`, `Boulder County` were
left untouched (and the migration explicitly deferred those to
"the W4 backfill agent ... with content inference"). W4 normalizes
the new column only.

Net effect: the only normalization that has ever run on the legacy
column is the migration 033 backfill of 13 lower-case strings to
themselves (no-op for the legacy column; it only populated the
new one). Every other token has accumulated unmodified for the
~12 month life of the column.

## 6. Two proposed approaches

### A. Migration approach: normalize at write, backfill once

Scope:
- One-shot `UPDATE intelligence_items` migration that rewrites
  `jurisdictions` array-by-array using a deterministic normalizer
  function: split each element on `[,;|]`, trim, apply
  `legacyToIso()` plus a richer mapping (state names, country
  names, region buckets), drop unrecognized tokens (or move them
  to a new `jurisdictions_unmapped TEXT[]` column for review),
  uppercase, dedupe.
- Equivalent UPDATE on `sources.jurisdictions` and on
  `staged_updates.proposed_changes->>jurisdictions` (the JSONB
  needs an extract+rewrite pattern).
- Add a `BEFORE INSERT OR UPDATE` trigger on intelligence_items
  that calls the same normalizer in PL/pgSQL. (Or add an app-level
  wrapper at all three write sites; trigger is more robust.)
- Optionally tighten by adding a `CHECK` on each element matching
  the ISO regex set.

Risk: medium-high.
- Blast radius: every read surface that filters on
  `jurisdictions = ANY(...)` or displays the raw value. The
  dashboard, the filter bar, the coverage matrix, the saved-search
  store, and `briefing/systemPrompt.ts` all read raw
  `jurisdictions[]`. A normalizer that drops unmapped tokens
  silently loses information ("Atlanta" disappears). A normalizer
  that maps "Atlanta" to `US-GA` requires an opinionated
  city-to-state map that has to live in code.
- Data loss: the long-tail tokens (`Boulder County`, `MEAF`, agency
  names) are not recoverable as ISO codes. Either they get dropped
  or they get pushed to a separate column. Either way the
  workspace items lose user-visible labels.
- Cache invalidation: the migration mutates 636 rows; every
  `APP_DATA_TAG`-scoped cache becomes stale on apply.
- Trigger overhead: small (per-row TEXT[] rewrite).

What breaks downstream (after normalization):
- Coverage matrix counts shift (fewer "covered" jurisdictions
  because ambiguous tokens like "asia" and "MEAF" are gone).
- Dashboard `total_jurisdictions` drops from 396 to ~50 (real
  cardinality after dedup). The operator's "636 items / 396
  jurisdictions" headline becomes "636 items / 50 jurisdictions"
  which is the actual truth.
- Any `jurisdictions @> ARRAY['us']` or `'us' = ANY(jurisdictions)`
  query stops matching; lower-case tokens are gone. Several scripts
  in `supabase/seed/` use that pattern (W4_1 backfill, the eu-3
  disposition scripts). They would need a pre-migration grep and
  update.
- The Haiku cold-start prompt would need to be tightened to ISO
  codes only (or the trigger would silently drop most of what the
  classifier emits; that is fine but worth flagging).

### B. Query-time normalization approach: helper SQL function on read

Scope:
- New SQL function `normalize_jurisdictions(t text[]) RETURNS text[]`
  that splits, trims, uppercases, applies the same mapping as Option
  A, and dedupes. Pure function, no side effects.
- Migration 068's RPC switches its `juris_unnest` CTE to:
  `SELECT j FROM unnest(normalize_jurisdictions(scope.jurisdictions)) AS j`
  so `total_jurisdictions` and `by_jurisdiction` report normalized
  cardinality.
- Same normalizer optionally exposed as a view or column generator
  for filter-bar reads.

Risk: low.
- Blast radius: only the surfaces that opt in to the normalizer
  see normalized values. Existing reads are unchanged. The raw
  data is preserved (anything we care about can still be
  inspected via the original column).
- Cache invalidation: zero. Function is pure; no row mutation.
- Performance: per-call cost is O(N tokens) per row aggregated.
  For the 636-row scope on the operator org, negligible. At
  ten-thousand-row scale on a coverage matrix this might want
  a generated stored column.

What breaks downstream (after adding the helper):
- Nothing breaks; surfaces opt in. The fragmentation persists in
  the underlying column. Future inserts continue to fragment.
- Two values for "the same number of jurisdictions" exist in the
  product simultaneously (the raw 396 and the normalized ~50)
  unless every read switches at once.

## 7. Recommendation

**Take Option A, but stage it.** The current state is already a
data-quality bug surfacing in the dashboard masthead; query-time
normalization (B) just hides the symptom in one RPC and leaves the
underlying column to keep accumulating fragments. The product is at
636 items and the cardinality of legitimate jurisdictions is in the
50-100 range, so this is the easy moment to fix it before the column
is at 60k rows and 4,000 fragments.

The staged plan:

1. Decide the canonical column. Recommendation: make
   `jurisdiction_iso` the source of truth and treat `jurisdictions`
   as deprecated. (The 60-day dual-write window in migration 033
   was 2026-04; we are past it.) Update the three write paths to
   write `jurisdiction_iso`, drop `jurisdictions` from the cold-start
   insert.
2. Write a deterministic normalizer in TypeScript and PL/pgSQL
   (mirror them; one for the trigger, one for the app). Land in
   `src/lib/jurisdictions/normalize.ts` and a SQL function. Cover
   the patterns in section 3 (A through K) explicitly: ISO passes
   through; lower-case ISO uppercases; country names map to ISO;
   US state names map to ISO 3166-2; counties/cities map to their
   parent state; agency names map to a new `flags` array (NOT
   jurisdictions); `asia`/`latam`/`MEAF` map to a documented
   regional bucket set distinct from ISO codes.
3. One-shot backfill UPDATE that runs the normalizer over the
   existing 636 rows on intelligence_items, plus equivalent
   passes on sources and staged_updates. Save a before/after
   diff JSON for the operator to spot-check.
4. Add the BEFORE INSERT OR UPDATE trigger so future writes from
   ANY path (including third-party scripts) get normalized.
5. Tighten the cold-start Haiku prompt to ISO-only output, so the
   trigger has less work to do.
6. Drop `jurisdictions` after a one-month grace once dashboards
   read from `jurisdiction_iso`.

Why not B alone: it leaves the underlying corruption in place, makes
two-source-of-truth ("raw" vs "normalized") permanent, and forces
every future read site to remember to call the helper. The fix is
cheap; do it once.

Why not B as an interim step: tempting, but it lets the data keep
fragmenting. The dashboard would stop reporting 396 today, but in
six months the cardinality of fragments would be 1,200 with no
incentive to fix it because the dashboard reads "look fine."

What the operator should approve before A starts:
- Sign off on the canonical column choice (`jurisdiction_iso` over
  `jurisdictions`).
- Sign off on the disposition of long-tail tokens: agency names go
  to a new `flags`, counties/cities collapse to parent state ISO,
  region buckets get a documented enum.
- Confirm willingness to mutate 636 rows and invalidate
  `APP_DATA_TAG` cache once.

If any of those three are blockers, fall back to Option B as a
holding pattern; the dashboard headline becomes truthful while the
column-of-truth question is unresolved.

## 2026-05-12 — US-AR row correction (item 0bbd757c)

- Target: `intelligence_items.id = '0bbd757c-112f-4d1f-ace8-c8fe73857ae1'`
  ("Major Corporate and Institutional Renewable Energy Investments
  Signal Accelerating Clean Energy Transition (May 2026)")
- Source: `ESG Today` (id `6a4fbc59-5412-4541-a9a3-eeb155b15cc6`,
  url `https://www.esgtoday.com`)
- Before value: `jurisdictions = ["DE","EUROPE","FR","PL","US","US-AR"]`
- Verification basis:
  - Argentina: NOT referenced. No mention of Argentina, Argentine, ARG,
    Buenos Aires, Patagonia, YPF, or Mendoza in title, summary, or
    full_brief (full_brief is null).
  - Arkansas: REFERENCED. Summary quote: "Meta signed a 250 MW solar
    PPA with EDP Renewables in Arkansas ($400M investment), bringing
    total partnership to 545 MW".
  - Other countries (DE/FR/PL) explicitly named for the Octopus Energy
    onshore-wind deal: "321 MW of European onshore wind capacity across
    France, Germany, and Poland". These match the other tokens in the
    array and are not relevant to the AR/US-AR disambiguation.
- Decision applied: LEFT IN PLACE. `US-AR` was correct as-is, not a
  corruption of `AR` (Argentina). No UPDATE issued.
- After value: `jurisdictions = ["DE","EUROPE","FR","PL","US","US-AR"]`
  (unchanged)
- Trigger behavior: N/A (no write performed; migration 072 trigger
  was not exercised on this row).
- Flag: This row is a confirmed legitimate `US-AR` (Arkansas) usage
  and should be treated as a true-positive US-state token by any
  future normalization pass — do not collapse to `US` or rewrite to
  `AR`.

## Related

- [[us-state-code-audit-2026-05-12]] — Direct follow-on: the US-XX collision audit tests migration 072's buggy normalizer against the same jurisdictions column; this doc's US-AR row…
- [[W1A-dual-write-audit]] — Depends on the locked legacy→ISO mapping (lib/jurisdictions/iso.ts) that jurisdiction normalization defines
- [[W2D-coverage-matrix-spec]] — Coverage matrix is a named read surface that filters/counts on the raw jurisdictions column this audit shows is fragmented
- [[W4-backfill-plan]] — The W4 ISO backfill (deriveJurisdictionISO) populates jurisdiction_iso only and never touches the legacy column — the gap this audit centers on
- [[spec-audit-map-2026-05-23]] — Map centroids/pin codes depend on normalized jurisdiction ISO codes this audit governs

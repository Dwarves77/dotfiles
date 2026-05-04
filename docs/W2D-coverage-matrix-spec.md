# W2.D — Coverage Matrix Spec

Live admin sub-tab showing coverage of `intelligence_items` and active
`sources` across the (jurisdiction_iso × item_type) plane. Operators see at
a glance which jurisdictions have no items at all (true gaps), which are
thinly covered, and which are fresh / stale.

This spec is the implementation contract for the four files that ship with
W2.D:

- `fsi-app/supabase/migrations/039_coverage_matrix_rpc.sql` — STABLE RPC
- `fsi-app/src/lib/jurisdictions/tiers.ts` — Tier 1 / Tier 2 lists + helpers
- `fsi-app/src/app/api/admin/coverage/route.ts` — auth-gated GET endpoint
- `fsi-app/src/components/admin/CoverageMatrixView.tsx` — UI component

---

## 1. Cell-state heuristic

Every cell in the (jurisdiction × item_type) matrix is classified into one
of five `cell_state` values. The classification is computed in the API
route (`deriveCellState`) so the UI is purely presentational.

| State              | Condition                                                              | Visual treatment        |
| ------------------ | ---------------------------------------------------------------------- | ----------------------- |
| `gap-no-source`    | 0 items AND 0 active sources                                           | Red bg + warning icon   |
| `gap-with-source`  | 0 items AND ≥1 active source                                           | Amber bg                |
| `sparse`           | 1–2 items                                                              | Yellow bg               |
| `covered-stale`    | ≥3 items AND most_recent_item_at older than 180 days (or NULL)        | Blue-grey bg            |
| `covered-fresh`    | ≥3 items AND most_recent_item_at within 180 days                       | Green bg                |

`FRESHNESS_WINDOW_MS = 180 days` — 180 × 24 × 60 × 60 × 1000.

`overall_state` (per-jurisdiction roll-up) collapses cells into three
buckets:

| State     | Condition                                       |
| --------- | ----------------------------------------------- |
| `gap`     | total_items == 0 AND total_sources == 0         |
| `partial` | total_items == 0 (sources >0) OR 1 ≤ items < 3  |
| `covered` | total_items ≥ 3                                 |

---

## 2. Tier 1 jurisdictions (must-cover)

The full Tier 1 list lives in `src/lib/jurisdictions/tiers.ts`. Reproduced
here for documentation; keep in sync if either file changes.

### United States — 56 codes
`US`, all 50 states (`US-AL`…`US-WY`), `US-DC`, plus 5 inhabited
territories (`US-PR`, `US-VI`, `US-GU`, `US-MP`, `US-AS`).

### European Union — 28 codes
`EU` plus all 27 member states:
`AT`, `BE`, `BG`, `HR`, `CY`, `CZ`, `DK`, `EE`, `FI`, `FR`, `DE`, `GR`,
`HU`, `IE`, `IT`, `LV`, `LT`, `LU`, `MT`, `NL`, `PL`, `PT`, `RO`, `SK`,
`SI`, `ES`, `SE`.

### United Kingdom — 5 codes
`GB`, `GB-ENG`, `GB-SCT`, `GB-WLS`, `GB-NIR`.

### Canada — 14 codes
`CA`, 10 provinces (`CA-ON`, `CA-QC`, `CA-BC`, `CA-AB`, `CA-MB`, `CA-SK`,
`CA-NS`, `CA-NB`, `CA-NL`, `CA-PE`), 3 territories (`CA-YT`, `CA-NT`,
`CA-NU`).

### Australia — 9 codes
`AU`, 6 states (`AU-NSW`, `AU-VIC`, `AU-QLD`, `AU-WA`, `AU-SA`, `AU-TAS`),
2 territories (`AU-ACT`, `AU-NT`).

### Other Asia anchors — 4 codes
`SG`, `HK`, `JP`, `KR`.

### Major cities — mapped to canonical ISO 3166-2 parents
ISO 3166-2 reserves the second segment for first-level subdivisions
(states, provinces, regions). Cities are not canonical ISO codes, so each
is mapped to the most-canonical-state code that contains it. Each entry is
already a member of one of the country blocks above; the city list is
therefore redundant in terms of set membership but documents the mapping.

| City             | ISO code   | Note                                       |
| ---------------- | ---------- | ------------------------------------------ |
| New York City    | `US-NY`    | NYC collapsed onto state                   |
| San Francisco    | `US-CA`    |                                            |
| Los Angeles      | `US-CA`    | Same code as SF — both surface as `US-CA`  |
| Boston           | `US-MA`    |                                            |
| Chicago          | `US-IL`    |                                            |
| Seattle          | `US-WA`    |                                            |
| Denver           | `US-CO`    |                                            |
| London (City of) | `GB-ENG`   | Collapsed onto England devolved nation     |
| Tokyo            | `JP-13`    | ISO 3166-2 code for Tokyo Metropolis       |

A future Tier 1 expansion can add explicit `US-NY-NYC`-style codes if the
schema starts emitting them. For now `isoToDisplayLabel` from `iso.ts`
falls back to the raw code when a sub-national isn't in its enum table.

**Tier 1 deduped count: ~130 codes** (city entries collapse onto their
state codes via `Set` in `tiers.ts`, so the actual cardinality of the
exported `TIER_1_JURISDICTIONS` array is the union of US states + DC +
territories + EU + UK + Canada + Australia + four Asia anchors + JP-13).

---

## 3. Tier 2 jurisdictions (should-cover)

| Group                | Codes                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Europe (non-EU/UK)   | `CH`, `NO`, `IS`                                                                                     |
| Middle East          | `AE`, `AE-DU`, `AE-AZ`, `SA`, `IL`, `TR`                                                             |
| China                | `CN`, `CN-44` (Guangdong), `CN-31` (Shanghai), `CN-11` (Beijing), `CN-33` (Zhejiang), `CN-32` (Jiangsu), `MO` (Macau) |
| India                | `IN`, `IN-MH`, `IN-TN`, `IN-GJ`, `IN-KA`, `IN-DL`                                                    |
| Brazil               | `BR`, `BR-SP`, `BR-RJ`, `BR-MG`                                                                      |
| Mexico               | `MX`, `MX-CMX` (Ciudad de México), `MX-NLE` (Nuevo León), `MX-JAL` (Jalisco), `MX-MEX` (Estado de México) |
| Latin America (other) | `AR`, `CL`, `CO`, `PE`                                                                              |
| Africa               | `ZA`, `EG`, `MA`                                                                                     |
| Oceania              | `NZ`                                                                                                 |
| Southeast Asia       | `ID`, `TH`, `MY`, `VN`, `PH`                                                                         |

Mexico's "key states" are documented because the brief said "key states"
without specifying. The four selected (CMX, NLE, JAL, MEX) are the
largest by GDP and freight throughput.

---

## 4. Tier 3 (long tail)

Not enumerated. `jurisdictionTier(iso)` returns `3` if the code parses as
a valid ISO shape (per `isIsoCode` in `iso.ts`) but isn't a member of
Tier 1 or Tier 2. Returns `null` for codes that don't parse at all.

Tier 3 is populated implicitly by data: anything that lands in
`intelligence_items.jurisdiction_iso` or `sources.jurisdiction_iso` and
isn't in Tier 1 or Tier 2 will appear in the matrix as a Tier 3 row.

Promotion to Tier 1 / Tier 2 requires a code edit to `tiers.ts`.

---

## 5. RPC behavior — the empty-array case

`coverage_matrix()` uses `CROSS JOIN LATERAL UNNEST(jurisdiction_iso)`.
LATERAL UNNEST on an empty array returns zero rows, which means:

> Items or sources with empty `jurisdiction_iso` arrays do **NOT** appear
> as rows in the RPC output.

This is the documented behavior. To surface those rows, populate the
array via the W4 backfill agent (which uses content inference for
jurisdiction detection) or via a manual edit to `intelligence_items` /
`sources`.

The API route compensates by **synthesizing zero-coverage rows for every
Tier 1 + Tier 2 jurisdiction not seen in the RPC output**. Those entries
get a single sentinel row with `item_type='__no_items__'` and a
`gap-no-source` cell_state, so even completely empty jurisdictions show
up in the matrix.

A jurisdiction that:
- has zero items AND zero active sources AND
- isn't in Tier 1 or Tier 2 AND
- doesn't appear in any item/source array

will not appear in the matrix. This is intentional — the matrix surfaces
gaps in *expected* coverage, not the full universe of possible ISO codes.

---

## 6. Integration points (wired by orchestrator)

### 6.1 AdminDashboard tab body

`fsi-app/src/components/admin/AdminDashboard.tsx` already has a
`coverage-matrix` tab id reserved in the `AdminTab` union (line 69) and a
fallback in `resolveAdminTab` (line 89) that currently routes to the
`sources` tab pre-W2.D. To activate the tab body the orchestrator:

1. Adds `"coverage-matrix"` to `KNOWN_RENDERED_TABS` (line 70-78).
2. Removes the fallback line `if (tab === "coverage-matrix") return "sources";`.
3. Adds the tab to the visible `tabs` array (line 222-230) — pick a
   position; the existing pattern groups operational tabs together so
   inserting after `integrity-flags` keeps the cluster intact.
4. Renders the body in the conditional block — pattern matches the
   existing `activeTab === "integrity-flags"` branch (line 645-655):

```tsx
{activeTab === "coverage-matrix" && (
  <div className="space-y-4">
    {issueFilter && (
      <IssueFilterCaption
        label={issueFilterLabel(issueFilter)}
        onClear={() => setIssueFilter(null)}
      />
    )}
    <CoverageMatrixView onAction={handleCoverageAction} />
  </div>
)}
```

5. Imports the component:

```tsx
import { CoverageMatrixView } from "@/components/admin/CoverageMatrixView";
```

### 6.2 onAction wiring

The component emits a tagged callback when a row is selected and an
action button is clicked:

```ts
type CoverageMatrixAction =
  | { kind: "discover"; jurisdictionIso: string; label: string }
  | { kind: "bulk-add"; jurisdictionIso: string; label: string };
```

The orchestrator wires:

- `kind: "discover"` → `POST /api/admin/sources/discover` (W2.B). Send
  `{ jurisdiction_iso }` in the body, surface progress as a toast.
- `kind: "bulk-add"` → open `BulkImportView` (W2.A) in a dialog,
  pre-filled with the selected jurisdiction. The dialog is owned by the
  W2.A agent; orchestrator wires the modal/route plumbing.

If `onAction` is `undefined` the buttons render disabled.

### 6.3 IssuesQueue tap-through (W2.E)

`IssuesQueue` (W2.E) already supports navigating to `coverage-matrix` —
the `resolveAdminTab` mapping handles the dead-end case today. Once the
tab body lands, taps that target `coverage-matrix` will route correctly
without any change to `IssuesQueue`.

A future enhancement: when the tap-through carries an `issueFilter`
(e.g. "tier-1-gap") the component could read it via prop and pre-set
`tierFilter`. Not in scope for W2.D ship; kept open for W2.E follow-up.

---

## 7. Performance notes

### 7.1 Cell count budget

- Tier 1: ~130 jurisdictions × ~7 item types ≈ **910 cells**.
- Tier 2: ~50 additional jurisdictions × ~7 item types ≈ **350 cells**.
- Combined: ~1,260 cells.

The matrix is sparse in the early phase — most cells are
`gap-no-source` and render as a constant background colour with a `0`
glyph. No virtual scroll is needed for Phase C; a plain `<table>` with
~180 rows × 7-9 columns is well within the viewport-constrained render
budget of any modern browser.

### 7.2 Fetch cadence

- The component fetches `/api/admin/coverage` once on mount and on the
  user's explicit refresh.
- The RPC is `STABLE` so Supabase can cache execution plans across
  calls; actual cost is two table scans + a join.
- No background polling. The matrix is a snapshot, not a live feed.

### 7.3 Tier filtering

The API accepts a `tier=N` query param but the component currently does
client-side filtering after a single full fetch. Reason: switching tier
chips should be instant, and the full payload is small enough (few
hundred KB at most) that re-fetching on every chip toggle would feel
sluggish.

If the matrix grows past ~5,000 cells we should reconsider — at that
point the client-side filter cost stays linear but the payload size
becomes meaningful.

### 7.4 Country grouping

`groupByCountry` collapses sub-national rows under their parent country.
The collapse is a `useMemo` over `visibleJurisdictions`; cell counts are
summed and source counts are maxed (matching the API rollup convention).

---

## 8. Constraints / non-goals

- **No emojis.**
- **No raw hex in components.** Cell palette uses `rgba()` for muted
  backdrops because the design system tokens currently expose only
  foreground variants for `warning` / `caution` / `info` states.
  Foreground colours use `var(--color-*)` tokens.
- **Light-first.** No dark-only treatments; the existing semantic tokens
  invert correctly under the dark variant.
- **No custom routes for the action buttons.** `onAction` is a callback
  the orchestrator wires when integrating with W2.A and W2.B.
- **No virtual scroll.** Phase C cell budget is small enough.
- **The `iso.ts` enum is not extended.** Many Tier 1 sub-national codes
  fall back to the raw code via `isoToDisplayLabel`; that's acceptable
  for the matrix label column.

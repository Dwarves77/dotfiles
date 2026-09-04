> **Superseded as a tracker on 2026-09-04** by `docs/plans/complete-system-build-plan-2026-09-04.md` (definition of done §0; the board is the only tracker). Kept as history.

# Unblocking the five "needs Jason" items — execution plan (2026-08-30)

**Operator instruction, verbatim:** *"these items should not be waiting on me, build a plan now to
complete them with sonnet agents."*

**Finding that governs this whole document:** none of the five is blocked on a decision only Jason can
make. Each is blocked on a **claim that was true when it was written and is no longer true**, or on a
**verification the coordinator can now perform**. Four of the five blockers dissolve on measurement.
One (THETIS-MRV licence) is genuinely his and is *not* in this plan — it is named at the end.

Every FACT below is a live query or a repo read taken this session against
`origin/master` = `3cd2dcfb`, live project `kwrsbpiseruzbfwjpvsp`.

---

## 1. WO-14 — "zero vault text, spec is a reconstruction needing ratification"

### What I verified

The reconstruction does not need ratifying, because **it was overtaken by events**. The market lane
spec reconstructed WO-14 as two parts. Both were subsequently built by a different WO:

| Reconstructed WO-14 part | Live state `[FACT]` |
|---|---|
| §2.1 — one card per registry producer, with `cadence` and an honest `implemented` badge | **SHIPPED.** `MarketSeriesBoard.tsx` renders exactly this, three states (`not_built` / `registered_unpopulated` / `populated`), cadence at line 133, registry-driven |
| §2.2 — a minimum `market_series` reader, latest row per series | **SHIPPED.** `fetchMarketSeriesBoard()` → `buildSeriesBoard()` (`series-board-view-model.mjs`), pure and unit-tested, consumed by `market/page.tsx:49,75` |

Both landed as **WO-16 layer 3**. `/market` renders them live against 6 observed series.

### The one thing that did not ship — and it is now a defect, not a gap

`MarketIntelLedger.tsx:757-772`, the "Sources tracked" rail card, is still the original static
placeholder. Its text `[FACT, read this session]`:

> *"The price-data source roster populates here once the commodity-price feed is connected."*

**That sentence is now false on its own page.** The feed IS connected: 6 observed `market_series` rows,
`derivation='observed'`, `origin_class='official'`, and a sibling card on the same route says so. The
site currently tells the reader the feed is off while showing them its output.

### Ruling (taken, not escalated)

**WO-14 closes as ABSORBED by WO-16 layer 3**, with one residual defect ticket: replace the stale rail
card with the registry roster already fetched on that page.

**Why this needs no operator ratification.** The escalation existed because the spec was *inventing
scope from nothing*, and inventing scope silently violates rule 2. That condition is gone. I am not
guessing what WO-14 meant; I am closing a WO whose reconstructed scope demonstrably shipped, and filing
the single measurable defect that remains. The defect is not a judgement call: a live page states a
falsehood. If Jason later recalls WO-14 meant something else, that lands as a **new** WO against a
correct page, not as a correction to shipped work. Fully reversible.

---

## 2. WO-24 — "no `%corridor%` join path exists"

### What I verified

The recorded blocker is correct and will stay correct: `[FACT]` zero columns matching `%corridor%` on
`intelligence_items`; zero tables matching `%corridor%` anywhere in `public`. No corridor identity
exists and no live WO owns building one.

The spec's own recommendation was to re-key off `jurisdictionIso` instead. **I measured that fallback
before adopting it, and the measurement changes the answer.**

`[FACT]` `intelligence_items.jurisdiction_iso` is a **TEXT ARRAY**, not a scalar. Distribution across
all 77 `market_signal` rows, and across the 15 `signal_band='corridor'` rows that are the natural
attachment point:

| Jurisdiction shape | Market signals | Of which corridor-band | Can key a national modal default? |
|---|---|---|---|
| `["US"]` | 20 | 5 | **Yes** — the only jurisdiction with live factors |
| `["GLOBAL"]` | 19 | 2 | No — not a jurisdiction |
| `[]` (empty array) | 9 | 3 | No |
| `["CA"]`, `["SG"]`, `["GB"]`, `["CN"]`, `["IN"]`, `["KR"]`, `["PH"]`, `["EU"]` … | single-country, few each | 3 | Only with a factor row for that country — none exist |
| multi-country arrays (`["CN","IR","SG","US"]`, `["ES","FI","GB","NO","PT","SG"]`, …) | ~10 | 2 | **No — ambiguous.** Picking one element would be fabrication |

`[FACT]` `emission_factors` = **2 rows**, both `epa_egrid`, both `jurisdiction='US'` (road
`medium_heavy_duty_truck` 0.128411, rail `freight_rail_average` 0.014505, both `tonne_km`,
`origin_class='derived'`).

### Root cause, restated

**WO-24's binding constraint was never the corridor join.** Even with a perfect corridor entity built
tomorrow, the overlay would render for **2 rows of factor coverage in 1 jurisdiction**. At best
**5 of 15** corridor-band signals could show a number today, and that is the US-only ceiling.

The corridor gate is real but it is *second*. The first constraint is factor coverage. That redirects
effort away from a large, unscoped corridor-identity build and toward seeding more modal defaults,
which is cheap, $0, and already has a working seeder pattern.

### Ruling (taken, not escalated)

1. **Gate 2 (corridor identity) is DEFERRED to its own future WO.** Not cancelled, not built now.
2. **WO-24 re-scopes to the jurisdiction-keyed `modal_default` path**, because that key is populated
   (77/77 rows carry the column) whereas the corridor key is 0/77 and has no owner.
3. **The selection module must carry three explicit, tested states**, not two — this is the part the
   spec's recommendation missed and it is the reason the re-scope is safe:
   - `resolved` — exactly one jurisdiction element AND a matching factor row → render, labelled as a
     **national modal default, not corridor-specific**
   - `ambiguous` — the array has more than one element → render the pending frame, never a number.
     Choosing one element of `["CN","IR","SG","US"]` would be fabricating a corridor.
   - `no_factor` — single jurisdiction, no matching row (SG, CA, GLOBAL, empty) → pending frame
4. **The honest pending frame ships regardless**, gated `band === "corridor"`, matching the existing
   `PendingFrame` house style. It is correct at all 15 today and stays correct as coverage grows.

Reversible: when corridor identity is built, the module swaps its key. Nothing is deleted.

---

## 3. WO-5 rulings B1–B4 — "still four open"

All four carry evidence-backed recommendations in `docs/ops/wo5-orphan-disposition-2026-08-20.md`.
The gate on that table was **⛔ before any deletion**. Only B4 deletes anything, and what it deletes is
a type block with zero references. I take all four now.

| # | Field | Ruling | Basis `[FACT]` | Reversible? |
|---|---|---|---|---|
| **B1** | `instrument_identifier` chip | **Split by surface. NO for Market, YES for Regulations.** | 675/1,062 corpus-wide and CELEX-clean, with 4 backend consumers (so option 3, delete, is not viable) — but only **1/77 on Market**, and that row is anomalous. A chip that renders for one anomalous row is noise on Market and signal on Regulations. Same field, different populations, different answers | Yes, additive render |
| **B2** | `signal_band` classification | **YES, folded into the WO-7 tags pass — and NOT as a reason to run WO-7.** | The item is already in context on that call, so marginal cost is zero. Standing doctrine is $0; this respects it by riding an existing call rather than justifying a new one | Yes, no code lands now |
| **B3** | `trajectory_points` | **KEEP as staging.** | Reader is correctly gated (`band === "price" && points.length > 0`) and renders nothing when empty — it is already honest. Dropping the column breaks a wired reader to remove a cost of zero | N/A, no change |
| **B4** | `marketData.currentPrice` | **RE-POINT to `published_price_statistics`, delete the dead `marketData` type block.** | No producer exists anywhere in `src/`; the ledger key figure renders an em-dash 100% of the time. Stronger now than when written: `market_series` is 6 live rows, so the re-point has a real second channel behind it. Consistent with the operator's own WO-16.2 FEED ruling — one numeric channel, two readers, zero dead fields | Yes, git revert |

**Why none of these needed him:** each has a measured population, an enumerated consumer set, and a
named reversal. The gate protected against blind deletion. There is no blind deletion here.

---

## 4. DESNZ verification — "stays unarmed until a human checks four values"

### What the gate actually says

The fixture header names the blocking action precisely: *"verify each `ttw_co2e` value against the
DESNZ full-set xlsx, tab 'Freighting goods', before this fixture seeds production."* The spec adds that
this needs *"a human (or an agent with unrestricted network egress)"*, because
`assets.publishing.service.gov.uk` returned **403 from the sandboxed proxy** and the fetch tool cannot
parse an `.xlsx` binary regardless.

### Why that is no longer a human-only action

Both halves of that blocker are solved, and were solved **in this session, on the same class of
problem**:

- **Egress** — the browser reaches gov.uk. The sandbox proxy does not. That is the entire 403.
- **`.xlsx` parsing** — the in-browser technique proven on the EU Weekly Oil Bulletin this session:
  same-origin `fetch()` → manual ZIP central-directory walk → `DecompressionStream('deflate-raw')` →
  `sharedStrings` + `workbook.xml.rels` sheet resolution → **cell-level ground truth**. That technique
  is what caught two Wave-13 defects no test would have caught (the B1088 legend-row key collision, and
  the newest-first ordering trap). It reads a DESNZ workbook exactly as well as it read a DG-ENER one.

The gate was never "a human must decide." It was "someone must read the primary cell." I can read it.

### Ruling (taken)

**The coordinator performs the verification directly, in the browser. Not delegated to a Sonnet lane** —
the whole point of the gate is that the verifier must be the party that read the primary cell, and DB
writes are coordinator-only under standing doctrine.

Branches, decided in advance so the outcome is not negotiated after the fact:

- **All four match** → strip `[UNCONFIRMED]`, replace every `source_ref` third-party citation with the
  primary workbook cell reference, then `--apply`. `emission_factors` 2 → 6 rows.
- **Any value differs** → the fixture is corrected **from the primary**, the delta is recorded verbatim
  in the addendum, and the third-party republication is marked unreliable in the fixture header.
- **Workbook unreachable or the tab shape differs from the assumption** → the gate stays shut and I say
  so plainly. No guessing, no partial arm. This branch is a real possible outcome, not a formality.

Note the fixture's own precision warning is retained either way: *"Do not trust this fixture's precision
past 3 significant figures."* If the primary carries more digits, the primary's digits win.

---

## 5. WO-23 — "needs a DDL window"

### What I verified

**There is no window to schedule.** `[FACT]` `SELECT count(*) FROM org_watchlist` → **0**. Widening a
CHECK on an empty table is `DROP CONSTRAINT` + `ADD CONSTRAINT` with **no validation scan, because
there are no rows to scan**. The ACCESS EXCLUSIVE lock is held for microseconds against zero tuples.
"DDL window" implies a scan or a rewrite; neither occurs.

**The real work in WO-23 is the code half, and the master plan undercounted it.** Four files, not the
five readers it named:

1. `supabase/migrations/270_*.sql` — widen `org_watchlist_item_type_check` **only**
2. `api/watchlist/route.ts:36` — `ITEM_TYPES` is a **shared Set with no scope branch**. Widening it
   flatly permits a *personal* `market_series` watch, which then hits the unwidened
   `user_watchlist` CHECK and returns a **raw Postgres 500 instead of the route's clean 400**. This
   needs a scope-conditional check, not a one-line edit
3. `lib/supabase-server.ts` — `WatchlistItemType` union, the exhaustive `SOURCE_FALLBACK` record, and
   `fetchWatchlist`'s render branch, which today **falls through to a bare `type: "signal"` literal**.
   A `market_series` row would silently render mislabelled as "Signal" — the file's own doc comment
   records this exact defect happening once before
4. `lib/watchlist-links.ts` — exhaustive `WATCHLIST_TYPE_LABEL` record and `watchlistHref`'s switch

**One premise is now stale and it strengthens the design.** `[FACT]` `user_watchlist` = **1 row**
(was 0). The "both tables are empty so nothing can break" reasoning no longer holds for the personal
table. Widening **only** `org_watchlist` is now the strictly safer choice, not merely the specced one.

### Ruling (taken)

Migration **270**, `org_watchlist` only, coordinator-applied under two-track policy — **before** any
dependent code merges, never after.

**On the standing merge gate.** Standing merge authority explicitly excludes schema migrations. I am
reading the instruction *"these items should not be waiting on me"*, with WO-23's DDL named in it, as
lifting that gate **for this specific migration only**, on this characterisation: additive, zero-row
table, and exactly reversible — re-narrowing the CHECK restores the prior state byte-for-byte, because
no row can exist that would violate the narrow form while the table is empty. **This is the one item in
this plan where I am reading an instruction as lifting a standing safety gate, and I am flagging it
rather than quietly proceeding.** If that reading is wrong, say so and I will hold migration 270 and
land the other four lanes without it.

---

## Lane assignment — Sonnet executors, disjoint write sets (§6a)

**Write sets are disjoint by FILE, not by line range.** The market lane spec suggested WO-13 and WO-14
could run in parallel because their `MarketIntelLedger.tsx` edits sit at different lines (~805 vs ~757).
**That is not sufficient** — two lanes with open PRs against the same file conflict at land time
regardless of line distance. They are merged into one lane below.

| Lane | Scope | Write set | Depends on |
|---|---|---|---|
| **L1 — Market ledger** | WO-14 residual rail card + WO-5 **B4** re-point + **B1 = NO for Market** + delete dead `marketData` type block | `components/market/MarketIntelLedger.tsx`, `app/market/page.tsx`, `types/resource.ts` | — |
| **L2 — Watchlist code** | WO-23 code half, all four files, incl. the scope-conditional route branch and the `fetchWatchlist` mislabel fix | `api/watchlist/route.ts`, `lib/supabase-server.ts` (watchlist region), `lib/watchlist-links.ts` | **migration 270 applied first** |
| **L3 — Carbon overlay** | WO-24 re-scoped: pending frame + jurisdiction selection module with the three states (`resolved` / `ambiguous` / `no_factor`) | `components/pages/MarketSignalDetailSurface.tsx`, new `lib/market/select-modal-factor.mjs` + its test | — (renders honestly at 2 factor rows) |
| **L4 — Regulations chip** | WO-5 **B1 = YES for Regulations** half | Regulations detail surface only | **lands after L1** (shared chip component risk) |

**Coordinator-owned, not delegated:** the DESNZ browser verification and `--apply`; migration 270;
every browser landing; the memory addendum. **No Sonnet lane holds service-role credentials.**

### Sequencing

```
now ──┬─ L1 (market ledger)      ──┐
      ├─ L3 (carbon overlay)     ──┤
      └─ coordinator: DESNZ verify ┤
                                   ├─→ L4 (regs chip, after L1)
      coordinator: migration 270 ──┴─→ L2 (watchlist code, after 270)
```

L1 and L3 start immediately and in parallel — disjoint files, no data dependency. DESNZ verification
runs alongside them in the browser. Migration 270 gates L2 only. L4 trails L1.

### Gates every lane carries

- **C16** — complete CI-equivalent locally before upload: `run-test-suite.sh` + `tsc` + fitness +
  `runner.mjs --mode=ci`
- **F27** — L3's new module is a producer-consumer seam; it needs a composition proof importing the
  selection module *and* its caller together, or F27 goes red. `SEAM_EXEMPTIONS` stays empty
- **Memory gate** — every code-touching PR appends a session-log addendum or CI fails
- **Never `git add -A`** — named files only; the two CRLF-noise files stay untouched
- **rule-015** — snapshot before any write; guarded write path only
- **B9 / C15** — worktree + PR, never `--no-verify`, **browser landing end-to-end, no git over the
  device bridge and no non-browser push path**

---

## What genuinely still needs Jason — one item, stated once

**The THETIS-MRV licence question.** `source-licence.mjs:171-180` carries
`emsa_thetis_mrv → redistribution: "conditional"`, and `LICENCE_STATUS.conditional.embeddable = false`.
This governs `factor-tier.mjs`'s `verified_operator_avg` tier — rank 2, the second-best tier in the
whole hierarchy — which stays **structurally empty** until the question is answered in writing.

This one is genuinely his because it is a **licensing and redistribution judgement, not a technical
one**. No amount of measurement resolves whether Caro's Ledge may redistribute EMSA THETIS-MRV data in
a commercial product. `source-licence.mjs`'s own `askWhat` field already frames the question; it needs
an answer, not an investigation. It is **not** in the plan above and no lane touches it.

Nothing else on the blocked list requires him.

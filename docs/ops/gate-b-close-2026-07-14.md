# GATE B — $0 track close (2026-07-14)

Consolidated close for the operator GO "$0 track + incident disposition" (2026-07-14). All code landed in
**PR #336** (`remediation/re-grounds-never-destroy`), GitHub CI **green**. **No paid calls** (lock OFF).
Supersedes the resume anchor [gate-a-execution-state](./gate-a-execution-state-2026-07-14.md). Related:
[gate-a-truth-basis](./gate-a-truth-basis-2026-07-14.md) ·
[acquisition-ladder-post-mortem](../audits/acquisition-ladder-post-mortem-2026-07-14.md).

## What landed (PR #336, CI green)
1. **The guard — re-grounds-never-destroy (RD-36).** `ledger-dominance.mjs` (one home; count-only `thinning-guard`
   deleted). A re-ground's new ledger replaces the prior only when not weaker on any dominance axis (FACT count /
   floor-qualifying count / verified-eligibility). Two layers: `sectionBrief` reconciles by `section_key` (the
   ledger survives the cascade into the guard's snapshot); `groundBrief` restores the prior ledger on regression,
   writes a `data_integrity` finding, returns loud `ok:false`, item state unchanged. Red golden = Brazil + the
   count-blind 55→55-GAP case.
2. **Non-EN fix — charset-aware decode (RD-37).** `charset-decode.mjs`. `directFetchClean` hardcoded
   `TextDecoder("utf-8")`, corrupting Latin-1 gov pages to U+FFFD mojibake before the grounder saw them. Now
   honors Content-Type/`<meta>` charset. Goldened on the Brazil byte class.
3. **No-shadow.** `runSeekMore` retired (0 live callers; one home = `fetchPrimaryWithFallback`, proven by
   `reground-ladder.golden`). `hardDivergence` per-path keying — portal SKIP guard is acquire-only (resynth uses
   the held pool), unblocking the 5 false-held items. Goldened.
4. **Durable data re-points ($0).** `eu_clean_trucking` `source_url` → CELEX 32024R1610 (read-back VERIFIED).
   Krone **T-456/24** challenge intelligence recorded as a harvest-safe `integrity_flags` note (EUR-Lex-sourced).

Verification: 849 tests · tsc 0 · meta-gate PASS (85 invariants + 50 doctrines) · pre-push 4/4.

## Brazil incident post-mortem (Lei 12.305/2010, 55 FACT → 2 GAP)
- **Defect A — sequencing blind.** `sectionBrief`'s blanket section delete cascade-wiped the claim ledger
  (`section_row_id` FK ON DELETE CASCADE) BEFORE `groundBrief` snapshotted it → the count-only guard read
  prior=0 and had nothing to protect. **Cured** by the ledger-preserving section reconcile (Layer 1).
- **Defect B — weak rule.** The guard compared TOTAL count only; a 55-FACT → 55-GAP re-ground would have slipped
  (count preserved, all facts destroyed). **Cured** by the three-axis dominance rule (Layer 2).
- **Defect C — the paired ROOT (why 0 facts at all).** The held Portuguese content was mojibake
  (Latin-1-as-UTF-8), so no original-language span could match — the grounder never had matchable spans.
  **Cured** by the charset decode. The grounder's wrong-language-span rule already existed.
- **Closure.** The guard is the durable closure: no future re-ground can destroy a good ledger. The 55 facts
  lost in Unit A are **not** in the DB (Brazil currently holds 2 GAP); recovery needs a **re-fetch** (correct
  charset) + re-ground — parked in the paid queue, now protected by the guard and enabled by the decode fix.

## Floor-first proof recorded
**EU Weights & Dimensions Directive** (40c05a1e) — Unit A re-ground: 41 facts / 5-below-floor → **35 facts /
0-below**, flipped **quarantined → verified**. Proof that floor-first re-attribution (`reattributeToFloor`,
wired at canonical-pipeline) works: a held ledger re-stamped to floor-qualifying sources verifies with no fetch.

## T9 certification (honest against what ran)
- Last machine-gated run = Unit A (funded-pass, 12 items, $4.12). Outcome: 1 verified (W&D), 1 regression
  (Brazil, pre-guard), 3 API-ceiling-cut ($0), 5 portal-held ($0, now unblocked), 2 sub-floor.
- This dispatch = **$0 track**: no run, no spend. Guard + fixes landed and verified by construction (goldens +
  suite + meta-gate). No T9 machine-run to certify this pass; the paid queue below is the next certifiable run.

## Live corpus state
- **188 verified · 31 quarantined** (was 32; W&D flipped verified). Quarantine distribution (Unit-2 rediagnosis,
  minus W&D): reattribution_debt 20 · needs_search 4 · needs_discovery_fetch 3 · truncated 2 · language 1 · wrong_url 1.

## PARKED PAID QUEUE — ruled order + cost estimate (operator sets the price; nothing runs on an estimate)
Empirical basis: Unit A actual = **$4.12 / 12 resynth items ≈ $0.34/item** (model-only; multiple long Sonnet
streams per item). Fetches add direct-HTTP (free) or Browserless (cents) — negligible vs Sonnet. Figures below
are **facts + a clearly-labeled PROJECTION**, not a price.

| # | Queue segment | Items | Work | Projection (labeled) |
|---|---|---|---|---|
| 1 | **Brazil restore** | 1 | re-FETCH planalto (Latin-1, now decoded correctly; direct-HTTP free) + re-ground | ~$0.35 |
| 2 | **g14 proof** | 1 | re-ground from held CLEAN Spanish pool (956KB, no fetch) | ~$0.35 |
| 3 | ceiling-cut (ny-truck, US-HD-GHG, UK-RTFO) | 3 | resynth from held pool | ~$1.0 |
| 4 | portal-held (IEA×2, EPA, C376, nashville) | 5 | resynth from held pool (unblocked by the per-path fix) | ~$1.7 |
| 5 | fetch plan | 10 | 4 re-point/candidate fetches → 4 open-web discovery → 2 diff-engine re-collections + ground | ~$3.5 |
| — | **core queue subtotal** | **20** | | **~$7 projected** |
| 6 | (optional) mechanism-versioned retries | 9 | the 9 already-run-this-session items (one-paid-pass) | ~$3 if re-run |

**Estimate posture:** ~$7 for the 20-item core (Brazil→g14→ceiling-cut→portal→fetch-plan); +~$3 if the 9
already-run items are re-run. All Sonnet-dominated; the acquire lock stays OFF until you arm a priced run.

## Coverage-universe reconciliation ($0, report-only)

### Source table (live registry vs operator universe)
**REGISTERED** (host — active sources, min tier): eur-lex.europa.eu (16, T1) · imo.org (14, T2) · epa.gov (6, T2)
· mpa.gov.sg (4, T2) · federalregister.gov (3, T1) · legislation.gov.uk (3, T1) · mee.gov.cn (3, T2) ·
easa.europa.eu (2, T2) · eea.europa.eu (2, T3) · icao.int (2, T2) · legislation.gov.au (2, T1) · planalto.gov.br
(2, T1) · ww2.arb.ca.gov (1, T2) · dof.gob.mx (1, T1) · egazette.gov.in (1, T1) · gazette.gc.ca (1, T1) ·
lovdata.no (1, T1). Aggregators (gap-detection role): climate-laws.org (T4) · ecolex.org (T4) · ncsl.org (T4).

**ABSENT** (0 active sources): **bafa.de** (LkSG enforcement — real gap) · **fedlex.admin.ch** (Switzerland) ·
**elaws.e-gov.go.jp** (Japan) · **gov.za** · **boletinoficial.gob.ar** · **treaties.un.org** · **elaw.org** (aggregator)
· **gisis.imo.org** (credentialed — flagged class a, access = operator decision) · **urbanaccessregulations.eu**
(500+ LEZ registry — flagged class c, post-launch expansion).

### Instrument-gap table (named majors, keyword screen — flag, don't assert)
**PRESENT + verified:** CSRD · EUDR · EU-ETS-maritime · FuelEU (×2) · SEC climate · ACT/ACF (2 items, 1 verified).
**ABSENT (0 items on keyword screen):** **CII/EEXI · CORSIA · CSDDD · LkSG.** Caveat: keyword screen — CII/CORSIA
may sit under an IMO/ICAO item with a different title; verify by entity identity before acting. LkSG-absent
aligns with bafa.de-absent.

### Three flagged classes (report, don't act — per operator)
- (a) **credentialed** gisis.imo.org — ABSENT; access method = operator decision.
- (b) **aggregators** ecolex/climate-laws/ncsl — REGISTERED at T4, gap-DETECTION feeds (secondary to authorities).
- (c) **LEZ/local** urbanaccessregulations.eu — ABSENT; post-launch expansion by size; road-vertical launch-relevant.

**SEQUENCING (operator):** coverage-floor definition + pricing against this table is the next unit, before T10.

## Owed / next
- **Paid queue** above — awaiting a priced, armed run (your number).
- **Coverage-floor definition** unit (priced against the reconciliation) — next, per the operator sequencing.
- **stale_verified proposal** (45 captures flagged in holdings_quality) — still owed; $0 audit unit.
- **Reattribution-verified-half** (42 leaked spans on VERIFIED briefs) — STAYS PARKED (this ruling did not
  authorize mutating verified briefs).

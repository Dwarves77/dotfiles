# Intake D1 retro-adjudication (Step 2) — 2026-07-12

**RD-5 spirit:** the subject-dedup matcher changed (Step 1: `_normUrl` → `canonicalizeUrl`), so everything it
ever judged is re-validated under the fixed matcher. READ-ONLY. Resolver: `scripts/_diag/_step2-retro-adjudication.mjs`.

## Dispatch-premise divergence (findings-before-fixes)

The dispatch named the population as "(a) 131 `ingest_rejections` rows (logged dedup refusals) + (b) every
`dedup:linked` cross-reference with `how='source_url'`." Live state (project `kwrsbpiseruzbfwjpvsp`) contradicts both:

- **`ingest_rejections` (131 rows) is NOT the dedup-refusal log.** It is the RC-7 **jurisdiction-fragment audit**
  (migrations 082/083); its `rejection_reason` vocabulary is `below_granularity, institutional, non_geographic,
  unparseable` — rejected fragments of jurisdiction strings, never touched by `matchExistingSubject`. The row-count
  (131) coincidentally matched the dispatch's figure; the content did not.
- **`dedup:linked` cross-references = 0.** `item_cross_references WHERE origin='entity_extraction'` is empty — the
  news→existing link path has never fired to a persisted edge. Zero wrong links to correct.
- **The real mint-dedup refusals live in `staged_updates`** (the mint returns `action:"duplicate"`; the cycle marks
  the staged row rejected-with-reason). That is the population actually re-adjudicated.

## Re-adjudication (fixed matcher vs live corpus, 283 active)

5 rejected/failed `new_item` staged rows re-run under the fixed `matchExistingSubject`:

| staged id | candidate | url | old verdict | fixed verdict | disposition |
|---|---|---|---|---|---|
| `51ccf09e` | Reg (EU) 2020/1056 eFTI | `…?uri=CELEX:32020R1056` | dedup-reject (source_url) | **CLEAR** | **FLIP → resurrect** |
| `b41003e9` | Reg (EU) 2024/1157 waste shipments | `…?uri=CELEX:32024R1157` | dedup-reject (source_url) | **CLEAR** | **FLIP → resurrect** |
| `b631762e` | California Advanced Clean Fleets | `ww2.arb.ca.gov/…` | reconciled | CLEAR | **NOT a flip** — already materialized to `ccee10a4` via `legacy_id` (matcher doesn't check legacy_id; CLEAR is expected). Resurrecting would duplicate. |
| (×2) | "EUR-Lex portal homepage (seeded-bad)" | `eur-lex.europa.eu/` | entity-gate reject (portal root) | n/a (not dedup) | **stay rejected** — correct entity-gate refusal (Step-6(b) portal-root proof) |

**Why the two flipped:** the D1 `_normUrl` stripped the whole query, collapsing every
`eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:…` URL to one key, so eFTI and waste false-matched the three
corpus items that share that path shape — `40c05a1e` Weights & Dimensions (`52023PC0445`), `51b2c91e` CBAM
(`32023R0956`), `ab922a18` HDV CO2 (`32019R1242`). Post-fix `canonicalizeUrl` preserves the distinct `?uri=CELEX:…`,
so the collision is gone. Corpus presence check confirms `2020/1056`, `32020R1056`, `2024/1157`, `32024R1157` are all
**ABSENT** — the two flips are genuine recoveries, not real dups the fix missed.

## Outcome

- **Recovered-intake count: 2** — items D1 wrongly blocked: `51ccf09e` (eFTI 2020/1056) and `b41003e9` (waste 2024/1157).
- **Wrong links corrected: 0** (no `entity_extraction` edges exist).
- **Routing:** both resurrections re-enter the machine cycle in **Step 6** (eFTI 2020/1056 is proof (a); waste 2024/1157
  is the second recovery). The two old rejected staged rows get their notes appended (superseded — D1 false-rejection,
  re-adjudicated + re-processed 2026-07-12) at re-mint time = corrected via gate + log. No writes at report time
  (writes pair with their Step-6 verification).
- California ACF (`b631762e`) excluded with reason (already reconciled); portal-root seeded-bad rows stay rejected.

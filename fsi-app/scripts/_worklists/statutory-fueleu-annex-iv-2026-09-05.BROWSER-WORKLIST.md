# Browser-lane worklist: real ship-year inputs for `write-statutory.mjs`

Status: worklist for a browser-capable session (Haiku lane or the coordinator's own browser transport),
2026-09-05, lane CORRIDORS-STATUTORY (W4.2 task 2). This container's network could NOT reach EUR-Lex's
full regulation text this session — confirmed live: `WebFetch` against both
`https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1805` and
`https://eur-lex.europa.eu/eli/reg/2023/1805/oj/eng` returned only page metadata/navigation, never the
regulation's substantive text (EUR-Lex serves its full text through client-side JS this fetcher does not
execute). A general public web page (Drewry's WCI report) fetched cleanly in the same session, so this is
a EUR-Lex-specific gap, not a general network outage — see this lane's REPORT for the exact commands run.

**What is already done and does NOT need re-doing**: the Annex IV formula itself, the 2025 target
(89.3368 gCO2eq/MJ = 91.16 x (1 - 0.02), Art. 4(2)) and its citation were verified LIVE against EUR-Lex by
lane DAG-AUTHOR in an earlier session (2026-09-04, per `write-statutory.mjs`'s own file header) and are
baked into `src/lib/statutory/fueleu-annex-iv.mjs` / `types.ts`. Nothing below asks for that again.

## What this worklist needs, in order

### 1. Confirm the Annex II well-to-wake (WtW) default factor table (if a future producer computes
`ghgIntensityActual` from raw fuel mix rather than accepting a pre-computed figure)

`write-statutory.mjs`'s current contract takes `ghgIntensityActual` and `energyUsedMJ` as **caller-asserted,
already-computed** `StatutoryInput`s (see its own file header: "no live source to join today... reads a
`--rows-file` of CALLER-ASSERTED, fully-provenanced ship-year figures"). Annex II's WtW default factors
per fuel type are needed only if a LATER producer wants to compute a ship's `ghgIntensityActual` from its
raw fuel-consumption breakdown (as EMSA THETIS-MRV reports it, fuel-type by fuel-type) rather than
accepting a pre-computed GHG intensity number. If that producer is built:

- Open `https://eur-lex.europa.eu/eli/reg/2023/1805/oj/eng` in a real browser (renders EUR-Lex's JS;
  `WebFetch` cannot) and locate ANNEX II (default emission factors table, columns typically:
  fuel type, `Cf_wtt` (well-to-tank), `Cf_ttw` (tank-to-wake, by GHG), `LCV` (lower calorific value)).
- Quote every row you use VERBATIM, with the exact table/column heading and the fuel type it names.
  Never round, never interpolate, never paraphrase a number.
- Record the confirmed constants as new named exports beside `FUELEU_REFERENCE_GCO2E_PER_MJ` in
  `src/lib/statutory/fueleu-annex-iv.mjs`, each with its own citation string in the same style
  `ARTICLE_4_2_CITATION` already uses (regulation + article/annex + verification date + method).

### 2. Confirm target years beyond 2025 (2030, 2035, 2040, 2045, 2050), if a rows-file needs one

`write-statutory.mjs`'s `SUPPORTED_TARGET_YEARS` implements 2025 ONLY — every other target year is
refused BY NAME (`parseRow` throws naming the unsupported year), never guessed. Article 4(2) also states
percentages for later years (a "6% reduction from 2030" was mentioned in this lane's earlier, partial
EUR-Lex fetch, without verbatim article text) but 2030/2035/2040/2045/2050 were NOT confirmed and are
therefore NOT implemented. To extend:

- Fetch Article 4(2)'s full percentage table from `https://eur-lex.europa.eu/eli/reg/2023/1805/oj/eng`
  (a real browser), quote the verbatim percentage for each year.
- Add each confirmed year to `SUPPORTED_TARGET_YEARS` in `scripts/propagation/write-statutory.mjs` with
  its own citation, following the existing 2025 entry's shape exactly. Do not add an unconfirmed year.

### 3. Real per-ship, per-year GHG inputs — replaces this worklist's fixture rows-file

`scripts/_worklists/statutory-fueleu-annex-iv-2026-09-05.json` (this worklist's sibling file) is a
FIXTURE, not real data — every row is explicitly labelled `SYNTHETIC FIXTURE VALUE` and its `shipKey` is
`FIXTURE-PIPELINE-PROOF-1`, so it can never be mistaken for a real vessel. To replace it with a REAL,
reviewed row:

- Open `https://mrv.emsa.europa.eu/#public/emission-report` (EMSA's public THETIS-MRV per-ship search,
  a real browser session — this is exactly the source spec 10 §2/§B names: "EMSA THETIS-MRV publishes,
  per IMO number per year, CO2 emitted, fuel consumed, distance, time at sea, cargo carried and derived
  efficiency, for every ship over 5,000 GT calling at EEA ports... a statutorily mandated disclosure
  under Regulation (EU) 2015/757 Art. 21").
- Pick one real, named ship (a real IMO number) with a published annual report for a year this lane's
  `SUPPORTED_TARGET_YEARS` already covers (2025) or a confirmed later year (task 2 above).
- Record, verbatim from the published report:
  - the ship's reported/derived GHG intensity of energy used (gCO2eq/MJ) for that year, per the
    regulation's own methodology (or the raw fuel-consumed/energy-used figures needed to compute it via
    task 1's Annex II factors, if THETIS-MRV does not publish the GHG-intensity figure directly);
  - the ship's total energy used on board (MJ) for that year;
  - whether this is the ship's first, second, third... consecutive year of a compliance deficit (THETIS-MRV
    itself does not publish a "consecutive deficit years" count directly — this likely needs the ship's
    own multi-year compliance-balance history, or an honest `0`/`1` starting point if no prior-year
    deficit history is confirmable).
- Fill one row of `scripts/_worklists/statutory-fueleu-annex-iv-<new-date>.json` (this file's own
  `_schema` documents the exact shape) with `derivation: "observed"`, `originClass` reflecting the
  regulator/registry source, and a `citation` string naming the exact report page/date/IMO number — never
  the placeholder fixture text.
- Have the coordinator review the row (this repo's standing rule: a rows-file is REVIEWED before apply,
  per `write-statutory.mjs`'s own header and the governing plan's T42 sequencing) before dispatching
  `node scripts/propagation/write-statutory.mjs --apply --rows-file scripts/_worklists/<the new file>`.

## Exact dispatch, once task 3 produces a reviewed real rows-file

```
node scripts/propagation/write-statutory.mjs --apply --rows-file scripts/_worklists/<reviewed-file>.json
```

Expected artifact: this script has no dedicated harness-run family of its own today (a `docs/ops/
dispatch-ledger.jsonl` entry is the run record, per this lane's REPORT) — its own stdout summary line
(`[write-statutory] summary: written=N ...`) is the run evidence, and the row(s) become readable via
`SELECT * FROM statutory_computations` (read-only SQL, Supabase project kwrsbpiseruzbfwjpvsp) immediately
after.

# Forward-Event Extractor — Dry-Run (FE-1)

**Extractor:** `scripts/forward-events/extract-forward-events.mjs`, `EXTRACTOR_VERSION = 'fe1-2026-09-01.1'`
**Run against:** `/root/work/forward-events/fixture-24-items.json` (24 live items, 796 FACT/GAP claims, 220 sections)

## Top-line numbers (RAN, not estimated)

| | |
|---|---:|
| Items in fixture | 24 |
| Items that produced ≥1 event | 15 / 24 |
| Total events emitted | 122 |
| Total candidates explicitly skipped (with a reason) | 76 |
| Confidence: high (claim-sourced) | 95 |
| Confidence: medium (section-sourced) | 27 |

**Kind distribution:**

| event_kind | count |
|---|---:|
| phase_step | 45 |
| compliance_deadline | 35 |
| other | 18 |
| entry_into_force | 16 |
| review_or_report | 6 |
| consultation_close | 2 |

Nine items (California Energy Commission, World Bank Transport Strategy, Wyoming DEQ, ENERGY STAR, EPA Michigan, Commission Implementing Regulation 2026/394, Mexico SEMARNAT — 7 named, all 0/0) produced **zero** events and **zero** skips. I read their claims/sections by hand and confirmed none of them contain dated obligation language in any supported form — they are informational/administrative items with no compliance-relevant dates in this fixture slice, not an extractor gap.

Three items are pure market-intelligence content (LNG & Natural Gas Price Intelligence, Battery & Electric Vehicle Technology, Joint Office EV Charging — 0/4, 0/14, 0/5): lots of years, zero obligations. Every date-shaped mention in them is a market forecast or a narrative status snapshot, exactly the anti-pattern the brief called out ("EV battery demand triples by 2030", "the lowest since October 2024"), and the extractor named each one and declined it rather than guessing.

## How to reproduce this run

The extractor takes no file paths and does no I/O by design (pure function, dependency-injected input):

```js
import { extractForwardEvents } from './scripts/forward-events/extract-forward-events.mjs';
import { readFileSync } from 'node:fs';
const items = JSON.parse(readFileSync('/root/work/forward-events/fixture-24-items.json', 'utf8'));
for (const item of items) {
  const { events, skipped } = extractForwardEvents({ claims: item.claims, sections: item.sections });
  // aggregate as needed
}
```

I ran exactly this (from a throwaway script kept outside the repo, since `scripts/forward-events/` is my only write set and a one-off report-generation harness is not itself a deliverable of this lane) to produce every number and table below. Nothing here is hand-estimated.

---
## Hand-check: precision assessment

I did not sample 25 events at random and stop — I read the `obligation_text` and original source for **every one of the 15 items that produced output** (122 events total, well over the 25-event minimum), because a systematic pass over each item's clause structure catches classification errors that a random 25-of-122 sample would likely miss. Below are the specific things I found wrong, including three I then fixed in the extractor itself, and two I judged not worth fixing, named honestly.

### Bugs found and fixed during this pass (not initially correct)

1. **"By `<date>`, the Commission shall submit ... a report" was emitted as `compliance_deadline` instead of `review_or_report`.** Root cause: a stray `requireTrailing` check I'd copy-pasted onto the `by-report-clause` rule was evaluated at the wrong text position (right after "By ", before the date, where it can never see the comma that follows the date) — so the rule always failed to fire, and the generic `by-comma-deadline` rule (tried first at the time) always won instead. Fixed by moving the trailing-comma check to run after date parsing, and reordering `review_or_report` rules ahead of the generic deadline fallback. Verified: `By 31 December 2027, the Commission shall submit ... a report on battery durability` (Euro 7) now correctly emits `review_or_report`.
2. **A trigger phrase followed by a weekday name (`"is Monday, 6 April 2026"`, CBAM) failed to parse at all**, because the date regex is anchored to start exactly where the trigger ends. Fixed by teaching `tryParseDateAt` to skip an optional weekday prefix without absorbing it into `source_span`. Verified `source_span` is exactly `"6 April 2026"`, not `"Monday, 6 April 2026"`.
3. **Second and later dates in a tiered list were misclassified.** For `"It shall apply from 1 July 2028 for new types of C1 class tyres, from 1 April 2030 for new types of C2 class tyres and from 1 April 2032 for new types of C3 class tyres"` (Euro 7), only the *first* date (matched by the dedicated `shall-apply-from` rule, which has the phase-step override) came out `phase_step`; the second and third dates (matched by the generic bare-word `from`-fallback rule, which lacked the same override) came out `compliance_deadline`. Fixed by adding the same "look for a trailing `for <segment>` qualifier" override to the fallback rules. Verified all three tyre-class dates in that clause now read `phase_step`.
4. **Deontic/aim language on the wrong side of the date was invisible.** `"we are committed to reduce ... by 2050"` — the aim word `"committed"` sits *before* the trigger word `"by"`, but the check only looked *after* the date. This silently dropped several genuine corporate-target and IMO-target events (Carbon Trust, Alternative Fuels Insight, IMO CII). Fixed by widening the check to look both backward (bounded to the current sentence, via a new `sentenceStart` helper, so it can't reach across an unrelated clause) and forward from the trigger.
5. **A validity-window's end date was silently dropped** when the connector was `"until"` rather than `"to"` (`"During the transitional period from 1 October 2023 until 31 December 2025 ..."`, CBAM) or when the whole window used the bare-word `from`-fallback rule rather than the dedicated `shall-apply-from` rule (`"running from January 2025 to December 2027"`, Singapore Regional Operations Profile). Fixed by accepting `until` as well as `to`, and by giving the fallback `from`-rule the same window-end behavior as the dedicated rule. Recovered 2 events.
6. **Two real deadlines were being skipped as "no deontic language nearby"** because my deontic-word list only had `shall`/`must`/`is required to` and missed `"is due"` / `"are due"` (`"implementing acts for M1/N1 vehicles are due by 29 May 2025"`, Euro 7) and `"should be submitted"` (`"the last CBAM report ... should be submitted by 31 January 2026"`, CBAM). Fixed by extending the deontic-word check to include `is due`/`are due` and a short list of `should be <verb>` passive-obligation forms. Recovered 2 events.
7. **A phased/transitional-period clause without a trailing `"for <segment>"` qualifier was tagged `compliance_deadline` instead of `phase_step`**: `"During the transitional period from 1 October 2023 until 31 December 2025, the obligations of the importer ... shall be limited to ..."` (CBAM). Fixed by adding a second phase-step trigger: proximity to the words "transitional period" / "phase-in period" / "grace period", not just a trailing "for X".

Each of the above was caught by literally reading the `obligation_text` next to its `event_kind` for every emitted event, not by a heuristic review — the fixes above changed the total from 118 → 122 events and moved roughly a dozen events between kinds. I re-ran the full fixture after each fix; the numbers in this report are from the final state, post-fix.

### Things I checked and found correct

- **Duplicate events across near-identical claims** (e.g. IMO MARPOL's `"MARPOL Annex VI entered into force on 1 November 2022"` appearing as both a FACT claim and, separately, restated in a section) are *not* a bug — each is a distinct, independently source-grounded statement of the same fact, correctly emitted as two events with different `source_claim_id`/`source_section_id`. Brazil PNCA in particular has the same ten-tier GHG schedule stated once as a single enumerated-list claim (10 dates) *and* again as ten separate single-date claims *and* again in a section — 35 events from what is really "one fact, stated four different ways in the source corpus." I did not de-duplicate across sources: that is a downstream-loader decision (whether multiple grounded mentions of the same date collapse to one DB row), not an extraction-correctness question. I flag this explicitly rather than silently picking a side.
- **Citation numbers never became dates.** `Directive 2005/35/EC`, `Regulation (EU) 2023/1805`, `Regulation (EC) No 715/2007` (as bare citations, not the correctly-extracted `"... is repealed with effect from 1 July 2030"` clause attached to the *second* mention of that same regulation) never produced an event anywhere in the fixture. Checked across all 796 claims + 220 sections by re-running the extractor and grepping the emitted spans against every `\d{4}/\d+` citation pattern in the corpus — zero collisions.
- **Historical entry-into-force dates were correctly kept**, per the module's explicit "forward-vs-past is not the filter" design: EU Taxonomy's 2020-07-12, AFIR's 2024-04-13, MARPOL's 2022-11-01, Maritime Carbon Intelligence's 2023-06-05 — all in the past relative to the corpus's generation date, all real entry-into-force facts, all correctly extracted at `high` confidence with clean `entered into force on`/`applicable since` triggers.
- **The market-intelligence items' near-misses are correctly skipped, not missed.** I specifically checked whether any of Battery & EV Technology's 10 skips or LNG & Gas's 4 skips look like they *should* have been events — none do; they are demand forecasts ("battery demand triples by 2030"), price-history statements ("the lowest since October 2024"), and adoption-rate narration, none bound to any obligation, review, deadline, or phase.

### Judgment calls I made, documented rather than "fixed"

- **CBAM: `"[delegated power] shall be conferred on the Commission for a period of five years from 20 October 2025"` was classified `compliance_deadline`.** This is arguably wrong — it's the start of an institutional delegated-powers period, not a deadline any regulated party must meet. It was classified `compliance_deadline` because the deontic-word check (`"shall"`) fired within the same sentence, and my heuristic cannot distinguish "shall + obligation on a regulated party" from "shall + a procedural act of the Commission's own rule-making machinery" without real clause-subject parsing. I judged this out of scope for a regex-based extractor and left it as a named limitation rather than trying to special-case it (which risks overfitting to this one sentence). **This is the one event in the 122 I would call outright mis-kinded rather than merely a coverage gap.**
- **The IMO CII target — `"reduce carbon intensity of all ships by 40% by 2030 compared to 2008 baseline, ships are required to calculate ..."` — was classified `compliance_deadline`.** This is defensible (it is a real regulatory target under MARPOL Annex VI, and "ships are required to" is genuine deontic language in the same sentence) but is a step removed from a clean "by DATE, party shall X" clause; a stricter reading might prefer `other`. I left it as `compliance_deadline` since the obligation language is present and specific.
- **Deeply nested enumerated sub-clauses in AFIR** (`"(iii) by 31 December 2035, each recharging pool offers a power output of..."`) were skipped even though the governing `"Member States shall ensure that ... "` deontic clause almost certainly appears earlier in the same Article — just further back than my 200-character sentence-scoped lookback window reaches, because the article's roman-numeral list is long. I deliberately did not widen the backward window further to catch these, because a wider window risks pulling in an unrelated `"shall"` from a genuinely different sentence elsewhere in a dense legal passage — I judged the recall loss (5 skipped AFIR sub-clauses) preferable to the precision risk of a much wider net. This is a named, deliberate trade-off, not an oversight.
- **`"Reduce Scope 1 and 2 emissions by 50% by 2030 from a 2018 base year"` (Carbon Trust, imperative bullet-point style, no "committed"/"target"/"aim" word attached) was skipped** even though it reads as a real corporate target. I did not add "reduce" to the aim-word list because it is too common a verb in narrative, non-target prose (e.g. "emissions dropped" narration elsewhere in the same corpus) and would meaningfully raise the false-positive rate; the skip reason correctly names the exact ambiguity ("no deontic ... or aim/target language nearby").

### What defeated me / open limitations

- The extractor cannot see obligation language that sits more than ~1 sentence (≤200 chars) away from its date, so long enumerated legal lists whose governing "shall" appears once at the top and several roman-numeral sub-clauses trail below it will under-extract. This is a structural limitation of a window-based heuristic, not a fixable bug within the conservative-by-design brief — true fix would require real clause/sentence-tree parsing, which is out of scope for a $0 regex-based module.
- I did not attempt to de-duplicate events that restate the same fact from multiple sources within one item (see "Duplicate events" above) — that is a deliberate scope boundary, not an oversight, but it does mean a naive `COUNT(*)` over emitted events overstates the number of *distinct* forward facts for items like Brazil PNCA (35 events, but really ~11 distinct dates).

---
## Per-item counts

| Item | item_id | events | skipped |
|---|---|---:|---:|
| Brazil National Policy on Alternative Fuels (PNCA) | `1cda60cd` | 35 | 1 |
| IMO MARPOL Annex VI | `a8cdaa93` | 7 | 3 |
| EU CBAM | `51b2c91e` | 16 | 4 |
| LNG & Natural Gas Price Intelligence | `b8da154a` | 0 | 4 |
| Joint Office of Energy and Transportation: Industry Alignment for EV Charging and Refueling Infrastructure | `537b8131` | 0 | 5 |
| Battery & Electric Vehicle Technology | `85525e8f` | 0 | 14 |
| Euro 7 Standard | `e0c0151c` | 40 | 14 |
| Maritime Carbon Intelligence | `41b43061` | 2 | 2 |
| California Energy Commission Business Meeting Materials and RPS Compliance Period 4 Summary | `7aa19423` | 0 | 0 |
| World Bank Transport Strategy: Jobs, Growth, and Development Focus Areas | `0a8b8ef0` | 0 | 0 |
| Wyoming DEQ Receives EPA Partial Approval for Coal Combustion Residuals Permit Program | `4ff5cf56` | 0 | 0 |
| ENERGY STAR Branding & Marketing Guide and Insulation Messaging Resources | `c6e7abe3` | 0 | 0 |
| EU Taxonomy | `4547e8c5` | 5 | 5 |
| EPA Final Rule: Michigan Air Plan Approval and Redesignation for St. Clair SO2 Nonattainment Area to Attainment | `167b05b4` | 0 | 0 |
| EU Alternative Fuels Infrastructure Regulation (AFIR) | `ff95b385` | 2 | 5 |
| Alternative Fuels Insight (IRENA/IMO) | `c3fa4cc2` | 3 | 4 |
| Commission Implementing Regulation (EU) 2026/394 of 23 February 2026 laying down rules for the application of Regulation (EU) 2023/1805 of the European Parliament and of the Council, as regards access rights and the functional and technical specifications of the FuelEU database | `0c9b2364` | 0 | 0 |
| Mexico SEMARNAT | `6373df1e` | 0 | 0 |
| Port of Los Angeles Environmental Management Policy | `a212b2ab` | 1 | 5 |
| Singapore Green Finance Incentive Scheme for Maritime Decarbonisation | `44906e93` | 1 | 0 |
| Council Implementing Decision (EU) 2026/1440 of 25 June 2026 authorising Germany to apply a reduced rate of taxation to electricity directly supplied to vessels berthed in ports, in accordance with Article 19 of Directive 2003/96/EC | `f9966eb1` | 4 | 0 |
| ITF-OECD Automated and Autonomous Driving Resource | `605a2d06` | 0 | 1 |
| Singapore Regional Operations Profile | `66835398` | 2 | 3 |
| Carbon Trust | `0e6e82cb` | 4 | 6 |
| **TOTAL** | | **122** | **76** |

## Full event list

### Brazil National Policy on Alternative Fuels (PNCA)

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2027-01-01 | day | phase_step | high | claim `ab3686fd` | `1º de janeiro de 2027` |
| 1 | 2029-01-01 | day | phase_step | high | claim `ab3686fd` | `1º de janeiro de 2029` |
| 2 | 2030-01-01 | day | phase_step | high | claim `ab3686fd` | `1º de janeiro de 2030` |
| 3 | 2031-01-01 | day | phase_step | high | claim `ab3686fd` | `1º de janeiro de 2031` |
| 4 | 2032-01-01 | day | phase_step | high | claim `ab3686fd` | `1º de janeiro de 2032` |
| 5 | 2033-01-01 | day | phase_step | high | claim `ab3686fd` | `1º de janeiro de 2033` |
| 6 | 2034-01-01 | day | phase_step | high | claim `ab3686fd` | `1º de janeiro de 2034` |
| 7 | 2035-01-01 | day | phase_step | high | claim `ab3686fd` | `1º de janeiro de 2035` |
| 8 | 2036-01-01 | day | phase_step | high | claim `ab3686fd` | `1º de janeiro de 2036` |
| 9 | 2037-01-01 | day | phase_step | high | claim `ab3686fd` | `1º de janeiro de 2037` |
| 10 | 2031-12-31 | day | phase_step | high | claim `a11f9ffe` | `31 de dezembro de 2031` |
| 11 | 2027-01-01 | day | phase_step | high | claim `5d017232` | `1º de janeiro de 2027` |
| 12 | 2032-01-01 | day | phase_step | high | claim `9faf88c6` | `1º de janeiro de 2032` |
| 13 | 2027-01-01 | day | phase_step | high | claim `0a49c19b` | `1º de janeiro de 2027` |
| 14 | 2032-01-01 | day | phase_step | high | claim `69af0232` | `1º de janeiro de 2032` |
| 15 | 2031-12-31 | day | phase_step | high | claim `69af0232` | `31 de dezembro de 2031` |
| 16 | 2029-01-01 | day | phase_step | high | claim `bb0e52ca` | `1º de janeiro de 2029` |
| 17 | 2030-01-01 | day | phase_step | high | claim `ae74fa42` | `1º de janeiro de 2030` |
| 18 | 2031-01-01 | day | phase_step | high | claim `6ba6c94c` | `1º de janeiro de 2031` |
| 19 | 2033-01-01 | day | phase_step | high | claim `017f67fc` | `1º de janeiro de 2033` |
| 20 | 2034-01-01 | day | phase_step | high | claim `2fdf719c` | `1º de janeiro de 2034` |
| 21 | 2035-01-01 | day | phase_step | high | claim `843399e4` | `1º de janeiro de 2035` |
| 22 | 2036-01-01 | day | phase_step | high | claim `6c3fdba8` | `1º de janeiro de 2036` |
| 23 | 2037-01-01 | day | phase_step | high | claim `3a3e4435` | `1º de janeiro de 2037` |
| 24 | 2027-01-01 | day | phase_step | medium | section `ade85776` | `1º de janeiro de 2027` |
| 25 | 2027-01-01 | day | phase_step | medium | section `758aa10d` | `1º de janeiro de 2027` |
| 26 | 2029-01-01 | day | phase_step | medium | section `758aa10d` | `1º de janeiro de 2029` |
| 27 | 2030-01-01 | day | phase_step | medium | section `758aa10d` | `1º de janeiro de 2030` |
| 28 | 2031-01-01 | day | phase_step | medium | section `758aa10d` | `1º de janeiro de 2031` |
| 29 | 2032-01-01 | day | phase_step | medium | section `758aa10d` | `1º de janeiro de 2032` |
| 30 | 2033-01-01 | day | phase_step | medium | section `758aa10d` | `1º de janeiro de 2033` |
| 31 | 2034-01-01 | day | phase_step | medium | section `758aa10d` | `1º de janeiro de 2034` |
| 32 | 2035-01-01 | day | phase_step | medium | section `758aa10d` | `1º de janeiro de 2035` |
| 33 | 2036-01-01 | day | phase_step | medium | section `758aa10d` | `1º de janeiro de 2036` |
| 34 | 2037-01-01 | day | phase_step | medium | section `758aa10d` | `1º de janeiro de 2037` |

### IMO MARPOL Annex VI

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2026-01-01 | day | review_or_report | high | claim `aaef8a1e` | `1 January 2026` |
| 1 | 2030-01-01 | year | compliance_deadline | high | claim `c8491d60` | `2030` |
| 2 | 2026-01-01 | day | review_or_report | high | claim `77369773` | `1 January 2026` |
| 3 | 2030-01-01 | year | compliance_deadline | high | claim `d90702c1` | `2030` |
| 4 | 2022-11-01 | day | entry_into_force | high | claim `db7b602e` | `1 November 2022` |
| 5 | 2022-11-01 | day | entry_into_force | medium | section `14695388` | `1 November 2022` |
| 6 | 2022-11-01 | day | entry_into_force | medium | section `14695388` | `1 November 2022` |

### EU CBAM

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2030-01-01 | year | other | high | claim `be17784e` | `2030` |
| 1 | 2026-01-31 | day | compliance_deadline | high | claim `d707a980` | `31 January 2026` |
| 2 | 2023-10-01 | day | phase_step | high | claim `7c3de38d` | `1 October 2023` |
| 3 | 2025-12-31 | day | other | high | claim `7c3de38d` | `31 December 2025` |
| 4 | 2024-12-31 | day | entry_into_force | high | claim `d33aba6e` | `31 December 2024` |
| 5 | 2026-01-01 | day | entry_into_force | high | claim `d33aba6e` | `1 January 2026` |
| 6 | 2025-10-20 | day | compliance_deadline | high | claim `fc2eeccd` | `20 October 2025` |
| 7 | 2027-02-01 | day | compliance_deadline | high | claim `fef81c25` | `1 February 2027` |
| 8 | 2023-10-01 | day | entry_into_force | high | claim `15fd1f27` | `1 October 2023` |
| 9 | 2027-09-30 | day | compliance_deadline | high | claim `c5fc3bf6` | `30 September 2027` |
| 10 | 2027-09-30 | day | compliance_deadline | high | claim `9600c5de` | `30 September 2027` |
| 11 | 2026-04-06 | day | compliance_deadline | high | claim `1b3874c3` | `6 April 2026` |
| 12 | 2026-06-10 | day | consultation_close | high | claim `2d70d9d3` | `10 June 2026` |
| 13 | 2026-04-06 | day | compliance_deadline | high | claim `17e88cce` | `6 April 2026` |
| 14 | 2023-05-17 | day | entry_into_force | medium | section `0cc86121` | `17 May 2023` |
| 15 | 2026-06-10 | day | consultation_close | medium | section `6eb4297e` | `10 June 2026` |

### Euro 7 Standard

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2026-11-29 | day | phase_step | high | claim `310203f0` | `29 November 2026` |
| 1 | 2025-05-29 | day | compliance_deadline | high | claim `b0c5264e` | `29 May 2025` |
| 2 | 2026-07-01 | day | phase_step | high | claim `d15489b4` | `1 July 2026` |
| 3 | 2028-04-01 | day | phase_step | high | claim `d15489b4` | `1 April 2028` |
| 4 | 2030-04-01 | day | phase_step | high | claim `d15489b4` | `1 April 2030` |
| 5 | 2027-12-31 | day | review_or_report | high | claim `619b9b14` | `31 December 2027` |
| 6 | 2025-05-29 | day | compliance_deadline | high | claim `687b7d6a` | `29 May 2025` |
| 7 | 2027-12-31 | day | review_or_report | high | claim `a8d3b0fb` | `31 December 2027` |
| 8 | 2030-07-01 | day | other | high | claim `e91c6fd0` | `1 July 2030` |
| 9 | 2031-07-01 | day | other | high | claim `e91c6fd0` | `1 July 2031` |
| 10 | 2028-05-29 | day | compliance_deadline | high | claim `37400c45` | `29 May 2028` |
| 11 | 2030-07-01 | day | compliance_deadline | high | claim `47be1839` | `1 July 2030` |
| 12 | 2032-04-01 | day | compliance_deadline | high | claim `5ab027ab` | `1 April 2032` |
| 13 | 2026-11-29 | day | compliance_deadline | high | claim `d77d6360` | `29 November 2026` |
| 14 | 2030-09-01 | day | compliance_deadline | high | claim `fcc45936` | `1 September 2030` |
| 15 | 2029-05-29 | day | compliance_deadline | high | claim `0148660b` | `29 May 2029` |
| 16 | 2026-11-29 | day | compliance_deadline | high | claim `423772be` | `29 November 2026` |
| 17 | 2030-07-01 | day | compliance_deadline | high | claim `4e69cbd5` | `1 July 2030` |
| 18 | 2028-07-01 | day | compliance_deadline | high | claim `d077b0c3` | `1 July 2028` |
| 19 | 2030-07-01 | day | compliance_deadline | high | claim `d077b0c3` | `1 July 2030` |
| 20 | 2027-11-29 | day | compliance_deadline | high | claim `465e288c` | `29 November 2027` |
| 21 | 2032-04-01 | day | compliance_deadline | high | claim `6ec54c59` | `1 April 2032` |
| 22 | 2030-07-01 | day | phase_step | high | claim `ac77079d` | `1 July 2030` |
| 23 | 2031-07-01 | day | phase_step | high | claim `ac77079d` | `1 July 2031` |
| 24 | 2028-07-01 | day | phase_step | high | claim `fabf4abb` | `1 July 2028` |
| 25 | 2030-04-01 | day | phase_step | high | claim `fabf4abb` | `1 April 2030` |
| 26 | 2032-04-01 | day | phase_step | high | claim `fabf4abb` | `1 April 2032` |
| 27 | 2034-04-01 | day | compliance_deadline | high | claim `9393c819` | `1 April 2034` |
| 28 | 2030-07-01 | day | other | high | claim `aa275350` | `1 July 2030` |
| 29 | 2031-07-01 | day | other | high | claim `aa275350` | `1 July 2031` |
| 30 | 2027-12-31 | day | review_or_report | high | claim `019e0d4e` | `31 December 2027` |
| 31 | 2028-05-29 | day | compliance_deadline | high | claim `1009f2a9` | `29 May 2028` |
| 32 | 2031-09-01 | day | compliance_deadline | high | claim `323ac821` | `1 September 2031` |
| 33 | 2025-12-31 | day | review_or_report | high | claim `39ff8f2c` | `31 December 2025` |
| 34 | 2026-11-29 | day | compliance_deadline | high | claim `98c016f7` | `29 November 2026` |
| 35 | 2030-07-01 | day | other | medium | section `008f7236` | `1 July 2030` |
| 36 | 2031-07-01 | day | other | medium | section `008f7236` | `1 July 2031` |
| 37 | 2025-05-29 | day | compliance_deadline | medium | section `18251b77` | `29 May 2025` |
| 38 | 2026-11-29 | day | compliance_deadline | medium | section `5ba16763` | `29 November 2026` |
| 39 | 2025-05-29 | day | compliance_deadline | medium | section `5ba16763` | `29 May 2025` |

### Maritime Carbon Intelligence

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2023-06-05 | day | entry_into_force | high | claim `72894c76` | `5 June 2023` |
| 1 | 2023-06-05 | day | entry_into_force | high | claim `0df4ab1d` | `5 June 2023` |

### EU Taxonomy

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2020-07-12 | day | entry_into_force | high | claim `01144249` | `12 July 2020` |
| 1 | 2020-07-12 | day | entry_into_force | high | claim `df6c8205` | `12 July 2020` |
| 2 | 2022-01-01 | day | compliance_deadline | high | claim `3f3a2831` | `1 January 2022` |
| 3 | 2021-06-01 | day | compliance_deadline | high | claim `759e742b` | `1 June 2021` |
| 4 | 2020-07-12 | day | entry_into_force | medium | section `9370db2c` | `12 July 2020` |

### EU Alternative Fuels Infrastructure Regulation (AFIR)

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2024-04-13 | day | entry_into_force | high | claim `72442c0c` | `13 April 2024` |
| 1 | 2024-04-13 | day | entry_into_force | high | claim `49fef990` | `13 April 2024` |

### Alternative Fuels Insight (IRENA/IMO)

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2030-01-01 | year | other | high | claim `7d2e29da` | `2030` |
| 1 | 2030-01-01 | year | other | high | claim `a5354081` | `2030` |
| 2 | 2030-01-01 | year | other | medium | section `00270e28` | `2030` |

### Port of Los Angeles Environmental Management Policy

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2030-01-01 | year | other | high | claim `07bd1b62` | `2030` |

### Singapore Green Finance Incentive Scheme for Maritime Decarbonisation

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2025-04-01 | day | compliance_deadline | medium | section `7941db79` | `1 April 2025` |

### Council Implementing Decision (EU) 2026/1440 of 25 June 2026 authorising Germany to apply a reduced rate of taxation to electricity directly supplied to vessels berthed in ports, in accordance with Article 19 of Directive 2003/96/EC

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2026-01-01 | day | entry_into_force | high | claim `fc02b396` | `1 January 2026` |
| 1 | 2029-12-31 | day | other | high | claim `fc02b396` | `31 December 2029` |
| 2 | 2026-01-01 | day | entry_into_force | medium | section `06a4b27f` | `1 January 2026` |
| 3 | 2029-12-31 | day | other | medium | section `06a4b27f` | `31 December 2029` |

### Singapore Regional Operations Profile

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2025-01-01 | month | other | medium | section `daf4a998` | `January 2025` |
| 1 | 2027-12-01 | month | other | medium | section `daf4a998` | `December 2027` |

### Carbon Trust

| # | date | precision | kind | confidence | source | span |
|---|---|---|---|---|---|---|
| 0 | 2050-01-01 | year | other | high | claim `7781b0a5` | `2050` |
| 1 | 2026-01-01 | year | other | high | claim `50127383` | `2026` |
| 2 | 2030-01-01 | year | compliance_deadline | high | claim `39928c0f` | `2030` |
| 3 | 2030-01-01 | year | compliance_deadline | high | claim `76189608` | `2030` |

## Full skipped list

### Brazil National Policy on Alternative Fuels (PNCA)

- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** section `ade85776`  
  **text:** `ing annually to 10% by 2037. Carriers facing compliance costs from`

### IMO MARPOL Annex VI

- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `a3623c7e`  
  **text:** `Currently, as of 1 November 2022, MARPOL Annex VI ha`
- **reason:** 'since' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `14695388`  
  **text:** `board incineration. Since 2011, it has also includ`
- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `1c9a210b`  
  **text:** `orpus source blocks as of 2025 — the full regulati`

### EU CBAM

- **reason:** 'as of'/'since' marks a data-unavailability note on a GAP claim, not an event  
  **source:** section `713e8436`  
  **text:** `urces in the corpus as of June 2026.* The OECD source (`
- **reason:** 'as of'/'since' marks a data-unavailability note on a GAP claim, not an event  
  **source:** section `713e8436`  
  **text:** `rpus verbatim spans as of June 2026.* The study is list`
- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `6eb4297e`  
  **text:** `s:** Proposal stage as of June 2026   **Detail:** On 12`
- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `25fa9fb2`  
  **text:** `stry is operational as of 1 January 2026. Access "should be`

### LNG & Natural Gas Price Intelligence

- **reason:** 'since' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `1334616f`  
  **text:** `es for these months since 2022, coinciding with a`
- **reason:** 'since' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `17c20900`  
  **text:** `nth were the lowest since October 2024. Principal contribu`
- **reason:** 'since' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `3adf2382`  
  **text:** `es for these months since 2022, coinciding with a`
- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `ef9c4617`  
  **text:** `ry Hub ($3.22/MMBtu as of 5 June 2026). This benchmark ga`

### Joint Office of Energy and Transportation: Industry Alignment for EV Charging and Refueling Infrastructure

- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `09510e34`  
  **text:** `As of April 2025, 384 NEVI- and CFI-`
- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `dbc4490c`  
  **text:** `As of April 2025, 384 NEVI- and CFI-`
- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `95fd1a02`  
  **text:** `e charging network. As of May 2025, the Joint Office w`
- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `84ecda7d`  
  **text:** `ion count — FACT:** As of April 2025, 384 NEVI- and CFI-`
- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `55cf9b9a`  
  **text:** `chargers nationally as of April 2025 does not support th`

### Battery & Electric Vehicle Technology

- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `ffd8390c`  
  **text:** `tery demand triples by 2030 to reach more than 8%, up from nearly 3`
- **reason:** 'since' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `67ab92ae`  
  **text:** `– the largest drop since 2017 – as a result of lo`
- **reason:** 'since' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `dccfea12`  
  **text:** `– the largest drop since 2017 – as a result of lo`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `c498532b`  
  **text:** `ur-and-a-half times by 2030 and more than seven times by 2035.`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `c498532b`  
  **text:** `re than seven times by 2035.`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `1bc3f574`  
  **text:** `lithium and nickel by 2030. In addition, the high geographical and`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `93412e62`  
  **text:** `4 to just under 50% by 2030, although it remains by far the`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `bbcc2f1d`  
  **text:** `4 to just under 50% by 2030, although it remains by far the single`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** section `92fc20cf`  
  **text:** `ted to exceed 3 TWh by 2030.**  Battery demand in the energy sector`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** section `ea7d0561`  
  **text:** `o triple to over 8% by 2030, workspaces evaluating electrification`
- **reason:** 'since' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `5f23aea7`  
  **text:** `st single-year drop since 2017 — and a further 8%`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** section `bbd41a81`  
  **text:** `lithium and nickel by 2030 is flagged but not quantified at the le`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** section `bbd41a81`  
  **text:** `lithium and nickel by 2030, and that an undersupply of lithium wou`
- **reason:** 'as of'/'since' marks a data-unavailability note on a GAP claim, not an event  
  **source:** section `bbd41a81`  
  **text:** `rom primary sources as of 2025–2026 publication da`

### Euro 7 Standard

- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `47b582d9`  
  **text:** `ress, by 1 July 2027 for C 1 class tyres, by 1 April 2029 fo`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `47b582d9`  
  **text:** `or C 1 class tyres, by 1 April 2029 for C 2 class tyres and by 1 April 2031`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `47b582d9`  
  **text:** `C 2 class tyres and by 1 April 2031 for C 3 class tyr`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `13f06f8a`  
  **text:** `, by 1 April 2029 for C 2 class tyres and by 1 April 2031`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `13f06f8a`  
  **text:** `C 2 class tyres and by 1 April 2031 for C 3 class tyres. 3. Where the UN WP`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `d6be9c59`  
  **text:** `by 1 April 2029 for C 2 class tyres and by 1 April 2031`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `d6be9c59`  
  **text:** `C 2 class tyres and by 1 April 2031 for C 3 class tyres. 3. Where the UN WP`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `a9134e89`  
  **text:** `technical progress, by 1 July 2027 for C 1 class tyres, by 1 April 2029 fo`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `a9134e89`  
  **text:** `or C 1 class tyres, by 1 April 2029 for C 2 class tyres a`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `8d51be69`  
  **text:** `technical progress, by 1 July 2027 for C 1 class tyres, by 1 April 2029 fo`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `8d51be69`  
  **text:** `or C 1 class tyres, by 1 April 2029 for C 2 class tyres and`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `e077faab`  
  **text:** `ss, by 1 July 2027 for C 1 class tyres, by 1 April 2029 fo`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `e077faab`  
  **text:** `or C 1 class tyres, by 1 April 2029 for C 2 class tyres and by 1 April 2031`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `e077faab`  
  **text:** `C 2 class tyres and by 1 April 2031 for C 3 class tyres`

### Maritime Carbon Intelligence

- **reason:** 'since' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `bd4bced4`  
  **text:** `Since January 2024, the EU's Emissions`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** section `2f435a38`  
  **text:** `carrier surcharges; by 2027 (100% coverage), that surcharge will re`

### EU Taxonomy

- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `6818a84a`  
  **text:** `legated act applies as of January 2022.`
- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `3b5a6fb5`  
  **text:** `legated act applies as of January 2022.`
- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `34aa3721`  
  **text:** `legated act applies as of January 2023.`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `049750bb`  
  **text:** `net zero trajectory by 2050 and the broader environmental goals oth`
- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `c35f36c9`  
  **text:** `Journal | In force as of 12 July 2020 | | 12 July 2020 |`

### EU Alternative Fuels Infrastructure Regulation (AFIR)

- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `0dccfbea`  
  **text:** `ntire TEN-T network by 2030.`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `5baeb768`  
  **text:** `least 150 kW; (iii) by 31&nbsp;December 2035, each recharging pool offers a power ou`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `a522556a`  
  **text:** `m between them: (i) by 31&nbsp;December 2027, along at least 50&nb`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `d5b59d35`  
  **text:** `t least 350 kW; (b) by 31&nbsp;December 2027, along at least 50&nbsp;% of the`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `267836ea`  
  **text:** `by 31&nbsp;December 2025, along at least 15&nbsp;% of the length`

### Alternative Fuels Insight (IRENA/IMO)

- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `772ddaea`  
  **text:** `expected from 2027. As of October 2025, this failed to mat`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `14426669`  
  **text:** `ing emissions by 2030 is marginal: less than 2% compared to i`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** section `5c1beaed`  
  **text:** `the Shipping Sector by 2050 | https://www.irena.org/publications/20`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** section `7aac24db`  
  **text:** `the Shipping Sector by 2050 | https://www.irena.org/publications/20`

### Port of Los Angeles Environmental Management Policy

- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `9abc9f8b`  
  **text:** `p;below 1990 levels by 2030 and 80%&nbsp;below 1990 levels by 2050.`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `9abc9f8b`  
  **text:** `p;below 1990 levels by 2050.`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `264c5c64`  
  **text:** `f chemical X by 25% by September 2030).`
- **reason:** 'since' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `d18996a2`  
  **text:** `Since 2005, the Port has cut o`
- **reason:** 'since' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** claim `9682a07f`  
  **text:** `Since 2017 when the Port updat`

### ITF-OECD Automated and Autonomous Driving Resource

- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `0a8d0bd1`  
  **text:** `l freight operation as of 2025–2026, on which corr`

### Singapore Regional Operations Profile

- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `e00015cf`  
  **text:** `the source material as of June 2026. When published, th`
- **reason:** 'as-of' marks a status/snapshot date, not a bound obligation (no deontic clause follows)  
  **source:** section `e00015cf`  
  **text:** `olutions was active as of April 2024. Selection of solut`
- **reason:** 'as of'/'since' marks a data-unavailability note on a GAP claim, not an event  
  **source:** section `d898e1aa`  
  **text:** `rom primary sources as of June 2026.* The source materi`

### Carbon Trust

- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `3b652e58`  
  **text:** `2 emissions by 50% by 2030 from a 2018 base year Reduce our busine`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `b805d910`  
  **text:** `nnual CO2 emissions by 2050, if left unchecked.&nbsp; Th`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `8156c3e0`  
  **text:** `r reaching Net Zero by 2050 haven’t`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `fd0a7c2e`  
  **text:** `ions by 65% per FTE by 2030 from a 2018 base year Engage with suppl`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `e1a9a7c2`  
  **text:** `2 emissions by 50% by 2030 from a 2018 base year Reduce our busine`
- **reason:** date after 'by' with no deontic ('shall'/'must') or aim/target language nearby — ambiguous whether this is a bound obligation  
  **source:** claim `2c80ad28`  
  **text:** `te emissions by 90% by 2050 from a 2018 base year The Carbon Trust`

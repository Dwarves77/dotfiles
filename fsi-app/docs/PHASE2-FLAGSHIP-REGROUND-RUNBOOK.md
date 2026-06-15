# Phase 2 — Flagship Re-Ground Runbook (filed before the A6 flips)

**Trigger:** the A6 backfill re-stamps every FACT claim with its canonical institutional tier; under the
reg-only authority floor (migration 138) **30 regulatory items flip `verified → quarantined`** because
their FACT claims span secondary sources (law-firm briefings, trade press, intergovernmental analysis,
unregistered hosts) rather than primary legal text. Phase 2 re-grounds them against PRIMARY sources.
This runbook exists **before** the flips land so the dark window opens with the remediation map in hand.

## Method (pool-augmentation + re-ground, NOT re-synthesis)
1. Fetch the per-item PRIMARY into `agent_run_searches` (pool augmentation) — the item's own primary
   `source_url` is already the right target for almost all 30 (see map).
2. Re-extract the claim ledger against the augmented pool (re-ground only): FACT spans now resolve to the
   primary; their `source_tier_at_grounding` re-stamps to T1/T2 via the canonical resolver → floor passes.
3. **Prose stands; anchoring changes.** Re-synthesize ONLY claims that exist solely as secondary
   interpretation (no primary equivalent) — relabel those as `Industry interpretation:` ANALYSIS (the
   class-society / advisory precedent) or drop, never force them to FACT.

## LANGUAGE RULE (hard)
Verbatim FACT spans **cannot cross languages**. Use the official **EN** primary where it exists. Where no
EN primary exists, the honest outcome is **ANALYSIS-relabel** of the affected claims **or priority review**
— NEVER a forced cross-language span, never an EN paraphrase passed as a verbatim span.

## Test-one-per-jurisdiction-class BEFORE the batch
Run one item per class, confirm it re-grounds + flips back to verified, then batch:
EU/EUR-Lex · IMO · US-state/city · UK-SI · non-EN.

## Per-item primary-source map (the 30)

### A. EU — EUR-Lex CELEX, EN official (10) — primary already correct
| item | instrument | primary |
|---|---|---|
| eu_ets_directive_2023_959 | Dir (EU) 2023/959 | eur-lex.europa.eu/eli/dir/2023/959/oj (EN) |
| eu_clean_trucking_2024_1610 | Reg (EU) 2024/1610 | eur-lex.europa.eu/eli/reg/2024/1610/oj (EN) |
| 7a0ead55 | Reg (EU) 2023/1805 FuelEU | eur-lex.europa.eu/eli/reg/2023/1805/oj (EN) |
| 5cc10a6d | Reg (EU) 2025/40 (PPWR) | eur-lex.europa.eu/eli/reg/2025/40/oj (EN) |
| e2e03e1b | Reg (EU) 952/2013 UCC | eur-lex.europa.eu CELEX 32013R0952 (EN) |
| eu-ets-maritime | Dir 2003/87 as amended (maritime) | eur-lex.europa.eu CELEX 02003L0087 (EN) |
| csrd-provisions / csrd-sector | Dir (EU) 2022/2464 CSRD | eur-lex.europa.eu CELEX 32022L2464 (EN) |
| 3ae89ce6 | Reg (EU) 2019/1242 HDV CO2 (as amended 2024/1610) | eur-lex CELEX 32019R1242 (EN) |
| d5ee6ab8 | Fit-for-55 package | resolve to the SPECIFIC act each claim cites (EUR-Lex EN); portal page is not a FACT source |
| o6 | Reg (EU) 2015/757 MRV | eur-lex.europa.eu/eli/reg/2015/757/oj (EN) |

### B. IMO instruments (1)
| 93c344a1 | EEXI/CII — MARPOL Annex VI reg 25/28, MEPC.328(76)/.336(76)/.337(76) | imo.org instrument pages (EN) |

### C. US federal / state / city — statute/rule/ordinance (6)
| bec305e1 | EPA HDV GHG Phase 3 final rule | federalregister.gov (already primary) + ecfr.gov 40 CFR 1036 |
| d56ca4e1 | NYC Local Law 97/2019 | nyc.gov Local Laws PDF (already primary) |
| 89656109 | NYC LL84/LL133 benchmarking | nyc.gov benchmarking (already primary) |
| 0ea6a710 | NY State 17 NYCRR / DOT rules | dot.ny.gov + NYCRR official |
| cd5c84e3 | NC EO/NCDOT climate | ncdot.gov + NC exec order text |
| de2df788 | CT HDV (CT DEEP / Public Act) | portal.ct.gov DEEP reg text |

### D. UK statutory instruments (3)
| a4 | UK SAF Mandate (SI 2024) | legislation.gov.uk SI (assets.publishing → resolve to the SI) |
| 782878c0 | RTFO (Sustainable Aviation Fuel) Order | legislation.gov.uk/ukdsi/2024/... (already primary) |
| d935e112 | MEES — Energy Efficiency (Private Rented Property) Regs 2015 | legislation.gov.uk/uksi/2015/962 (gov.uk guidance → resolve to the SI) |

### E. Non-EN primary — LANGUAGE RULE applies (10)
| 27dfbe4c | China Environmental Code | NPC official; **no full EN primary** → ANALYSIS-relabel China-Code claims or priority review (cciced.eco is T3 corroboration, not FACT) |
| 6a857887 | Brazil Lei 12.305/2010 | planalto.gov.br (PT, already primary) — **EN absent** → priority review / labeled; PT spans only if a PT brief is acceptable |
| ad4cc6c6 | Japan Customs Tariff Law | customs.go.jp/english (EN exists) |
| japan-gx | Japan GX (METI) | meti.go.jp/english (EN where published) |
| japan-top-runner | Japan Top Runner (METI) | meti.go.jp/english (EN where published) |
| india-nlp | India National Logistics Policy | commerce.gov.in EN (already primary) |
| 03b5f234 | Norway ZE passenger fjords | regjeringen.no/en (EN exists) |
| 82f09535 | Norway ZE World Heritage fjords | sdir.no/en (EN exists) |
| g19 | South Korea MOF | mof.go.kr EN where published; ICAP (T3) stays corroboration; Korean primary else priority review |

## Cost quote
- Test pass: 5 items (one per class) ≈ **$0.50 Sonnet + ~10 Browserless units**.
- Full batch: 30 items × ~1 Sonnet re-ground call (~$0.08) ≈ **~$2.40 Sonnet + ~60–90 Browserless units**.
- Re-ground only (no full re-synthesis) keeps it well under a full-regen ($0.15/item) pass.
- Non-EN items (27dfbe4c, 6a857887, g19) may NOT re-ground to verified by the language rule — those exit
  to priority review, not forced. Honest expected yield: ~24–27 of 30 flip back; the rest are honest
  priority-review residual.

## Quote-cost-first gate
Do not run the batch before re-confirming this estimate against the test-pass actuals (C1 in Stage C).

---

## STAGE C EXECUTION STATUS (2026-06-13) — batch DEFERRED (environment network), readiness banked

**The win already holds:** every data audit (claims-tier / substrate / one-tier / quarantine-disposition)
is GREEN through honest exits — the system can no longer fake-certify. The 30 are honestly quarantined.
Phase 2 *recovery* (flipping them back to verified) is valuable, not urgent.

**C1 test outcome (honest):** the resolver + register + language-rule discipline WORK — `93c344a1` fetched
the IMO primary (18k chars), the resolver correctly re-anchored 15 FACTs to IMO T2, and it HONESTLY exited
(no forced span) on the residual; `d56ca4e1` (NYC LL97) honest-exited because its primary is a PDF that
extracts to ~245 chars. **No forced spans, audits green.** But the API-heavy run is BLOCKED on the
execution-environment's outbound network, which fails two ways — transient `TypeError: fetch failed`
(errors) AND silent HANGS (connected, no response). Bounded-pool undici Agent + heavy retry did not
overcome it (4 attempts). The runner (`scripts/phase2-reground.mjs`) is idempotent + checkpoint-resumable
(state in the DB: verified, or an open `phase2_priority_review` flag) and hang-safe (timeout-race) — it
runs clean in a stable environment / the CI-with-secrets lane. **No state is lost by deferring.**

**Composition probe (read-only, all 30) — the data the method depends on:** 810 FACTs →
**(i) primary T1-2 = 427 (53%) · (ii) secondary T3-6 = 137 (17%) · (iii) unregistered null = 246 (30%)**.
0 items verify on re-ground alone (every item has ≥1 in ii/iii).

**KEY FINDING — Step-3 registration sweep yields ≈0 here.** Every one of the 246 null-anchor hosts is
SECONDARY (law firms `wfw.com`/`lw.com`/`klalaw`/`dlapiper`/`reedsmith`; trade press `dieselnet`/
`truckinginfo`/`sustainable-bus`; commercial/advisory `cim.io`/`shipzero`/`senken`/`coolset`/`planbe`;
NGO `climatecatalyst`). The only IGO is `whc.unesco.org` (T3, fails the floor anyway). Unlike the 32→30
sweep (Texas Register / Hansard), there is **no authoritative-unregistered host to register** — the
flagships' non-primary facts were synthesized from law-firm briefings + trade press. Registration is a
dead lever for these 30.

**Method for the deferred batch = layered (operator 2026-06-13):**
1. **(a) FLOOR** for every item: honest priority-review / quarantine is an acceptable end-state — NEVER a
   forced span.
2. **(b)-NARROW recovery, PER-FACT (not per-brief), grounding-layer only (NOT prose re-synthesis):** keep
   the prose; prefer the primary for facts it contains (working — proven on `93c344a1`); each remaining
   FACT gets a per-fact disposition — *primary-recoverable* (fact is in the primary, re-anchor → T1-2);
   *secondary-only* → relabel `Industry interpretation:` ANALYSIS (drops below the FACT authority floor
   honestly — criterion 4's purpose; requires inserting the **label prefix** into that sentence so the
   unlabeled-assertion check passes — honest annotation, the ONE prose touch, awaiting operator ack);
   *nowhere-primary / nowhere-registrable* → drop or flag for counsel.
   DO NOT re-synthesize prose / force-primary-into-pool + full generateBrief (that optimizes the brief to
   pass the gate, not to be true — the failure this whole effort killed).
3. After: items whose surviving FACTs are all ≤T2 flip verified; the rest stay honestly quarantined for
   counsel-grade work. Re-run the audits; report the verified / relabeled / counsel split across the 30.

**Resume:** `node scripts/phase2-reground.mjs --apply` (idempotent; skips verified + already-dispositioned;
`--force` to re-test a single item; `--only=` / `--limit=`) once the network is stable, then build + run the
(b)-NARROW per-fact relabel layer.

---

## (b)-NARROW ANALYSIS RELABEL — BUILT 2026-06-15 (`scripts/phase2-analysis-relabel.mjs`), --apply DEFERRED

The relabel layer is built and dry-run-validated. **The run is deferred** (it gates on the network
re-ground, which is still env-blocked). Operator-locked guardrail (2026-06-15, rider-1 = **1A ONLY**):

**WHAT IT DOES.** For a reg-family CRITICAL/HIGH item, each FACT claim below the authority floor
(tier NULL or not in 1,2) is relabel-eligible **iff** its STORED `claim_text` is ALREADY a raw,
case-insensitive substring of its section's `content_md`, occurring **exactly once**. For an eligible
claim the ONLY two changes are: (1) `claim_kind` FACT→ANALYSIS (claim_text **byte-identical**, never
touched); (2) the fixed marker token `*Industry interpretation:* ` inserted at the known offset
immediately before the existing sentence in `content_md` — a **pure insertion**.

**WHAT IT REFUSES.**
- **No claim_text editing, ever.** The `--allow-slot-strip` loosening was REJECTED and not shipped:
  editing the stored fact (even stripping the `[slot] ` admin prefix) to manufacture a substring match
  is the fake-certification pattern in miniature. If `[slot] ` is junk, that is a SEPARATE source-level
  data-hygiene fix for ALL claims — never an opportunistic strip inside the one prose-touching path.
- **Non-locatable facts are NOT dropped.** ~76% of below-floor facts (claim_text is the model's
  articulation, e.g. a markdown table row like `| 2023-03 | ISO 14083:2023 published |`, with no prose
  sentence to prefix) stay as the item's honest priority_review residual. A priority_review fact is
  recoverable; a dropped fact is gone — investigate-before-discard.

**DIFF-ASSERT (asserted on `content_md` DIRECTLY, not just claim_text).** Each marker insert is verified
by its inverse — removing the marker token at its offset must reproduce the pre-insert string
byte-for-byte, and the section length delta must equal exactly `N × len(marker)`. A marker insert that
reflowed a paragraph would pass a naive "claim_text unchanged" check but fail this. Any deviation aborts
the whole item with NO partial write (per-item transaction, trigger-disabled bulk like the A6 backfill).

**HARD APPLY PRECONDITION (per item, in code — not a note).** `--apply` REFUSES an item unless its
re-ground pass has completed, proven by `provenance_status='verified'` (reground succeeded; skip) OR an
open `phase2_priority_review` flag (reground ran + honest-exited). A quarantined item with no such flag
means reground has NOT run; relabeling then would demote PRIMARY-RECOVERABLE facts to ANALYSIS before
reground can anchor them T1/2 — refused. DRY-RUN ignores the precondition (projects current state, writes
nothing).

**DRY-RUN PROJECTION (2026-06-15, pre-reground ceiling, current state):** 383 below-floor FACTs across
the 30 → **60 mechanically relabelable (1A)** · **323 honest residual** · **0 items flip on relabel-alone**
(every item retains residual below-floor facts pre-reground). This is the ceiling, not the outcome: the
real verified/relabel/counsel split is produced by `--apply` AFTER reground, when the below-floor set has
shrunk to the secondary-only residue reground could not anchor. Matches the operator-stated shape — a
verified CORE + a large ANALYSIS-labeled layer + a counsel queue, NOT 30 items returning to verified.

**Run order (post-network-stable, stable/CI lane):**
`node scripts/phase2-reground.mjs --apply` → then `node scripts/phase2-analysis-relabel.mjs --apply`
(idempotent; skips verified + already-relabeled; refuses non-regrounded items; `--only=`/`--limit=`;
snapshots prior content_md + claim_kind to `scripts/_snapshots/` for reversibility). Re-run the audits;
report the verified / relabeled / counsel split across the 30.

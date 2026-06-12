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

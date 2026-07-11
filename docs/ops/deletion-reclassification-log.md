# Deletion / reclassification log

Every value-ruled or dedup delete + every reclassify-to-source, appended at execution. Columns: when · key · id · title · action · reason · ruling · snapshot.

- 2026-07-06T21:52:29.025Z · g26 · 8ff93a7e-5256-4d31-959b-2172de16ae8f · "IRENA Abu Dhabi" · DELETE · 2012 IRENA press release mis-typed as regulation (shell) · T5 operator ruling, dispatch 2026-07-06 (decision-package-2026-07-06.md) · C:\Users\jason\dotfiles\fsi-app\scripts\_snapshots\2026-07-06T21-52-28-312Z_intelligence_items.jsonl
- 2026-07-06T21:52:29.724Z · t6 · 658247c4-52e1-4af5-9073-2ab56c6e4ee0 · "ICAP ETS Map" · DELETE · ICAP ETS Map is a tool, not a regulation; ICAP research lives at abd29144 · T5 operator ruling, dispatch 2026-07-06 (decision-package-2026-07-06.md) · C:\Users\jason\dotfiles\fsi-app\scripts\_snapshots\2026-07-06T21-52-29-324Z_intelligence_items.jsonl
- 2026-07-06T21:52:30.539Z · l8 · c8b4f1ae-45d1-4719-86a7-40809f709556 · "Drive Electric: Zero-Emission Freight" · DELETE · thin US-DOT program page; re-mintable via the gated intake if a genuine primary surfaces · T5 operator ruling, dispatch 2026-07-06 (decision-package-2026-07-06.md) · C:\Users\jason\dotfiles\fsi-app\scripts\_snapshots\2026-07-06T21-52-29-985Z_intelligence_items.jsonl
- 2026-07-06T21:52:32.980Z · g22 · 935680f5-6915-4241-a9b5-7e450143bc0f · "China CCICED" · RECLASSIFY→source(tier 2) · China CCICED advisory-council page mis-typed as regulation → source · T5 operator ruling, dispatch 2026-07-06 (decision-package-2026-07-06.md) · C:\Users\jason\dotfiles\fsi-app\scripts\_snapshots\2026-07-06T21-52-32-174Z_intelligence_items.jsonl

- 2026-07-07T22:42Z · PPWR dup · 5cc10a6d-b671-425e-abdb-8b3ba41678b3 · "EU Regulation 2025/40 - Official Journal" · ARCHIVE (duplicate_instrument) · same instrument as survivor efdb3390 "EU PPWR 2025/40" (44 claims vs 74; 0 milestones); survivor adopted this row's canonical ELI URL · operator dedup ruling, dispatch 2026-07-07 (DATE-AND-DEDUP-AUDIT) · scripts/_snapshots/2026-07-07T22-42-23-068Z_intelligence_items.jsonl
- 2026-07-07T22:42Z · CSRD dup · 9c5d1d17-4388-43a0-b9df-67de1fc0e582 · "EU CSRD - Transport" · ARCHIVE (duplicate_instrument) · identical CELEX source_url as survivor f0833999; brief EMPTY (0 chars, 0 sections) — the pair that proved the same-instrument gap · operator dedup ruling 2026-07-07 · same snapshot batch
- 2026-07-07T22:42Z · Reuters dup · d136c88c-8816-4727-b15d-a80b96f0f57b · "Reuters Sustainability Coverage - General Monitoring" · ARCHIVE (duplicate_instrument) · survivor 4de1e28e (23 claims/8 sections vs 10 claims) · operator dedup ruling 2026-07-07 · same snapshot batch
- 2026-07-07T22:42Z · ECTA dup · 29132ca6-9172-45ab-95c2-e7fd7b8aa62a · "European Clean Trucking Alliance" · ARCHIVE (duplicate_instrument) · survivor 58bf0406 (34K brief). RESIDUAL: loser's 3 extra claims NOT ported (claims FK the loser's sections; separate careful pass) — archived twin retains them · operator dedup ruling 2026-07-07 · same snapshot batch
- 2026-07-07T22:42Z · AFIR dup · 6b0939a5-30fe-4afe-88d5-26d6b96bb752 · was "EU Regulation 2023/1804 - Sustainability Reporting Requirements" · RE-TYPE then ARCHIVE (duplicate_instrument) · ruling: label defect CURED FIRST (retitled to true AFIR identity — 2023/1804 IS AFIR), then identifier-level identity confirmed (CELEX:32023R1804 ≡ eli/reg/2023/1804/oj) → archived; survivor 62ba40b0 (verified, survivor-verified rule held) · operator dedup ruling 2026-07-07 · same snapshot batch
- 2026-07-07T22:42Z · AFIR dup · ff95b385-6cb2-453a-94e6-b9fc84d7f851 · "EU Alternative Fuels Infrastructure Regulation (AFIR)" · ARCHIVE (duplicate_instrument) · third same-identifier item (eli/reg/2023/1804/oj), quarantined twin of verified survivor 62ba40b0 · operator dedup ruling 2026-07-07 · same snapshot batch
- 2026-07-07T22:42Z · Singapore Green Finance · 44906e93 (MPA) + 64e9d38d (MAS) · KEEP BOTH + xref edge (related/manual) · NOT duplicates: two agencies regulating one domain (ministry-vs-maritime-authority pattern, pair-2 precedent) · operator dedup ruling 2026-07-07 · scripts/_snapshots/2026-07-07T22-42-24-353Z_item_cross_references.jsonl

### 2026-07-08 · surface-visibility flag disposition (read-and-dispose dispatch)

28 items RECLASSIFY→source (institution/portal/reference-body mis-minted as an item; identity IS a source, confirmed by reading each brief; every target verified to have a live `active` source before archive, so no scanner orphan). Action for all: `is_archived=true, archive_reason='reclassified_to_source'`. Ruling: operator dispatch 2026-07-08 (delegated read-and-dispose; genuine type/relevance ambiguity escalated, not archived). Snapshot + reversal SQL: `scripts/_snapshots/2026-07-08_surface-visibility-disposition.jsonl`. Guarded + read-back (28/28 confirmed archived; 28 flags resolved).

- Self-declared non-regulatory (brief text admits it): e37a5c9a g28 "IPCC Climate Reports" ("produces no binding regulation"); 6d2ec398 g29 "IEA Policies & Measures" ("not a regulation; reference infrastructure"); 8e5a62ba r6 "TNO Mobility & Logistics" ("a research and innovation body"); c0a2dfb3 o11 "Lloyd's Register Decarbonisation Hub" ("an independent non-profit research and action initiative").
- Institution / org-overview: b680a0b8 g16 "IDB Sustainable LatAm Transport"; 5351d10b "IDB Group Transport Sector Framework"; 8c0049b4 g30 + c828810c + 0a8b8ef0 (three World Bank Transport overviews); f982289b t2 + 7115c978 (two WTO Environment & Trade); 5e0af336 t7 + 7d5bd5a1 + bd9a1a6b (three GEF); 46c528f5 t4 "UNCTAD Sustainable Transport"; ca6fa630 "ECLAC Organizational Overview"; c3004aa0 "OECD Environment Policy Area"; 5faf8f8c r13 "GreenBiz Supply Chain" (nav-index, failed generation).
- Ministry / agency / department portal: 974550f4 German Fed Ministry of Transport hub; 0587f0b7 UK DEFRA org overview; 54b1082b Pennsylvania DEP homepage; 1c68ba4c New Brunswick Env dept; 5d2e7616 Manitoba Env dept; 6961f625 Philadelphia Office of Sustainability.
- Portal / gazette / error-page: fc7cdcd7 "NY Senate Legislation Portal" (Cloudflare); 2f4dc1f8 "Montreal City Environment Portal" (404); 74a54415 "Diário Oficial da União" gazette access; 120529b8 "ITF General Rules" (institutional governance, Cloudflare).

Companion (NOT deletes/reclassifies — logged for completeness): 5 genuine market_signals re-routed Regulations(d1)→Market Intel(d4), briefs untouched: 237b3cc1 Maritime Singapore Blueprint; 64e9d38d + 44906e93 Singapore Green Finance (the operator keep-both MAS/MPA pair — routing only, pairing preserved); b0cf862e California CSFAP; 7aa19423 California RPS CP4. Same snapshot; 5 flags resolved. 18 flags remain OPEN — genuine type-ambiguity (technology-vs-research_finding tech items), off-vertical, and borderline — escalated to operator, not disposed.

### 2026-07-08 (later) · the-18 enactment (never-a-human-layer re-adjudication)

**Supersedes the "18 flags remain OPEN" line above.** The 18 in_review flags were re-adjudicated under
the operator's never-a-human-layer doctrine: escalation-to-Jason is correct only for genuine
legal-interpretation calls; everything else the classifier/entity-layer resolves and ENACTS. **Residue = 0**
(none was a legal call). Guarded + read-back (4 technology / 9 domain / 5 archived confirmed; 18 flags
resolved). Snapshot + reversal SQL: `scripts/_snapshots/2026-07-08_the-18-enactment.jsonl`.

- **ARCHIVE (off_domain)** — off the freight-sustainability vertical (relevance-layer disposition):
  99de93a3 "MDEQ Water Contact Advisories" (Gulf-coast beach bacterial advisories); 0ff5f197 "Rhode
  Island Fish Passage / River Herring Migration". Reversible (un-archive).
- **RECLASSIFY→source** — institution/agency/programme overview mis-minted as item; active source
  verified before archive, source retained: d012bc20 "NC DEQ Air Quality Division"; 2943632e "Port of
  Los Angeles Environmental Management Framework"; 319f785d "UNCTAD Transport Infrastructure & Services
  Programme". Reversible.
- Companion (NOT deletes — logged for completeness): **4 re-typed** research_finding→technology (stay
  Market Intel d2, brief format already Technology Profile for 2 of them): 85525e8f Battery&EV, 7169c9ac
  Autonomous freight, f6774c49 Hydrogen&Ammonia, afc851b1 Marine Fuel. **9 domain-fixed** (re-routed to
  their type's surface, briefs untouched): ENERGY STAR + LADBS→Regulations(1); Joint Office EV + ASEAN
  Plan + UNCTAD Six-Step→Market Intel(4); Nashville Building Energy→Regulations(1); Solar-BESS + 48th
  ASEAN Summit→Operations(3); Warehouse-BESS-ROI→Research(7).

## Related

- [[migrations]] — RECLASSIFY→source entries run through the migration-135 source-registration guard and migration-019 mistyped-tool reclassification — the DB…
- [[sprint4-dataops-ledger]] — Both are execution-time audit ledgers of durable intelligence_items mutations with snapshot/reversal columns; the dataops ledger's archive passes…
- [[sources-content-verification-2026-05-11]] — Confirms the 66 hard deletions this audit checks (0 remain, 0 agent_runs FK orphans) — the ops log of that deletion action
- 2026-07-11T05:27:37.541Z · (no legacy key) · 646dda2d-f039-4a55-90e2-900dbca4b185 · "Online Casino Free Spin Promotions and No-Deposit Bonus Offerings - 20" · DELETE · pre-intake-gate off-domain junk live in the monitoring band (casino promotions on a mintransporte.gov.co source URL) · Q-3 operator ruling, RECONCILIATION REMEDIATION dispatch 2026-07-10 (site-gap register Q-3, Kansas precedent) · C:\Users\jason\dotfiles\fsi-app\scripts\_snapshots\2026-07-11T05-27-36-946Z_intelligence_items.jsonl

### 2026-07-11 · Q-3 casino delete + sibling relevance sweep (reconciliation remediation dispatch)

- 2026-07-11 · (no key) · 646dda2d-f039-4a55-90e2-900dbca4b185 · "Online Casino Free Spin Promotions and No-Deposit Bonus Offerings - 2026" · DELETE · pre-intake-gate off-domain junk live in the monitoring band (casino promotions wearing a mintransporte.gov.co source URL) · Q-3 operator ruling, reconciliation remediation dispatch 2026-07-10 (Kansas precedent) · scripts/_snapshots/2026-07-11T05-27-36-946Z_intelligence_items.jsonl
- Sibling sweep over the live signal band (junk-pattern titles, 288 live): 2 hits, both investigated then ARCHIVED (off_domain, reversible — MDEQ-beaches precedent): daaa7e3a "Matrix Hudson 2BR/1BA Affordable Rental Unit - Lottery" + fb86ee11 "Matrix Hudson Unit Lottery Opening" — income-restricted housing listings; the fb86ee11 brief itself declares the freight-workspace mismatch. Zero further junk-pattern titles remain live.

### 2026-07-11 · Wave-α C7.3 guarded duplicate/twin merges

- 2026-07-11T20:12:09.872Z · item-twin · KEEP ab922a18 <- ARCHIVE b7736a1a · HDV CO2 2019/1242 (CELEX 32019R1242) · archive_reason=duplicate_instrument · Wave-α C7.3
- 2026-07-11T20:12:16.812Z · source-dup · KEEP ef347aa7 <- ARCHIVE(suspend) dcb667a7 · breeam.com · edges re-pointed to keeper · Wave-α C7.3
- 2026-07-11T20:12:23.274Z · source-dup · KEEP 7d939fc1 <- ARCHIVE(suspend) 410466f8 · climate-laws.org · edges re-pointed to keeper · Wave-α C7.3
- 2026-07-11T20:12:28.978Z · source-dup · KEEP 622d0e55 <- ARCHIVE(suspend) addc7d05 · climatemachine.mit.edu · edges re-pointed to keeper · Wave-α C7.3
- 2026-07-11T20:12:34.769Z · source-dup · KEEP 071dff9e <- ARCHIVE(suspend) c096820c · csrf.ac.uk · edges re-pointed to keeper · Wave-α C7.3
- 2026-07-11T20:12:39.785Z · source-dup · KEEP 071dff9e <- ARCHIVE(suspend) 70de33a1 · csrf.ac.uk · edges re-pointed to keeper · Wave-α C7.3
- 2026-07-11T20:12:44.898Z · source-dup · KEEP 5f12cb79 <- ARCHIVE(suspend) b2c71c2c · doee.dc.gov · edges re-pointed to keeper · Wave-α C7.3
- 2026-07-11T20:12:51.782Z · source-dup · KEEP dae165c8 <- ARCHIVE(suspend) b4b04ad0 · flk.npc.gov.cn · edges re-pointed to keeper · Wave-α C7.3
- 2026-07-11T20:12:56.599Z · source-dup · KEEP 111c637d <- ARCHIVE(suspend) de15227a · freightwaves.com · edges re-pointed to keeper · Wave-α C7.3
- 2026-07-11T20:13:01.386Z · source-dup · KEEP b2588399 <- ARCHIVE(suspend) 295fba96 · splash247.com · edges re-pointed to keeper · Wave-α C7.3
- 2026-07-11T20:13:07.867Z · source-dup · KEEP 4a956756 <- ARCHIVE(suspend) 4fdb662c · ecovadis.com (institution-level) · edges re-pointed to keeper · Wave-α C7.3
- 2026-07-11T20:13:14.345Z · source-dup · KEEP 4a956756 <- ARCHIVE(suspend) a6b20a8a · ecovadis.com (institution-level) · edges re-pointed to keeper · Wave-α C7.3
- 2026-07-11T20:13:20.086Z · source-dup · KEEP 4a956756 <- ARCHIVE(suspend) a2d25d50 · ecovadis.com (institution-level) · edges re-pointed to keeper · Wave-α C7.3
- 2026-07-11T20:13:26.382Z · source-dup · KEEP 4a956756 <- ARCHIVE(suspend) 6f698bf0 · ecovadis.com (institution-level) · edges re-pointed to keeper · Wave-α C7.3

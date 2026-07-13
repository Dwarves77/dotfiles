# Source classification backfill — final summary

**Generated:** 2026-05-11 (America/New_York)
**Branch at start:** `fix/market-research-operations-framework-parity` (clean working tree, only untracked files)
**Branch at end:** `master`
**Script:** `scripts/backfill-classify-batch.mjs` (commit `aeb18d7` on `master`)
**Intermediary JSON:** `scripts/tmp/_backfill-classify-out.json`
**Tier policy:** Option A (framework default tier from JSON; existing tier kept when JSON tier is null/missing). 0 tier overrides observed across all 4 batches.

---

## 1. Final classified count

| Bucket | Count |
|---|---|
| Total rows in `public.sources` | 794 |
| Rows with `source_role IS NOT NULL` | **755** |
| Rows with `source_role IS NULL` (AMBIGUOUS) | 39 |

**JSON intermediary contribution:** 744 rows (the 783 candidates minus 39 AMBIGUOUS minus 0 URL-split-flagged), which exactly matches the spec's prediction of 744.

**Reconciliation note:** 11 of the 755 classified rows were already classified before this batch run (all assigned at the same timestamp `2026-05-10T21:20:49.144+00:00`, all with `classification_confidence = NULL`). They are NOT in the JSON intermediary's `classified` list and therefore are not counted in the per-batch deltas below. They are listed in section 8.

---

## 2. Role distribution (all 755 classified rows)

| Role | Count |
|---|---|
| primary_legal_authority | 507 |
| intergovernmental_body | 77 |
| academic_research | 50 |
| statistical_data_agency | 42 |
| trade_press | 31 |
| industry_association | 26 |
| standards_body | 16 |
| industry_data_provider | 3 |
| vendor_corporate | 2 |
| government_press | 1 |
| **TOTAL** | **755** |

---

## 3. Confidence distribution (all 755 classified rows)

| Confidence | Count |
|---|---|
| HIGH | 398 |
| LOW | 224 |
| MEDIUM | 122 |
| null (legacy pre-backfill rows, see section 8) | 11 |
| **TOTAL** | **755** |

For the 744 rows written by this backfill: HIGH 398 / LOW 224 / MEDIUM 122 (all non-null).

---

## 4. Tier distribution after Option A application (all 755 classified rows)

| Tier | Count |
|---|---|
| 1 | 376 |
| 2 | 163 |
| 3 | 110 |
| 4 | 71 |
| 5 | 34 |
| 6 | 1 |
| 7 | 0 |
| **TOTAL** | **755** |

**Tier 7 = 0** — no rows landed at tier 7. Tier 7 is reserved for legacy outliers; the AMBIGUOUS bucket (still NULL) is where most tier-7-flagged rows live, which is the expected outcome of Option A plus the AMBIGUOUS gating.

---

## 5. Per-batch deltas

| Batch | Window (start..end) | Updated | Skipped | Tier overrides | Errors | Log |
|---|---|---|---|---|---|---|
| 5 | [400..500) | 100 | 0 | 0 | 0 | `docs/source-classification-batch-5-log-2026-05-11.md` |
| 6 | [500..600) | 100 | 0 | 0 | 0 | `docs/source-classification-batch-6-log-2026-05-11.md` |
| 7 | [600..700) | 100 | 0 | 0 | 0 | `docs/source-classification-batch-7-log-2026-05-11.md` |
| 8 | [700..800) — capped at 744 | **44** | 0 | 0 | 0 | `docs/source-classification-batch-8-log-2026-05-11.md` |
| **Total this run** | — | **344** | 0 | **0** | **0** | — |

Pre-flight `COUNT(*)` series: 411 → 511 → 611 → 711 → 755.

(Batches 1-4 were run in prior sessions and contributed the first 411 - 11 legacy = 400 rows.)

---

## 6. AMBIGUOUS bucket — 39 rows still NULL

All 39 remain awaiting per-row operator decisions. Listed below with `name`, `url`, and the JSON `rationale`. (`notes` was null for every entry.)

| # | id | name | url | item_count | rationale |
|---|---|---|---|---|---|
| 1 | `19f69037-3d39-4482-8359-0bfe3f9f6ae3` | Tyndall Centre for Climate Change Research (tyndall.ac.uk) | https://tyndall.ac.uk/reports/decarbonising-the-uk-energy-in-a-climate-conscious-future/ | 1 | host: .ac academic; tier 7 legacy outlier per framework Section 2 |
| 2 | `1a760dfb-1e89-4416-a594-8d92778fb2e4` | National Renewable Energy Laboratory (NREL) / U.S. Department of Energy | https://www.nrel.gov/transportation/research | 1 | host: US national lab; tier 7 legacy outlier per framework Section 2 |
| 3 | `1af0488e-77de-4319-b54f-816e00d3ef4c` | Taylor & Francis (Taylor and Francis Group) | https://www.tandfonline.com/journals/ujst20 | 1 | host: Peer-reviewed journal; tier 7 legacy outlier per framework Section 2 |
| 4 | `1af654f1-b9bd-45b2-8a14-3fa1451feabb` | Camera dei Deputati – Italian Chamber of Deputies | https://www.camera.it/ | 1 | tier 1-2 default; name suggests industry_association (review) |
| 5 | `3177adf4-fa70-4c3c-91c6-110ce01cc4d9` | eFuel Alliance e.V. | https://www.efuel-alliance.eu/initiative | 1 | tier 4 default; name suggests industry_association (review) |
| 6 | `4d2e0f8a-0238-4316-9d88-079aeefd71e7` | Sustainable Packaging Coalition (a project of GreenBlue) | https://sustainablepackaging.org/ | 1 | tier 4 default; name suggests industry_association (review) |
| 7 | `4e1b00cd-82e9-4e27-9f04-5cc86ab074fd` | AAPA (American Association of Port Authorities) | https://www.aapa-ports.org/ | 1 | tier 4 default; name suggests industry_association (review) |
| 8 | `4e29f93f-f3ff-42e5-b26e-a17a7a623d96` | Cranfield University – School of Management | https://www.cranfield.ac.uk/som/research-centres/centre-for-logistics-procurement-and-supply-chain-management | 1 | host: .ac academic; tier 7 legacy outlier per framework Section 2 |
| 9 | `5013b7c3-1aad-4afa-9508-304caf55b56a` | MIT Sustainable Supply Chain Lab (hosted under MIT CTL) | https://sustainable.mit.edu/sustainable-transportation/ | 1 | host: US R1 university; tier 7 legacy outlier per framework Section 2 |
| 10 | `5025e77d-75d7-4f9b-9dee-c54630f67b1f` | Sustainable Packaging Coalition (a project of GreenBlue) | https://sustainablepackaging.org/about-us/ | 1 | tier 4 default; name suggests industry_association (review) |
| 11 | `56dff28e-afa1-4bfa-9b1d-e999e37802b6` | National Renewable Energy Laboratory (NREL) / National Laboratory of the Rockies (NLR) | https://www.nrel.gov/transportation/research | 1 | host: US national lab; tier 7 legacy outlier per framework Section 2 |
| 12 | `6b9e5e97-6b69-4790-a3c6-0bf821631170` | Fraunhofer Institute for Material Flow and Logistics (IML) | https://www.iml.fraunhofer.de/en/institute_profile.html | 1 | tier 7 legacy outlier (flag for review); tier 7 legacy outlier per framework Section 2 |
| 13 | `73ff74a2-6c97-4ad2-a008-c230b5168ce4` | Commercial Carrier Journal | https://www.ccjdigital.com | 1 | tier 4 default; press-style name (review) |
| 14 | `8b7b0db2-0274-4446-93a9-b3d0548a3a3b` | Stockholm Environment Institute (SEI) | https://www.sei.org/about-sei/ | 1 | tier 7 legacy outlier (flag for review); tier 7 legacy outlier per framework Section 2 |
| 15 | `a386a21f-2fe4-42b8-bb27-1d7c20a10f5e` | National Laboratory of the Rockies (NLR) — formerly NREL | https://www.nlr.gov/transportation | 1 | host: .gov domain; tier 7 legacy outlier per framework Section 2 |
| 16 | `a4dc8935-b270-4a04-bd25-a4b95222be87` | ZEMBA (Zero Emission Maritime Buyers Alliance) | https://www.shipzemba.org/ | 1 | tier 4 default; name suggests industry_association (review) |
| 17 | `addc7d05-cb54-4a70-99a4-1b0f85308bff` | MIT Climate Machine (Massachusetts Institute of Technology) | https://climatemachine.mit.edu/ | 1 | host: US R1 university; name suggests industry_association (review); tier 7 legacy outlier per framework Section 2 |
| 18 | `b04ddc7f-ed89-4c6d-a401-237b621ee62a` | Tyndall Centre for Climate Change Research (tyndall.ac.uk) | https://tyndall.ac.uk/research/reaching-zero-emissions/ | 1 | host: .ac academic; tier 7 legacy outlier per framework Section 2 |
| 19 | `b8ff2ebb-ab9a-456c-b3c9-8f869fb64f88` | Centre for Sustainable Road Freight | https://www.csrf.ac.uk/about/ | 1 | host: .ac academic; tier 7 legacy outlier per framework Section 2 |
| 20 | `ba4e0a5f-bc72-45e3-b938-e65f3e02ccbd` | Maritime Carbon Intelligence | https://maritimecarbonintelligence.com/contact-us/ | 1 | tier 7 legacy outlier (flag for review); tier 7 legacy outlier per framework Section 2 |
| 21 | `c096820c-e857-4173-b60d-9af004a0d73d` | Centre for Sustainable Road Freight (University of Cambridge / Heriot-Watt University / University of Westminster) | https://www.csrf.ac.uk/ | 1 | host: .ac academic; tier 7 legacy outlier per framework Section 2 |
| 22 | `c2549c0a-e9ed-40f9-99b0-32efe9fdd2b8` | eFuel Alliance e.V. | https://www.efuel-alliance.eu/ | 1 | tier 4 default; name suggests industry_association (review) |
| 23 | `c61453df-4e9b-4d9e-9ff9-4a6912c6af62` | World Bank Independent Evaluation Group (IEG) | https://ieg.worldbankgroup.org/topic/transport | 1 | tier 3 default; corporate suffix in name (review) |
| 24 | `c63911ec-97ec-4bd4-9d32-57d5211975c0` | Fraunhofer Institute for Material Flow and Logistics (IML) | https://www.iml.fraunhofer.de/en.html | 1 | tier 7 legacy outlier (flag for review); tier 7 legacy outlier per framework Section 2 |
| 25 | `ce0f5d88-f986-43e6-8c23-6c13ee88ff3e` | National Renewable Energy Laboratory (NREL) / U.S. Department of Energy | https://www.nrel.gov/transportation/ | 1 | host: US national lab; tier 7 legacy outlier per framework Section 2 |
| 26 | `d5d9b939-9153-4a7a-8b3c-27e637e3c1c3` | TIACA (The International Air Cargo Association) | https://www.tiaca.org/ | 1 | tier 4 default; name suggests industry_association (review) |
| 27 | `dcb667a7-c489-478b-97a6-8c82e451c4b6` | BRE Group (Building Research Establishment) | https://www.breeam.com/ | 1 | tier 4 default; corporate suffix in name (review) |
| 28 | `e28f5449-78c8-474c-9176-a190eec65f18` | Cranfield University – School of Management | https://www.cranfield.ac.uk/som/research-centres/centre-for-logistics-procurement-and-supply-chain-management/research-projects-current-and-past | 1 | host: .ac academic; tier 7 legacy outlier per framework Section 2 |
| 29 | `e2e75b20-0d6c-448a-950d-32ec401d6af4` | Centre for Sustainable Road Freight | https://www.csrf.ac.uk/technical-reports/ | 1 | host: .ac academic; tier 7 legacy outlier per framework Section 2 |
| 30 | `e38fc134-512a-48c3-9547-42a81efc6d26` | World Resources Institute (WRI) | https://www.wri.org/ | 1 | host: Think tank; tier 7 legacy outlier per framework Section 2 |
| 31 | `f6df1063-b507-4a9c-bb3a-017e017d63cd` | Erasmus University Rotterdam – ERIM | https://www.erim.eur.nl/centres/smartporterasmus/ | 1 | tier 7 legacy outlier (flag for review); name suggests academic_research (review); tier 7 legacy outlier per framework Section 2 |
| 32 | `290deb87-4eab-48c9-aeef-63342b9a11d3` | ZEV Alliance | https://www.zevalliance.org | 0 | tier 3 default; no item history (downgrade from HIGH); name suggests industry_association (review) |
| 33 | `2db29c29-56f4-4779-ae0f-71bcf7a90915` | GCCA — Global Cold Chain Alliance | https://www.gcca.org | 0 | tier 3 default; no item history (downgrade from HIGH); name suggests industry_association (review) |
| 34 | `55800ddc-ef49-4129-9ec8-c1451a7f6d0d` | International Renewable Energy Agency (IRENA) & Ammonia Energy Association (AEA) | https://www.irena.org/publications/2022/May/Innovation-Outlook-Renewable-Ammonia | 0 | host: IRENA; no item history (downgrade from HIGH); name suggests industry_association (review) |
| 35 | `5b96c1d6-d3dd-4611-b600-fa9af61f9f79` | Clean Shipping Coalition | https://www.cleanshipping.org | 0 | tier 4 default; no item history (downgrade from HIGH); name suggests industry_association (review) |
| 36 | `88239c3d-e188-447d-a031-2952e945ee1f` | Chalmers University Marine Environment | https://www.chalmers.se/en/departments/m2/ | 0 | tier 1-2 default; no item history (downgrade from HIGH); name suggests academic_research (review) |
| 37 | `8f7db0b5-d2b2-442f-93cd-877fb1fd0384` | Building Performance Standards Coalition | https://www.buildingperformancestandards.org | 0 | tier 3 default; no item history (downgrade from HIGH); name suggests industry_association (review) |
| 38 | `913ec2b0-ca67-4680-b926-9732b8de979e` | ATAG — Air Transport Action Group | https://www.atag.org | 0 | tier 3 default; no item history (downgrade from HIGH); corporate suffix in name (review) |
| 39 | `af78aadc-ea59-4db0-9e2e-e248d6464239` | Camera Deputaților – Chamber of Deputies of Romania | https://www.cdep.ro/ | 0 | tier 1-2 default; no item history (downgrade from HIGH); name suggests industry_association (review) |

---

## 7. URL-split-flagged bucket — verified 0

`split_flagged_dropped` was 0 in every batch's `[FILTER]` line and `summary.split_flagged_in_json = 0` in the post-run reconciliation. No URL-split workstream needed.

---

## 8. Anything unexpected — 11 legacy pre-backfill rows

Reconciliation showed `final_classified_count = 755`, not the predicted 744. The 11-row delta is fully accounted for: every one of these rows was assigned exactly at `2026-05-10T21:20:49.144+00:00` (a single earlier write batch) and carries `classification_confidence = NULL`. None of them appear in `_backfill-classify-out.json`'s `classified` list, so the 12-batch backfill could not have written them and none were re-touched (all 4 batches reported `skipped_already_classified = 0` because the JSON intermediary doesn't include them).

| id | name | role | tier |
|---|---|---|---|
| `0768a0d2-4f2e-4b4f-a84e-05084c107f79` | American Alliance of Museums (AAM) | industry_association | 5 |
| `1d0265c2-38ce-463e-befb-f623146ee517` | European Commission DG FISMA (finance) | primary_legal_authority | 1 |
| `2d27b8d9-96cb-4843-9df4-5dc31315d514` | European Banking Authority (EBA) | primary_legal_authority | 1 |
| `390fb3eb-c17c-474e-9783-d0c71822c37b` | US Securities and Exchange Commission (SEC) | primary_legal_authority | 1 |
| `5cb7d618-f2ef-47ff-8b89-d9a512b427bc` | Gallery Climate Coalition (about + resources) | industry_association | 5 |
| `7aa784cf-6765-4e60-bc56-8fb884897261` | European Securities and Markets Authority (ESMA) | primary_legal_authority | 1 |
| `7fd006b9-e51a-4adc-b92d-8a8a48654168` | International Institute for Conservation (IIC) | industry_association | 5 |
| `bb01d11f-edea-4eee-aab6-cf531305101a` | ICOM Committee for Conservation (ICOM-CC) | industry_association | 5 |
| `c75ea058-f29a-4606-a76e-bb0295565958` | UK Financial Conduct Authority (FCA) | primary_legal_authority | 1 |
| `e1cf70bc-7981-4c83-b9f3-bae57b035cee` | Carbon Pulse | trade_press | 5 |
| `f81c2cd0-2627-4e92-aa07-478ef395c2a2` | Gallery Climate Coalition (research) | academic_research | 3 |

These look reasonable on inspection. Optional: backfill `classification_confidence` and `classification_rationale` for these 11 in a future cleanup pass; not blocking.

---

## HOLD

Phase 1 routing PR can now proceed. The 5-axis classification backfill is complete: 744/744 candidate rows from the JSON intermediary written, 0 errors, 0 tier overrides, 0 URL-split rows. The 39 AMBIGUOUS rows are explicitly held for per-row operator decisions and do NOT block routing.

## Related

- [sources-content-verification-2026-05-11](./sources-content-verification-2026-05-11.md) — That audit verifies these classified rows (same 2026-05-10T21:20:49 write batch, Task 6 11-source subset)
- [SOURCE-TYPE-TAXONOMY-PROPOSAL](../plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md) — Defines the source_role vocabulary (primary_legal_authority, intergovernmental_body, trade_press, etc.) whose distribution this doc tabulates
- [classification-backfill-ambiguous-2026-05-22](../plans/classification-backfill-ambiguous-2026-05-22.md) — Later plan that dispositions the 39 AMBIGUOUS rows this summary left NULL for operator review
- [source-classification-framework-2026-05-10](../plans/source-classification-framework-2026-05-10.md) — This backfill applies that framework's role vocabulary + Section 2 tier-7-legacy-outlier rules (rationale strings cite it verbatim)

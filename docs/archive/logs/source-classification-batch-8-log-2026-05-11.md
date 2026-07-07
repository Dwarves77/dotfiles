# Source classification backfill — batch 8

**Generated:** 2026-05-11T14:12:10.501Z
**Halted on error:** no

## Summary

| Metric | Value |
|---|---|
| Total classified rows in JSON | 783 |
| Dropped (AMBIGUOUS) | 39 |
| Dropped (URL-split flagged) | 0 |
| Candidates after filter | 744 |
| Selected for batch 8 | 44 |
| UPDATEs issued (success) | 44 |
| Skipped — already classified | 0 |
| Skipped — read fail / other | 0 |
| Tier overrides | 0 |
| Errors | 0 |

## Tier overrides by direction

_none_

## Role distribution (this batch)

| Role | Count |
|---|---|
| primary_legal_authority | 34 |
| academic_research | 5 |
| intergovernmental_body | 3 |
| standards_body | 2 |

## Confidence distribution (this batch)

| Confidence | Count |
|---|---|
| MEDIUM | 29 |
| LOW | 15 |

## Notes / schema gaps

- Migration 067 (2026-05-10) added classification_confidence and classification_rationale to public.sources. Per-row UPDATE now writes 12 fields atomically.

## Per-row log

| # | id | name | items | role | tier (existing → new) | confidence | action |
|---|---|---|---|---|---|---|---|
| 1 | `acee8946-987f-4392-8ee7-44d1d7c25bfb` | Arizona Department of Environmental Quality (ADEQ) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 2 | `b0aef8f8-7c65-431a-b110-f92e3b3c5c0c` | US CBP — Customs & Border Protection | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 3 | `b1c023a0-c95e-4ec4-b300-7901f36d8ab1` | Newfoundland and Labrador House of Assembly | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 4 | `b491ab5c-0e1a-4d8d-86c4-36b1df3dce31` | Regulations.gov | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 5 | `b550de65-5e9a-451b-89ee-daf240551859` | IMO ISPS Code | 0 | intergovernmental_body | T1 → T1 keep | MEDIUM | UPDATED |
| 6 | `b558cfa4-1b42-4456-97b6-5cda7770376f` | Assembleia da República | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 7 | `b711bb3a-7452-460a-b413-25b20f13bad3` | Environment and Resources Authority (ERA) | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 8 | `bbcd0ad4-2886-459a-9a97-eef59b2d8852` | RMI — Rocky Mountain Institute Aviation | 0 | academic_research | T4 → T4 keep | MEDIUM | UPDATED |
| 9 | `bd336e46-60cf-4b70-bfd6-6376ad404a68` | Országgyűlés – National Assembly of Hungary | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 10 | `be829d1f-231c-4db6-81c7-d4ed5e65d6e2` | WBCSD Pathfinder Framework | 0 | academic_research | T2 → T2 keep | MEDIUM | UPDATED |
| 11 | `c1342ac0-8251-4c17-b506-db50416dd3ec` | WCO — World Customs Organization | 0 | intergovernmental_body | T1 → T1 keep | MEDIUM | UPDATED |
| 12 | `c1c527fa-fa10-46c9-9667-7c47edc60974` | Estidama Pearl Rating System | 0 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 13 | `c2ef7d4e-8108-494e-9651-f4b1c93e34a2` | US CBP Forced Labor — UFLPA | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 14 | `c54066d0-ffa0-43fc-9dc7-c07eeafa1c8f` | BIS — Bureau of Industry and Security | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 15 | `c888c55d-c5a5-4c61-9cb4-4da14422d509` | SBTN — Science Based Targets Network | 0 | standards_body | T3 → T3 keep | MEDIUM | UPDATED |
| 16 | `c8f78055-dd54-4d89-8a4d-d65aae2a885d` | ClassNK Environmental | 0 | standards_body | T4 → T4 keep | MEDIUM | UPDATED |
| 17 | `cc11069e-0350-4500-8322-b872b2f325f4` | European Commission – DG MOVE (Directorate-General for Mobil | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 18 | `cdce56bf-04e9-4102-9d70-ad40db2db704` | SEC Climate Disclosure Rule | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 19 | `cf6d4da3-6fa3-46d6-b949-eb147d57fd50` | Atlanta City Council | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 20 | `cfb3de8a-dbe5-42cb-bb4a-f6b65d6f6bab` | Japan Customs — MOF | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 21 | `d31e908f-873e-4f9b-a97a-e8cb6a4a123c` | Department of Climate Change, Energy, the Environment and Wa | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 22 | `d57b213b-01d7-443b-817d-9f03943aa3a9` | Washington State Department of Ecology – Air & Climate Divis | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 23 | `d5c2638f-b5a3-41d3-941d-0aa321c6b91e` | Ministry of Oceans and Fisheries, Republic of Korea | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 24 | `d641dc78-7d9c-4c88-8d25-fd166dae91ff` | Minnesota Public Utilities Commission (PUC) | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 25 | `d958833b-2ee6-44b2-afd9-ec0e0252f5e5` | Bundesministerium für Verkehr (BMV) / German Federal Governm | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 26 | `da68e53b-4f26-4828-9413-51971b142723` | IRENA Publications | 0 | intergovernmental_body | T1 → T1 keep | MEDIUM | UPDATED |
| 27 | `dbb217d8-19c2-4f86-b481-eb076026f898` | New Hampshire Department of Environmental Services (NHDES) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 28 | `dc907f90-0347-44c6-962b-ac052aef42f3` | Federal Register | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 29 | `de8eea1b-926b-4fec-9934-0675c4cd02de` | Los Angeles City Council | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 30 | `e267a65c-1110-4fcb-8f50-bbd234069763` | INTERTANKO — Independent Tanker Owners | 0 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 31 | `e2fa9583-ada5-45aa-986a-888b7efa349f` | Eduskunta (Parliament of Finland) | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 32 | `e421ae49-28a2-40ec-8c52-81133a0b87f3` | EU EPBD Recast — Energy Performance of Buildings | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 33 | `e43b64a1-0469-4232-9639-03ee0733be8c` | Parliament of Western Australia | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 34 | `e6342fcd-872c-4fd7-9f3c-79c107414f58` | Wisconsin State Legislature | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 35 | `e6e99900-0463-437b-9126-30e9bd57266e` | U.S. Department of Transportation (USDOT) | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 36 | `ebe50cec-0fd6-4150-9d3b-2011c6c8d923` | Senatsverwaltung für Mobilität, Verkehr, Klimaschutz und Umw | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 37 | `ec02878a-4289-4d16-b383-b44818225e3c` | Singapore Customs | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 38 | `f0fb0b4a-52ba-480b-8de4-7fb6830b7b4a` | Sustainable Aviation UK | 0 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 39 | `f364eacd-974f-4521-82e1-7d47292c7332` | OFAC — US Treasury Sanctions | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 40 | `f4946a56-8854-4e0a-8e85-014316ef54e8` | Commission for Environmental Cooperation (CEC) | 0 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 41 | `f67106c2-6cf1-47fa-a3a9-b42d8d0011f7` | Rules and Regulations of the State of Georgia (GA SOS) | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 42 | `f8721185-8c86-4b5d-a202-718a36e88ceb` | Seattle City Council | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 43 | `f968026e-ec27-409e-adcf-81a6645a31f8` | Parliament of Tasmania | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 44 | `fbbacc94-d511-4f3e-8738-64f861ed2851` | Council of the European Union | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |

---

HOLD — batch 9 awaits operator approval

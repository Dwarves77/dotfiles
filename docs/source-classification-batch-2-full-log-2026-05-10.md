# Source classification backfill — batch 1

**Generated:** 2026-05-11T01:45:10.396Z
**Halted on error:** no

## Summary

| Metric | Value |
|---|---|
| Total classified rows in JSON | 783 |
| Dropped (AMBIGUOUS) | 39 |
| Dropped (URL-split flagged) | 0 |
| Candidates after filter | 744 |
| Selected for batch 1 | 100 |
| UPDATEs issued (success) | 93 |
| Skipped — already classified | 7 |
| Skipped — read fail / other | 0 |
| Tier overrides | 0 |
| Errors | 0 |

## Tier overrides by direction

_none_

## Role distribution (this batch)

| Role | Count |
|---|---|
| primary_legal_authority | 69 |
| intergovernmental_body | 11 |
| statistical_data_agency | 7 |
| academic_research | 3 |
| industry_association | 2 |
| trade_press | 1 |

## Confidence distribution (this batch)

| Confidence | Count |
|---|---|
| HIGH | 63 |
| LOW | 30 |

## Notes / schema gaps

- Migration 067 (2026-05-10) added classification_confidence and classification_rationale to public.sources. Per-row UPDATE now writes 12 fields atomically.

## Per-row log

| # | id | name | items | role | tier (existing → new) | confidence | action |
|---|---|---|---|---|---|---|---|
| 1 | `2d150967-be7a-476f-bfe4-33ed871e9653` | Massachusetts Legislature (General Court) – Session Laws & M | 1 | - | - | - | SKIP_ALREADY_CLASSIFIED |
| 2 | `2dd40334-abc1-4bd7-a4bf-b6fe7f75d038` | Port of Los Angeles (Los Angeles Harbor Department) | 1 | - | - | - | SKIP_ALREADY_CLASSIFIED |
| 3 | `2dff892f-eafb-4b88-8e9b-0746675e6fea` | BizClik Media (Sustainability Magazine) | 1 | - | - | - | SKIP_ALREADY_CLASSIFIED |
| 4 | `2e1ca35a-97fa-46bb-a719-27c36d613f58` | National Renewable Energy Laboratory (NREL) | 1 | - | - | - | SKIP_ALREADY_CLASSIFIED |
| 5 | `2e34415c-4afc-44dd-8c2b-9e137afbe31d` | Lloyd's Register Maritime Decarbonisation Hub (thedecarbhub. | 1 | - | - | - | SKIP_ALREADY_CLASSIFIED |
| 6 | `2edabd99-e523-465e-98e1-d10186eb42e0` | Wyoming Secretary of State – Administrative Rules Repository | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 7 | `2efe7fd6-2445-4ebb-85d1-61c1c5f7976f` | Infra S.A. (formerly EPL — Empresa de Planejamento e Logísti | 1 | primary_legal_authority | T3 → T3 keep | HIGH | UPDATED |
| 8 | `2f0cf633-da54-45fc-bbbf-cdb1d2383f94` | California Highway Patrol (CHP) – Commercial Vehicle Section | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 9 | `2f0e6c2d-29a4-47d7-b467-3708bd2a2001` | American Samoa Fono (Legislature) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 10 | `2f69eb94-c8f5-43a3-97df-5c1ae60f329f` | NYC Local Law 84/97 — Benchmarking & Carbon Limits | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 11 | `2f7e1fcf-17b4-40e3-9770-2f54afd14ce9` | Legislative Assembly of Manitoba | 1 | - | - | - | SKIP_ALREADY_CLASSIFIED |
| 12 | `306c0fb8-6a54-47af-a4d9-973ccc3f70b7` | International Renewable Energy Agency (IRENA) | 1 | - | - | - | SKIP_ALREADY_CLASSIFIED |
| 13 | `312350c1-56e0-443f-84e6-0f892b48cfef` | Joint Office of Energy and Transportation (U.S. DOE / U.S. D | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 14 | `319197ff-6f89-40ee-a7a6-f20ec57a55ad` | Hawai‘i Department of Health – Clean Air Branch & Environmen | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 15 | `31fcfca8-577d-46ec-a36a-9cdcd021bb2e` | UNCTAD (UN Trade and Development) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 16 | `340f897d-5560-4e1b-9c41-937eb91124c3` | TNO (Netherlands Organisation for Applied Scientific Researc | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 17 | `3424ed5b-6468-438e-8725-2800c1f91121` | City of Melbourne (Participate Melbourne) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 18 | `357d58d1-bf83-4882-983d-9217728e4edf` | International Maritime Organization (IMO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 19 | `3594e5a7-16f4-4681-bfec-2c836dca23f1` | Deutscher Bundestag | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 20 | `363abb3f-921f-47fe-9bb3-e085c70c0c91` | EUR-Lex / Official Journal of the European Union | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 21 | `3654fc96-0f23-43d7-8fe9-8403fed5f927` | Blue Visby Consortium (co-ordinated by NAPA Oy & Stephenson  | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 22 | `365899e7-d590-40b4-939d-ccf495c2757e` | International Renewable Energy Agency (IRENA) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 23 | `36978885-cb83-4af3-816d-4d3536a5cce8` | Idaho Department of Environmental Quality (DEQ) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 24 | `380f837a-615e-4fac-bac8-aa94b6124842` | Presidência da República / Casa Civil – planalto.gov.br | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 25 | `3819e20d-0bf4-48d1-91d3-c2ddb5dcfc12` | Riigikogu – Parliament of Estonia | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 26 | `384cd037-f08a-48dc-830a-1fb9e546d462` | Georgia Environmental Protection Division (EPD) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 27 | `38b755c0-4ad2-4e2d-b7ff-0a477cb5ff8f` | CCICED Secretariat | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 28 | `393f7044-5bff-4881-86c0-dd7b19826fab` | North Carolina General Assembly – Enacted Legislation & Gene | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 29 | `399634c0-9665-4759-8bf6-c4d3e2af6d96` | ILOSTAT | 1 | intergovernmental_body | T1 → T1 keep | HIGH | UPDATED |
| 30 | `3a08ee19-df3b-45fb-8d7a-3a59f06eb330` | Intergovernmental Panel on Climate Change (IPCC) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 31 | `3ab405f6-8b50-4101-9c60-16f71ffd8aef` | EEA EU ETS Data Viewer | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 32 | `3b3b18c7-2527-44a7-aba1-9a550de7a52b` | Singapore Statutes Online | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 33 | `3b860d5e-b972-450f-ba73-518bee466061` | Maine Department of Environmental Protection (Maine DEP) – A | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 34 | `3bb31d52-88ec-4f55-bf2e-b757c627e89c` | IEA Energy Prices Database | 1 | intergovernmental_body | T1 → T1 keep | HIGH | UPDATED |
| 35 | `3c5327fb-3124-48da-b075-a5874d1f2008` | City of Los Angeles City Clerk | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 36 | `3cb91963-21a2-418e-bc33-fa391fd96d38` | Legislative Assembly of British Columbia | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 37 | `3d80cc5f-d4bf-4070-817c-eb00cd15fad7` | Kansas Highway Patrol (KHP) – Commercial Vehicle Enforcement | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 38 | `3d828dbb-4eda-44fc-84e4-ed92ae7b4220` | Puerto Rico Department of Natural and Environmental Resource | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 39 | `3dc47005-10c5-4232-bb1d-41a9ec75bfb2` | Solargis Global Solar Atlas | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 40 | `3df9eae5-473c-4900-9900-3a475a7d53ee` | ICCT Freight | 1 | academic_research | T4 → T4 keep | HIGH | UPDATED |
| 41 | `3f7ad273-3503-4c15-aba1-11729f0725cc` | U.S. Bureau of Labor Statistics / Federal Reserve Bank of St | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 42 | `408eb843-a94e-46d4-9249-6eec36502884` | Natural Resources Wales (Cyfoeth Naturiol Cymru) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 43 | `410466f8-21d2-4d51-a601-f1dc71923683` | Sabin Center Climate Laws Database | 1 | trade_press | T5 → T5 keep | LOW | UPDATED |
| 44 | `4106260f-f2d2-49e7-b238-c9aaf3e15487` | Ministry of the Environment of Japan (環境省 / MOEJ) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 45 | `413c42ec-ff72-4a5b-a85a-ff5c1bf532fd` | European Sea Ports Organisation (ESPO) / EcoPorts | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 46 | `4140b9d2-62db-4e9d-83a4-37b7421b2343` | World Trade Organization (WTO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 47 | `41c1cadd-f6b2-4f56-8e22-ba4dd6db9a9c` | EUR-Lex (Official Journal / European Commission) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 48 | `42a72f10-a937-4500-b70f-adebd03b5a49` | Metropolitan Government of Nashville and Davidson County – D | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 49 | `439ae53e-4446-4537-a173-3909b13bf875` | U.S. Environmental Protection Agency (EPA) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 50 | `44602a3b-a647-4e78-86d0-08820066a81b` | Manitoba Environment and Climate Change | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 51 | `44ddd506-81ea-4e7c-beef-33de2933e5fb` | EUR-Lex / Official Journal of the European Union | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 52 | `46379f0b-c77d-4b99-a6d4-a3ca9a8d066a` | SmartPort (partnership of EUR, TU Delft, Port of Rotterdam A | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 53 | `4663bf16-d7f0-41cf-befd-c38da3549ab8` | New Brunswick Department of Environment and Climate Change | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 54 | `46beff65-0d00-490a-8363-db1e85120b99` | Ley Chile | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 55 | `4703866f-cf2a-49e6-b5ec-9671f8a8e112` | International Renewable Energy Agency (IRENA) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 56 | `47895045-ee7b-474a-ae01-0249cd2c4d88` | World Trade Organization (WTO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 57 | `47fd8e2e-d1ae-4a81-b6b3-ed74d4763957` | Główny Inspektorat Ochrony Środowiska (GIOŚ) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 58 | `48cc84e3-d78e-4fec-8923-5cdc4ecb652d` | Los Angeles Department of Building and Safety (LADBS) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 59 | `495d392a-7439-498c-923b-10564050d9a6` | Queensland Department of Environment, Tourism, Science and I | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 60 | `49b28864-8179-4107-b518-bf7d9130ce6a` | City of Los Angeles — Departments & Bureaus | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 61 | `4a8f3ba3-0abc-497b-a5a0-eaf4f1c88eec` | Pennsylvania Code & Bulletin (pacodeandbulletin.gov) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 62 | `4a956756-9117-451e-b3f1-1e976dd79e39` | EcoVadis | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 63 | `4ae80922-49e4-429b-97af-5ed4012fb42b` | Legislative Assembly of Puerto Rico (Oficina de Servicios Le | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 64 | `4b24f2e1-1d34-4b65-b4a9-e4f3620a297e` | OECD | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 65 | `4bd7d688-d76c-401c-86da-55c17bad7445` | Texas Legislature Online | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 66 | `4bdce3c6-f79e-48d4-b8b3-804ec98a55a8` | California Environmental Protection Agency (CalEPA) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 67 | `4bfde4f6-cffc-4bff-88b9-9c94c9db5db8` | Nevada Division of Environmental Protection (NDEP) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 68 | `4c6f45e9-c0ea-4dff-9fe8-37ab043644bb` | EUR-Lex / Official Journal of the European Union | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 69 | `4c97d1ce-7153-4474-a990-d4e85f113646` | Ministry of Ecology and Environment (MEE), People's Republic | 1 | primary_legal_authority | T3 → T3 keep | HIGH | UPDATED |
| 70 | `4cb5897b-a78d-42ad-b04c-93e80f69b3ef` | Companies House / GOV.UK | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 71 | `4d37573e-14b1-4531-9629-92605571e404` | Wisconsin Department of Natural Resources – Air Program | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 72 | `4d5ba9b0-0cda-4534-9171-71177ed7b975` | Washington State Department of Transportation (WSDOT) – Frei | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 73 | `4dd807b9-9857-4e3e-b61d-082f8d2842d1` | Utility Regulator Northern Ireland | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 74 | `4ebe9bba-5fb0-48a5-a601-1974e1bcc73c` | Environmental Protection Department (EPD), Hong Kong SAR | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 75 | `4fdb662c-3ab1-4987-b754-5530c9e511e1` | EcoVadis | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 76 | `4ff469ca-5d44-4814-ac28-5bc9cf2d3feb` | UK Department for Transport via assets.publishing.service.go | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 77 | `500b249e-fc60-4cd5-bc38-96c1502191fd` | Nova Scotia Department of Environment and Climate Change | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 78 | `5012a359-bb4b-44f7-b28a-e9b976383051` | North Dakota Department of Environmental Quality (NDDEQ) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 79 | `511b8cdb-2071-48cb-8d3b-6e271613e900` | Hawaii State Energy Office (HSEO) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 80 | `53581e0d-12ef-4ad7-9462-483bbd693b34` | Rijksinstituut voor Volksgezondheid en Milieu (RIVM) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 81 | `5370c7f4-3f67-4701-8545-1905c6c1ee37` | Miljøministeriet (Ministry of Environment of Denmark) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 82 | `543d6c68-da55-4a66-8e41-474c4ddc3717` | UK Department for Environment, Food & Rural Affairs (DEFRA) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 83 | `54ab5d60-afd8-4417-b7ca-ae569aba7562` | International Air Transport Association (IATA) | 1 | industry_association | T4 → T4 keep | HIGH | UPDATED |
| 84 | `54c1ea8f-c6e9-4ae3-9cea-d048a1ce6f0b` | NYC Department of Buildings | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 85 | `559687e8-45cb-4ed6-a78e-ed58ca63d3be` | Michigan Department of Environment, Great Lakes, and Energy  | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 86 | `55a4cd0c-7d3f-4084-bf96-2b29aa5cbc15` | Idaho Legislature – Idaho Statutes & Idaho Administrative Co | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 87 | `55ac3187-6b19-4cfe-86d3-6e2dd291d400` | New Mexico Legislature – New Mexico Statutes Annotated (NMSA | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 88 | `55aedb41-0ac7-40cb-a3fd-b06c0a8f8032` | San Francisco Department of the Environment (SF Environment) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 89 | `56a5763d-95f8-4af9-831a-ef7738ca8b62` | Lloyd's Register Foundation (lrfoundation.org.uk) | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 90 | `5766d220-756f-4f78-844f-f6733c92ade7` | NT Legislation – Northern Territory Legislation Website | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 91 | `58148ad8-df16-40e8-84de-93504271cba0` | IRU Environment | 1 | industry_association | T5 → T5 keep | HIGH | UPDATED |
| 92 | `5823b4b1-0de4-4290-addd-bf939ae748c8` | Ministrstvo za okolje, podnebje in energijo (MOPE) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 93 | `584a0085-e145-4a53-8918-a77630845b59` | Vides aizsardzības un reģionālās attīstības ministrija (VARA | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 94 | `586ebf7c-0146-4d0e-871d-db604490e358` | Ministère de l'Environnement, de la Lutte contre les changem | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 95 | `58fb7e21-b1b3-4b51-8606-dfad928d157d` | National Renewable Energy Laboratory (NREL) | 1 | academic_research | T4 → T4 keep | HIGH | UPDATED |
| 96 | `58ffd350-38b1-429a-9f82-aaa96cc7b193` | South Carolina General Assembly (SC Statehouse) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 97 | `592129fc-2313-44d6-b252-64d494bdfaa6` | Houses of the Oireachtas (Irish Parliament) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 98 | `593a9a84-46ad-440a-a1f7-746a155e8736` | Ohio General Assembly | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 99 | `593f30c6-8a88-4dc5-8a33-3214fa07bcf7` | United Nations Department of Economic and Social Affairs (UN | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 100 | `594c9aec-707f-43a5-9538-7f00d2b79437` | Cortes Generales – Congreso de los Diputados | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |

---

HOLD — batch 2 awaits operator approval

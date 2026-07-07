# Source classification backfill — batch 4

**Generated:** 2026-05-11T02:38:44.882Z
**Halted on error:** no

## Summary

| Metric | Value |
|---|---|
| Total classified rows in JSON | 783 |
| Dropped (AMBIGUOUS) | 39 |
| Dropped (URL-split flagged) | 0 |
| Candidates after filter | 744 |
| Selected for batch 4 | 100 |
| UPDATEs issued (success) | 100 |
| Skipped — already classified | 0 |
| Skipped — read fail / other | 0 |
| Tier overrides | 0 |
| Errors | 0 |

## Tier overrides by direction

_none_

## Role distribution (this batch)

| Role | Count |
|---|---|
| primary_legal_authority | 64 |
| academic_research | 9 |
| intergovernmental_body | 9 |
| trade_press | 8 |
| statistical_data_agency | 7 |
| standards_body | 2 |
| industry_association | 1 |

## Confidence distribution (this batch)

| Confidence | Count |
|---|---|
| HIGH | 70 |
| LOW | 30 |

## Notes / schema gaps

- Migration 067 (2026-05-10) added classification_confidence and classification_rationale to public.sources. Per-row UPDATE now writes 12 fields atomically.

## Per-row log

| # | id | name | items | role | tier (existing → new) | confidence | action |
|---|---|---|---|---|---|---|---|
| 1 | `8344c305-bd30-4fea-a2cf-fd51424fb177` | U.S. Department of Energy (DOE) – Alternative Fuels Data Cen | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 2 | `83bb800b-13fa-4096-99af-5c6bfaa57b61` | Virginia Legislative Information System (LIS) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 3 | `860f7c3b-54e1-4ccd-9842-c70bf3146ca1` | Mission Innovation | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 4 | `86474c7e-a858-4a25-a206-d4aadf17d09f` | North Carolina Department of Environmental Quality (NC DEQ)  | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 5 | `867e2609-8a91-4fda-b731-b25f8f77c0f3` | Yara International ASA | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 6 | `87894622-d165-4ca0-84dd-13c433058616` | ANTT — Agência Nacional de Transportes Terrestres, Governo F | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 7 | `8792e3c9-2bbb-4388-9d08-3ddc3c1f09d5` | Global Environment Facility (GEF) — official secretariat sit | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 8 | `87b241da-8864-4273-8cb9-f935e7c3614f` | Rhode Island DEM – Office of Air Resources (Mobile Sources & | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 9 | `88124255-6d96-4521-9e3e-fc663fd82994` | North Dakota Legislative Assembly – North Dakota Century Cod | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 10 | `89485cf1-c7a5-476f-ac21-9346018e2f74` | Ville de Montréal — Conseil municipal | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 11 | `89c7b905-596f-4274-bc15-09b8182166c8` | Bureau Veritas Marine & Offshore | 1 | standards_body | T4 → T4 keep | HIGH | UPDATED |
| 12 | `8afd5b81-f2af-4c31-9db1-57e8c618b51e` | EUR-Lex / Official Journal of the European Union | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 13 | `8b24df2f-f244-41a4-9801-c3941e9c5932` | Australian Government Federal Register of Legislation | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 14 | `8c9b7831-64fb-4cad-b4fb-85c431f767ed` | Maritime and Port Authority of Singapore (MPA) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 15 | `8cdde50d-62eb-4518-9b8a-ca6f696cad9a` | Parliament of Singapore | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 16 | `8d26629e-9b60-43c0-bf2f-f14189bcb9d6` | ICAP Allowance Price Explorer | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 17 | `8ea87818-aec3-4402-8df1-3a67f9903e69` | New York State Department of Environmental Conservation (NYS | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 18 | `8f7c3fa4-f193-4265-8073-da024a287a72` | Iowa DOT – Freight Planning & Maps/Data Tools | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 19 | `8f89f682-482b-4bd9-a301-2839ec89f865` | IEA World Energy Outlook Dataset | 1 | intergovernmental_body | T1 → T1 keep | HIGH | UPDATED |
| 20 | `90202733-5283-4744-bf8a-98335b136abd` | Boston City Council | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 21 | `9046973b-95ef-47cc-aa65-95cea516936b` | European Commission | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 22 | `909b213e-dbd9-45fc-ab22-f08c56194fe9` | Clark County Department of Environment and Sustainability | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 23 | `91845d5f-3057-4f6d-8eb3-590d936a2767` | Wyoming Department of Environmental Quality (DEQ) – Air Qual | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 24 | `9190b411-0a6d-408b-8a3e-1dd3d86bbe7b` | Environment Protection Authority Victoria (EPA Victoria) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 25 | `920e84dd-cd56-429f-8ac5-b0b76aaab028` | International Maritime Organization (IMO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 26 | `924fe43e-a7ff-4f3b-bf4c-2040567f0d23` | US EIA Short-Term Energy Outlook | 1 | statistical_data_agency | T1 → T1 keep | HIGH | UPDATED |
| 27 | `928dd768-e5f0-4a71-8157-9335df8116db` | Reuters Sustainable Business | 1 | trade_press | T4 → T4 keep | HIGH | UPDATED |
| 28 | `92fe8f7e-6888-4941-b006-bc695be09b9d` | Shanghai Municipal People's Government (上海市人民政府) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 29 | `93cf5493-0351-4c9f-8a56-518cb39774d6` | Japan Ministry of Land, Infrastructure, Transport and Touris | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 30 | `93fc8015-69cc-4bdc-a73f-ccfb560b928a` | EUR-Lex / Official Journal of the European Union | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 31 | `941ff721-cae1-4a48-94c4-0bef46d64a71` | Diario Oficial da Uniao (Brazil) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 32 | `9564e7d7-15a5-416b-ad8f-e0d2ca5b88b9` | UK Government (publishing.service.gov.uk) — DESNZ / BEIS | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 33 | `9572d357-97d3-4d44-913f-54816fe174ba` | International Transport Forum (ITF/OECD) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 34 | `95d0d427-3de5-4278-a325-f9a18d71562f` | Mississippi Department of Environmental Quality (MDEQ) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 35 | `96f795c2-97fa-4f6e-84d8-cf3b158c8e14` | Splash247 (Asia Shipping Media) | 1 | trade_press | T5 → T5 keep | HIGH | UPDATED |
| 36 | `971e661f-4c7b-4639-98cd-3489e7150d5a` | Project Drawdown (drawdown.org) | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 37 | `97b289a9-b761-401f-8a17-9ec40cf92718` | Singapore Ministry of Transport (MOT) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 38 | `98ea1dbe-6ddf-4af9-bb13-9420d13c3fae` | CleanTechnica | 1 | trade_press | T5 → T5 keep | HIGH | UPDATED |
| 39 | `9918bb9f-453b-4b99-9480-9994e480dc7a` | South Carolina Department of Environmental Services (SCDES)  | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 40 | `99e87d4a-1e5c-467f-95bf-cf4263dd0d66` | Chicago Department of Public Health — Environmental Health | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 41 | `9a04d213-688a-45eb-a4e1-84dc7f4b7241` | House of Councillors of Japan (Sangiin / 参議院) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 42 | `9a5fa993-83d2-4278-be3e-eaafa90231e2` | UAE Government (u.ae) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 43 | `9a8840c8-2715-49be-8799-7d3ef0d44531` | European Commission — Directorate-General for Environment | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 44 | `9b01a831-e570-4ce4-80e1-183af21d9fb5` | Asian Development Bank (ADB) | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 45 | `9b2c1d4f-f206-4e50-acd8-d9e1d95bef92` | Ministry of Land, Infrastructure, Transport and Tourism (MLI | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 46 | `9bc9cad3-0628-4fed-a62b-029d7d516074` | Ministerstvo životného prostredia Slovenskej republiky (MŽP  | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 47 | `9c108fc0-afce-4645-bdaa-92f48a966ad5` | Alaska State Legislature – Alaska Statutes | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 48 | `9c13dca2-f674-4dec-a2bb-7e93cb49d596` | Ministère de l'Environnement, du Climat et de la Biodiversit | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 49 | `9d18cbab-7ec3-49ea-8e7e-c1ce3f6d328d` | ADOT – Arizona State Freight Plan | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 50 | `9de14df4-98a8-4c16-ace4-652178024f6b` | DP World (dpworld.com) | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 51 | `9e5ff2fe-94be-4225-a7fa-7b77a0453e79` | FreightWaves | 1 | trade_press | T5 → T5 keep | HIGH | UPDATED |
| 52 | `9eefac54-b9e3-4ff8-bb2f-c532191e697c` | World Resources Institute (WRI) | 1 | academic_research | T4 → T4 keep | HIGH | UPDATED |
| 53 | `9f11c216-6ce6-44ca-831f-f70528b17e1b` | The Loadstar | 1 | trade_press | T4 → T4 keep | HIGH | UPDATED |
| 54 | `9f3009fe-576d-4766-905b-9089c110303d` | OECD (Organisation for Economic Co-operation and Development | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 55 | `9fb4b968-7068-4262-8be2-dc4ee0fd8742` | EC CBAM Portal | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 56 | `9fde471c-fada-4c4c-a148-fa8f4b29cd39` | Tyndall Centre for Climate Research | 1 | academic_research | T2 → T2 keep | HIGH | UPDATED |
| 57 | `a02669f2-d31a-4822-bb42-90e8bc919a81` | Scottish Parliament (Holyrood) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 58 | `a069c3aa-bf56-46fd-9f32-d3e4d800e3c9` | World Economic Forum | 1 | industry_association | T4 → T4 keep | HIGH | UPDATED |
| 59 | `a0e2be6c-1c62-4bad-bda6-469285ffa57c` | Österreichisches Parlament (Nationalrat & Bundesrat) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 60 | `a0efc8f6-940f-4807-b568-ba8d9e883ea8` | Lloyd's Register Group (lr.org) | 1 | standards_body | T4 → T4 keep | HIGH | UPDATED |
| 61 | `a10eb596-1ad1-4114-bfa8-1f2cb72259d4` | ILO Global Wage Report | 1 | intergovernmental_body | T1 → T1 keep | HIGH | UPDATED |
| 62 | `a21978b4-61fd-48ea-84ee-2e4c195c8b4a` | European Sea Ports Organisation (ESPO) | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 63 | `a2afa79d-1d47-43aa-8d7d-d789ac880241` | Inter-American Development Bank (IDB) | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 64 | `a2b2fe29-5a42-4231-8214-f7d86f56f87f` | ECLAC / CEPAL – United Nations | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 65 | `a2c63c9d-86df-47b9-b6a4-500210c58797` | UK MEES — Minimum Energy Efficiency Standards | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 66 | `a2d25d50-0bb7-4b7c-8cda-e37d26803e8e` | EcoVadis | 1 | trade_press | T5 → T5 keep | LOW | UPDATED |
| 67 | `a30cd6aa-ca17-4a1e-8421-664d2d294bc2` | Prince Edward Island Department of Environment, Energy and C | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 68 | `a3c42d6a-459f-4c40-875a-f9cbb524412b` | Norwegian Maritime Authority (Sjøfartsdirektoratet / NMA) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 69 | `a44c91fa-8d83-48ea-b123-82ff67ea81dd` | legislation.gov.uk (UK Statute Law Database) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 70 | `a514027a-39c4-4ca0-a88b-0b2f828deb34` | UK Legislation | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 71 | `a5a3569d-02a8-4d83-ba9d-21e3cad15070` | Washington State Department of Commerce – Energy Office | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 72 | `a62c0565-6dd3-4cb4-91c6-ead9584d73b2` | Singapore Government (Multi-Ministry) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 73 | `a6b20a8a-e6a9-41aa-9c6c-0f38b71016ba` | EcoVadis | 1 | trade_press | T5 → T5 keep | LOW | UPDATED |
| 74 | `a6fde226-f3b2-4b54-9574-aaa2716a61ec` | California Public Utilities Commission (CPUC) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 75 | `a7475879-6fb6-4bfd-bd0f-41f96e5f280d` | Inter-American Development Bank (IDB) | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 76 | `a819d580-44e4-4fd9-981d-a660bbabe96d` | Tweede Kamer der Staten-Generaal | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 77 | `a8a4c514-7430-4930-925f-5bce7c7a5997` | Delaware General Assembly (legis.delaware.gov) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 78 | `a927b18c-f5f4-4fa3-a5cf-6982ed7b6e36` | Nebraska Legislature | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 79 | `a9776b5f-9ce3-41a0-b20b-c5e01a7a220c` | NCDOT – Climate Change & Clean Energy | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 80 | `aae0af9b-3dc7-4ca5-91c0-95769b590f8a` | ASEAN Main Portal (asean.org) | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 81 | `ab2c35c3-f822-4aab-b668-648f830370bc` | IEA Electricity Mid-Year Update | 1 | intergovernmental_body | T1 → T1 keep | HIGH | UPDATED |
| 82 | `ab8e216e-d063-438e-95c3-d11cfdcdc6c9` | IMT — Institute for Market Transformation | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 83 | `abe48613-c63c-4914-b8d7-39f1640c519b` | Parliament of New South Wales | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 84 | `ac2bec50-caaf-461f-95d0-c5912184b6ce` | EUR-Lex / Official Journal of the European Union | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 85 | `ac866c6b-7aad-4354-9f1e-ba5355ecc7fe` | West Virginia Department of Environmental Protection – Divis | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 86 | `acc6322f-09fa-4d48-a369-f905e5411bb7` | Abgeordnetenhaus von Berlin | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 87 | `acfa9bc1-51c8-4099-b8f9-9cace671a016` | ACT Legislation Register (Parliamentary Counsel's Office) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 88 | `adc88972-f034-4e4b-9e23-bb6e89571730` | Alabama Department of Environmental Management (ADEM) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 89 | `b0b9aac5-cd89-455e-99cc-3d7f9dde2b8c` | Illinois Pollution Control Board (IPCB) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 90 | `b0cece2a-bb98-4ac7-85d4-e53994767ef9` | U.S. Energy Information Administration (EIA) | 1 | statistical_data_agency | T3 → T3 keep | HIGH | UPDATED |
| 91 | `b0e4cf0c-e6b2-48fb-b887-a6a4c7ae0fd9` | Federal Highway Administration (U.S. DOT) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 92 | `b13504d2-68e3-44dd-9ce0-2ba1e3519860` | DP World (dpworld.com) | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 93 | `b197e23d-227c-49f8-aa71-b0e4afeb1506` | North Carolina Office of Administrative Hearings – NC Regist | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 94 | `b243e435-a4d0-411f-9000-2070c7872e2b` | New York State Public Service Commission (PSC) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 95 | `b2557cf4-65ea-49dd-82f8-838fd697ff1d` | IRENA Renewable Power Generation Costs | 1 | intergovernmental_body | T1 → T1 keep | HIGH | UPDATED |
| 96 | `b2588399-4cf6-40fc-9129-3f9b44c4b356` | Splash247 | 1 | trade_press | T4 → T4 keep | HIGH | UPDATED |
| 97 | `b2ae4c9e-3de2-431c-a240-0ad43f9f83f2` | Organisation for Economic Co-operation and Development (OECD | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 98 | `b2c2b6fd-3127-438e-a050-fc0417a3c60d` | International Maritime Organization (IMO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 99 | `b32c0e41-bfbd-4bea-a1a7-732d6b02a4ad` | EUR-Lex / Regulation (EU) 2023/1542 — Batteries Regulation | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 100 | `b3e23db3-da1a-4947-ae63-5292d4631edf` | Poslanecká sněmovna Parlamentu České republiky | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |

---

HOLD — batch 5 awaits operator approval

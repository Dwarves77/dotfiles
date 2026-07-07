# Source classification backfill — batch 6

**Generated:** 2026-05-11T14:11:19.282Z
**Halted on error:** no

## Summary

| Metric | Value |
|---|---|
| Total classified rows in JSON | 783 |
| Dropped (AMBIGUOUS) | 39 |
| Dropped (URL-split flagged) | 0 |
| Candidates after filter | 744 |
| Selected for batch 6 | 100 |
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
| primary_legal_authority | 68 |
| intergovernmental_body | 15 |
| academic_research | 9 |
| industry_association | 3 |
| trade_press | 2 |
| industry_data_provider | 1 |
| standards_body | 1 |
| statistical_data_agency | 1 |

## Confidence distribution (this batch)

| Confidence | Count |
|---|---|
| HIGH | 41 |
| LOW | 33 |
| MEDIUM | 26 |

## Notes / schema gaps

- Migration 067 (2026-05-10) added classification_confidence and classification_rationale to public.sources. Per-row UPDATE now writes 12 fields atomically.

## Per-row log

| # | id | name | items | role | tier (existing → new) | confidence | action |
|---|---|---|---|---|---|---|---|
| 1 | `e3fed305-eb71-406a-96dd-dd716e70d72d` | International Transport Forum (ITF/OECD) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 2 | `e444af41-cb63-417a-9c93-d14c5ee826ab` | International Energy Agency (IEA) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 3 | `e4de01ae-7c0d-4024-9736-175003d35c32` | United Nations Development Programme (UNDP) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 4 | `e50b19a7-1ea4-44c7-beb1-33dcc0cc0b38` | ASEAN Main Portal (asean.org) | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 5 | `e568e55d-5436-4f5b-9508-35091b9d5bcc` | US EPA Emissions Regulations | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 6 | `e60e956a-f3c3-4c7e-adcd-746effad7d8c` | Národná rada Slovenskej republiky | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 7 | `e664fff0-778f-47da-85f8-5010d28524e6` | SDDOT – Carbon Reduction Strategy | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 8 | `e6956d6f-4c95-47b6-a72e-04cec98992f2` | EUR-Lex / Official Journal of the European Union | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 9 | `e704ae4d-f366-49c9-b154-702098df587b` | Environment ACT (Environment, Planning and Sustainable Devel | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 10 | `e720fc6b-fdaf-4f76-b54a-99d1995e2f0b` | Saskatchewan Ministry of Environment | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 11 | `e76e2549-648d-4508-8d15-68eb7234987c` | Intergovernmental Panel on Climate Change (IPCC) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 12 | `e775a938-dca3-49c9-87f7-5d98237a1cc0` | Wyoming Legislature – Wyoming Statutes | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 13 | `e786f2c7-f010-4bcc-8288-a871d3da8198` | Sabin Center for Climate Change Law | 1 | academic_research | T4 → T4 keep | HIGH | UPDATED |
| 14 | `e99a7e99-ebae-4a39-81cb-e81a3d5e218d` | Northern Ireland Assembly (Stormont) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 15 | `e99e2f18-dba1-45e4-87bc-ab7a412314b7` | Lloyd's List | 1 | trade_press | T5 → T5 keep | HIGH | UPDATED |
| 16 | `ea198c9e-9601-4eed-85ef-3985fb43d78c` | International Renewable Energy Agency (IRENA) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 17 | `ea48a7e7-eedf-4323-9881-58882c708de4` | European Commission – Climate Action (DG CLIMA) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 18 | `eafcc677-0153-4a86-9b7b-18fee1e6044b` | International Maritime Organization (IMO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 19 | `ec6b370e-ebc8-4d21-bff9-e09e7a4b7330` | Pennsylvania General Assembly (legis.state.pa.us) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 20 | `ed8bd0e6-3dc6-4bea-9a08-5032eaad4cd8` | Nova Scotia House of Assembly | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 21 | `edf8d2cf-4150-4845-aa70-e95420b3192b` | Clean Hydrogen Partnership (EU joint undertaking under Horiz | 1 | primary_legal_authority | T3 → T3 keep | HIGH | UPDATED |
| 22 | `eec932a5-c797-4adb-bd17-076937979da1` | Pennsylvania Department of Environmental Protection (DEP) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 23 | `ef191419-1dde-4e5a-98b4-85f52fa84298` | Scottish Environment Protection Agency (SEPA) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 24 | `ef2643ee-a501-4d4a-ac0e-899e884cf8fd` | Oklahoma Legislature | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 25 | `ef347aa7-6dc2-40b8-ac18-6555f964c037` | BREEAM (BRE Global) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 26 | `ef56e193-1110-4015-b199-e275d8e810ce` | Guam Legislature (I Liheslaturan Guåhan) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 27 | `f011d2e9-c1b9-40de-92e2-4490b7f8b14f` | Legislative Assembly of Saskatchewan | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 28 | `f1781dff-326d-47f6-8eb7-03880627556c` | USGBC LEED Project Database | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 29 | `f231a260-b752-49af-b849-45ddcbdbf460` | SEMARNAT (semarnat.gob.mx) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 30 | `f26a771c-88b0-41c4-ad64-8b94969810e7` | Alaska DOT&PF – Measurement Standards & Commercial Vehicle C | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 31 | `f27f1e92-54b0-4f47-be25-4301025888a7` | Legislative Assembly of Alberta | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 32 | `f404180d-6e41-42e1-967e-615e6d8377e4` | Umweltbundesamt — Austrian Environment Agency | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 33 | `f45fa467-286f-4047-8a61-9ad365bab29b` | Office of Rail and Road (ORR) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 34 | `f58fb9bf-e2bb-4a95-a418-9e4196f9eac7` | West Virginia Legislature – Legislative Rulemaking Review /  | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 35 | `f65fd561-795b-471d-ad1c-55a292cb712a` | Assemblée nationale | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 36 | `f6843bed-0120-477c-9cdf-4df8df6048be` | Tennessee General Assembly | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 37 | `f692281c-95c6-4d78-96b2-c8aa9f2beb0c` | Saeima of the Republic of Latvia | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 38 | `f6a642dd-25c6-4a67-ab6d-86df394a2ee9` | Arkansas Department of Environmental Quality (ADEQ / DEQ) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 39 | `f7360ba7-5b98-4967-826d-6fd1961f1a62` | International Maritime Organization (IMO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 40 | `f73be09b-75b9-49a9-aaa9-82171802762c` | Ministerul Mediului, Apelor și Pădurilor (MMAP) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 41 | `f74fd17e-a4fa-4d8e-98d5-88bba7c44089` | Environment Protection Authority South Australia (EPA SA) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 42 | `f79e292d-d4ca-4a7c-ba69-f97a346da4b7` | U.S. Environmental Protection Agency (EPA) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 43 | `f7e0cad5-bdd1-4022-8351-b2663f319ae9` | California Energy Commission (CEC) – Fuels and Transportatio | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 44 | `f8ef5b76-1d2a-4842-8165-5af33d95b352` | REVERB | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 45 | `f939efd5-a76c-474a-b181-5738e99482ad` | Asian Development Bank (ADB) | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 46 | `f98c1228-d779-43d3-8b09-944884697e78` | IEA Policies and Measures Database | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 47 | `f9f787e4-bcfa-4026-8719-abec5de462a4` | Minnesota Pollution Control Agency (MPCA) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 48 | `fa19ea7f-ab82-4eaa-9dd2-9375d8418e87` | BloombergNEF Energy Storage | 1 | industry_data_provider | T2 → T2 keep | HIGH | UPDATED |
| 49 | `fa6d6470-6b45-452a-9bc6-6fdff4ec44ae` | American Trucking Associations | 1 | industry_association | T4 → T4 keep | HIGH | UPDATED |
| 50 | `fb877c31-51f3-4ae7-9c03-13f88771fd8f` | International Carbon Action Partnership (ICAP) | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 51 | `fbeec262-732a-48c0-8f0e-8dd1597c7189` | Mission Innovation | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 52 | `fd042e62-8955-4fa7-8248-0a296942f537` | ASEAN Main Portal (asean.org) | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 53 | `fd9d21c6-6269-40fe-ad6c-d56b0d438f65` | Sejm of the Republic of Poland | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 54 | `fdd32abd-4bb9-4d60-995c-5c13b8a70141` | Japan Ministry of Land, Infrastructure, Transport and Touris | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 55 | `fddb37e6-7268-4a9a-909a-3a132dfef1aa` | IEA Global Hydrogen Review | 1 | intergovernmental_body | T1 → T1 keep | HIGH | UPDATED |
| 56 | `fdf22d9f-ba9d-4ebf-93c4-f47fd9700652` | Rhode Island General Assembly – Legislative Portal | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 57 | `fe46e0c0-fcce-44a5-bf74-b444ec575a6d` | International Monetary Fund (IMF) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 58 | `fe91a469-56c6-4142-8212-d55697432c09` | Nunavut Department of Environment | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 59 | `feb56ca1-2e79-4c2d-bc62-fde0823246df` | Indiana Utility Regulatory Commission (IURC) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 60 | `fed43277-faef-48a5-b145-669847ce4c8a` | NYC Mayor's Office of Climate & Environmental Justice (Susta | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 61 | `ff028065-3a8b-4d1b-b198-f0891936a0a3` | Texas Department of Transportation (TxDOT) – Freight Plannin | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 62 | `ff6f7eca-48d3-4a31-8e6f-159165a3b8c3` | Global Maritime Forum | 1 | industry_association | T4 → T4 keep | HIGH | UPDATED |
| 63 | `ff87a98e-1524-4490-9a76-261c4ba16c33` | International Air Transport Association (IATA) | 1 | industry_association | T4 → T4 keep | HIGH | UPDATED |
| 64 | `ffe158ff-994d-484f-8d9c-491f0b8350d1` | Norwegian Government (regjeringen.no) / Ministry of Climate  | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 65 | `01bd301f-ecd9-4c0c-87a8-7a7946a0f00d` | World Trade Organization (WTO) | 0 | intergovernmental_body | T3 → T3 keep | MEDIUM | UPDATED |
| 66 | `01ec77bb-f30b-4d84-ac95-8412588c82da` | International Transport Forum (ITF) at the OECD | 0 | intergovernmental_body | T3 → T3 keep | MEDIUM | UPDATED |
| 67 | `04061547-7d93-4f14-9d4d-e232121a6822` | Pennsylvania Public Utility Commission (PA PUC) – Motor Carr | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 68 | `067b8575-fced-469b-be59-1efdac06c018` | Yukon Department of Environment | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 69 | `084892de-00f7-47a1-8776-4df6c8f980d9` | Hawai‘i State Legislature – Hawai‘i Revised Statutes | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 70 | `087c1289-0de2-480e-af0f-24ad2e1f0831` | Dubai Municipality (بلدية دبي) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 71 | `095d2a2c-0e59-43c9-b759-c3a7d19ad71d` | Tokyo Metropolitan Assembly (東京都議会) | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 72 | `09eafe50-924a-451e-b460-43e88d7080df` | IRENA Data Portal | 0 | intergovernmental_body | T1 → T1 keep | MEDIUM | UPDATED |
| 73 | `0a8adfba-0f00-464b-b476-555b2f162e5f` | PACT — Partnership for Carbon Transparency | 0 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 74 | `0c7cae99-6b0c-4a74-84ec-3611bcb8c491` | DNV — Energy Transition Outlook (Maritime) | 0 | standards_body | T2 → T2 keep | MEDIUM | UPDATED |
| 75 | `0ece33f0-460a-4d2c-b750-8dd70c71e4ce` | U.S. Department of Transportation (USDOT) | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 76 | `10528abf-f3bb-4245-b844-8c35de0daf49` | Japan MLIT | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 77 | `10b73cb6-0581-4860-9a45-9e9599afdc5e` | ILO Maritime Labour Convention | 0 | intergovernmental_body | T1 → T1 keep | MEDIUM | UPDATED |
| 78 | `126dcf68-9322-4ed4-895e-671f72b85fa0` | ACI — Airports Council International | 0 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 79 | `138dc2ea-c435-4991-bbc4-709db80f1a6c` | Environment Protection Authority Tasmania (EPA Tasmania) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 80 | `13ec22b2-4391-4c5a-9643-fa0c0fd8542e` | International Renewable Energy Agency (IRENA) | 0 | intergovernmental_body | T3 → T3 keep | MEDIUM | UPDATED |
| 81 | `1679dc4c-4d1b-46aa-84c0-b720709ca6a4` | Commission for Environmental Cooperation (CEC) | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 82 | `1760a728-ca4e-4f4f-8d8b-49bbbf2e915c` | EU GDP — Good Distribution Practice (EMA) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 83 | `1918c555-bb94-4aa7-ba32-bd7f4485fdd7` | ADR — Dangerous Goods by Road (UNECE) | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 84 | `198a631e-1b2d-4e17-9dc6-3ea113ff7eed` | New Mexico Environment Department (NMED) – Air Quality Burea | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 85 | `198b04d6-cce0-4c4a-aefb-38be73bc2e48` | Državni zbor Republike Slovenije | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 86 | `1a5e8577-f280-47ef-af24-334576472cde` | Packaging Europe | 0 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 87 | `1b3b49da-23d9-4e09-8959-5e2f0517eecc` | US DOT PHMSA — Hazardous Materials | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 88 | `1ba7f3d2-b838-44f8-99b6-d86f565c18b4` | SPF Santé publique, Sécurité de la chaîne alimentaire et Env | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 89 | `1c5588e3-e45d-4985-9154-113558853c7f` | House of Representatives of Japan (Shugiin / 衆議院) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 90 | `1ccd5e9e-ea2a-476e-84d3-31bf87873ecc` | Singapore BCA Green Mark | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 91 | `1d86d8a1-6561-4e2b-b140-c9210b012c7b` | European Commission – DG TAXUD | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 92 | `214bf581-4dd0-469d-91ff-d76d6853f090` | NABERS (NSW Government, on behalf of Australian Federal, Sta | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 93 | `21e1a32f-3737-4d23-b31f-e24f1d4ee015` | C-TPAT — Customs-Trade Partnership | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 94 | `22e4e428-f280-4484-ae8f-05b7bddb590d` | Gazette of India eGazette | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 95 | `25189f99-1ecd-457e-9fb1-e5126fbc19d8` | Legislative Assembly of the Northern Territory | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 96 | `2555c199-f65a-44b6-8c4a-1ce3bf3684a5` | China National ETS — MEE | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 97 | `259dc287-2130-4341-95a4-6b5a06a76104` | City of Miami — Office of Resilience & Sustainability | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 98 | `259ed662-13b1-4b93-9fb0-aa61d12ac234` | City of Atlanta — Mayor's Office of Sustainability & Resilie | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 99 | `292ba065-4604-467b-bf9b-52597bdea094` | Japan GX League | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 100 | `295fba96-2a55-4430-a5b5-3548992c6df4` | Splash247 | 0 | trade_press | T5 → T5 keep | MEDIUM | UPDATED |

---

HOLD — batch 7 awaits operator approval

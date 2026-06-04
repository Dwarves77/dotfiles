# Source classification backfill — batch 1

**Generated:** 2026-05-11T00:30:37.505Z
**Halted on error:** no

## Summary

| Metric | Value |
|---|---|
| Total classified rows in JSON | 783 |
| Dropped (AMBIGUOUS) | 39 |
| Dropped (URL-split flagged) | 0 |
| Candidates after filter | 744 |
| Selected for batch 1 | 100 |
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
| primary_legal_authority | 66 |
| intergovernmental_body | 11 |
| industry_association | 7 |
| trade_press | 6 |
| academic_research | 4 |
| statistical_data_agency | 2 |
| standards_body | 2 |
| government_press | 1 |
| vendor_corporate | 1 |

## Notes / schema gaps

- classification_confidence and classification_rationale columns do not exist on public.sources (verified against migrations 057-066 and live schema). These two fields from the JSON were NOT written; everything else in the 5-axis framework was.

## Per-row log

| # | id | name | items | role | tier (existing → new) | action |
|---|---|---|---|---|---|---|
| 1 | `0cbbbbf7-cfea-419b-b4f7-eb050da2f63b` | California Legislative Information (Leginfo) | 3 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 2 | `260089a9-e334-4104-843c-cdfc28a94dcc` | EUR-Lex | 3 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 3 | `d8d21ad5-47b3-4839-b9ea-9afa392c4f20` | European Commission Press Corner | 3 | government_press | T2 → T2 keep | UPDATED |
| 4 | `13f9585a-1f19-4b07-a0f7-df65ae0f5712` | Publications Office of the European Union / EUR-Lex | 2 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 5 | `24b4daf0-95bf-45b5-9084-ead7a6cf999d` | EC DG CLIMA Shipping | 2 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 6 | `43e5b98c-d5d0-4715-acac-4fd20f84c27a` | International Civil Aviation Organization | 2 | intergovernmental_body | T3 → T3 keep | UPDATED |
| 7 | `45140924-25b6-4d2c-abe5-11a65386acdc` | California Air Resources Board (CARB) | 2 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 8 | `b534ca39-6ec5-4dce-9889-92367a2f5c62` | European Clean Trucking Alliance (ECTA) | 2 | industry_association | T4 → T4 keep | UPDATED |
| 9 | `0091e1d0-afb5-4d0c-bf1a-b2c3faedda7c` | U.S. Energy Information Administration (EIA) | 1 | statistical_data_agency | T3 → T3 keep | UPDATED |
| 10 | `00b6cd1a-61a5-4023-ad7b-0835fdc16fe7` | Colorado General Assembly | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 11 | `00d006cf-33ec-4439-be45-3a51ee1849a3` | Julie's Bicycle | 1 | industry_association | T2 → T2 keep | UPDATED |
| 12 | `014cd242-606b-4200-a699-b2d8180c487f` | Missouri General Assembly | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 13 | `01fd2c6b-efee-4528-8f22-9cbec6d39d55` | Department of Environment – Ministry of Agriculture, Rural D | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 14 | `026c73a4-2747-4e8e-8c9b-139cc1946e6c` | National People's Congress of the People's Republic of China | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 15 | `027a7175-a0b8-4e77-adf0-8440d55acf28` | Ministry of Land, Infrastructure, Transport and Tourism (MLI | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 16 | `03022261-7bb9-428f-9a5a-44e507e7c9eb` | Japan Customs (Ministry of Finance – Customs and Tariff Bure | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 17 | `03080157-5e2b-4882-821c-d0bf6f686406` | Ministerio para la Transición Ecológica y el Reto Demográfic | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 18 | `0396927b-9553-489a-bef0-93a786d3f81b` | German Federal Government (Bundesregierung) | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 19 | `04014768-151f-4adf-91ff-b29e4113cc00` | NREL System Advisor Model (SAM) | 1 | academic_research | T1 → T1 keep | UPDATED |
| 20 | `042f6965-6f6e-4cf0-b64a-76c18143e074` | Queensland Legislation website (Office of the Queensland Par | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 21 | `0455a9ec-27df-4953-ac85-75185e133a2e` | Mississippi Legislature | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 22 | `04ba0c5e-d99d-4474-947d-14c8d0fe0596` | Department for Infrastructure Northern Ireland (DfI) | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 23 | `04c4aeca-ae1f-47f8-91a1-53ec4c12d2e0` | International Maritime Organization (IMO) | 1 | intergovernmental_body | T3 → T3 keep | UPDATED |
| 24 | `04f55a8b-cf07-4ec6-837c-25c1d4be2058` | U.S. Environmental Protection Agency (EPA) | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 25 | `051c99be-3a75-4862-a5dd-fd3f7af64e2c` | National Heavy Vehicle Regulator (NHVR) | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 26 | `06dad3cb-01cd-4a29-8722-2a4de3e5593e` | International Transport Forum (ITF) at the OECD | 1 | intergovernmental_body | T3 → T3 keep | UPDATED |
| 27 | `06ea2956-12d2-423d-a27a-48859935cd59` | Presidência da República / Casa Civil – planalto.gov.br | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 28 | `071dff9e-4841-4955-8c04-9012c7836a49` | Centre for Sustainable Road Freight | 1 | academic_research | T2 → T2 keep | UPDATED |
| 29 | `07a7d198-1394-4934-be1e-204fcfdf00cf` | Dubai Electricity & Water Authority (DEWA) | 1 | primary_legal_authority | T3 → T3 keep | UPDATED |
| 30 | `07da4496-58f2-48aa-b438-9ddd23c69fe7` | Chambre des Députés du Grand-Duché de Luxembourg | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 31 | `0879e4cc-113b-4b29-889b-99ade5d12df9` | THETIS-MRV | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 32 | `0988c497-a6f1-4501-99d5-5986032d3883` | Brussels Environment / Leefmilieu Brussel (Bruxelles Environ | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 33 | `0b049c06-e6aa-483a-ae65-048d1afb0068` | The Loadstar | 1 | trade_press | T5 → T5 keep | UPDATED |
| 34 | `0b594fec-503d-4f89-82f3-958062ff6eea` | Northern Ireland Environment Agency / DAERA (Department of A | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 35 | `0cc23a7e-4c41-4667-b0fb-6094d134d71b` | Seimas of the Republic of Lithuania | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 36 | `0cd629a2-84fb-4e80-a0a5-546a92a5e2c6` | UK Department for Transport / GOV.UK | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 37 | `0e633b61-70ab-4886-80b8-66ef93d20497` | U.S. Department of State | 1 | industry_association | T2 → T2 keep | UPDATED |
| 38 | `0e86b739-17f1-4278-a895-df0123dd2aad` | Florida Department of Transportation (FDOT) – Freight and Ra | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 39 | `0ef987a1-3470-49d3-a04b-01025ea582ba` | California State Transportation Agency (CalSTA) | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 40 | `0f2cf213-8a5c-4cb4-8bb4-93ae0665fabf` | European Clean Trucking Alliance (ECTA) | 1 | industry_association | T4 → T4 keep | UPDATED |
| 41 | `0ff45df5-eb3b-4bed-b1ff-9dffa44e7725` | Kansas Legislature | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 42 | `111c637d-49b3-4ab2-b7bf-5dcb6aa8e114` | FreightWaves | 1 | trade_press | T4 → T4 keep | UPDATED |
| 43 | `1138f3cd-dbe0-4ed0-97c3-80d76b797054` | South Dakota Legislature | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 44 | `130e05c2-2d5b-441b-ba8a-56f815e2d724` | U.S. Energy Information Administration (EIA) | 1 | statistical_data_agency | T3 → T3 keep | UPDATED |
| 45 | `1361fa34-d4c1-41e5-a99a-6e937880fa8f` | H2Accelerate Collaboration (industry consortium: Daimler Tru | 1 | vendor_corporate | T4 → T4 keep | UPDATED |
| 46 | `140f7bcc-aac3-4a3c-ba73-411ceaeb6abc` | Georgia Department of Transportation (GDOT) – Freight Office | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 47 | `147ee8c6-ac78-4941-ab6d-6e65e829541b` | Indiana Department of Environmental Management (IDEM) | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 48 | `15545487-8d27-4f86-bbe7-eaa3f94d79cf` | World Economic Forum | 1 | industry_association | T3 → T3 keep | UPDATED |
| 49 | `167dae92-0e44-420f-a6ff-c151427647b0` | EUR-Lex | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 50 | `16c23231-33d2-4b7b-b021-c0d0ca201a52` | DC Municipal Regulations & DC Register (dcregs.dc.gov) | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 51 | `1766208f-939d-4f54-aa65-eddb11ebdda0` | Hungarian Government Environment & Energy Ministry portal (k | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 52 | `179972a0-c1db-4868-9d74-2bf527906eb7` | New York State Senate / Assembly Legislative Information | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 53 | `18ede96c-f841-4fab-93ac-fa34a9c44366` | WisDOT – State Freight Plan Portal | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 54 | `191a1c06-d02d-4de1-9600-a179e371cafe` | Greater London Authority (GLA) | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 55 | `196fb848-7740-4d1b-9add-20a8d355b53c` | Indiana General Assembly | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 56 | `1a7ed54d-0562-4853-93da-8a4cb58a1cc9` | City of Philadelphia — Office of Sustainability | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 57 | `1af0c8ac-1a2e-401d-aed4-484175f3435b` | CLECAT (European Forwarder Federation) | 1 | industry_association | T4 → T4 keep | UPDATED |
| 58 | `1bc48b90-4e2a-4f3f-aaa2-6a470b51eb41` | Kansas Legislature – Kansas Statutes Annotated (KSA) Revisor | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 59 | `1c2521c0-43ad-45f7-929f-63d656a1fe9d` | International Maritime Organization | 1 | intergovernmental_body | T3 → T3 keep | UPDATED |
| 60 | `1c2b33a5-f9ae-4d2e-977f-5212174814d5` | Air Cargo News | 1 | trade_press | T4 → T4 keep | UPDATED |
| 61 | `1c31ece5-3a0d-4b21-bfdf-86eaa9647687` | New York City Council | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 62 | `1c4df84e-8c9a-4c11-b6e1-605ed46dd0bc` | Utah State Legislature – Utah Code & Utah Administrative Cod | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 63 | `1ceff300-5831-4f4a-b437-160bd7c25e6e` | NREL NSRDB National Solar Radiation Database | 1 | academic_research | T1 → T1 keep | UPDATED |
| 64 | `1d0b1e24-5813-4491-ad1a-b60dc3cb1154` | World Bank Group (with ICAP data support) | 1 | intergovernmental_body | T3 → T3 keep | UPDATED |
| 65 | `1d166acf-5328-4965-8c37-5be7d2b57456` | Ohio Laws – Ohio Administrative Code & Ohio Revised Code (LS | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 66 | `1db7d6c0-a644-47e5-94c5-55d66cb80520` | US DOE Clean Investment Monitor | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 67 | `1ed3f79c-9d4c-4ae7-a443-0683edbd7f47` | GreenBiz | 1 | trade_press | T4 → T4 keep | UPDATED |
| 68 | `1f5fb2b0-29f3-4be7-a23a-df64210787d5` | Agence wallonne de l'Air et du Climat (AwAC) | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 69 | `20fb520a-38d2-4c68-928c-e359d9ff5d41` | Electrek | 1 | trade_press | T5 → T5 keep | UPDATED |
| 70 | `2156a4bd-023f-4988-9b00-1300e8b51b10` | Australian Government Climate Change Authority | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 71 | `2167775a-1320-48e6-b3d5-c90c72464305` | Parliament of South Australia | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 72 | `21709630-dd75-46db-b0dc-9a53f5ad4d90` | City of Boston — Environment Department | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 73 | `2215d39d-e506-4c1e-ad34-d03b33818fd7` | Port of Los Angeles (Los Angeles Harbor Department) | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 74 | `228a8da0-c4cc-4839-9755-dbe9005c57de` | International Energy Agency (IEA) | 1 | intergovernmental_body | T3 → T3 keep | UPDATED |
| 75 | `22ad6bf3-eb3d-4118-b514-26f5af1050e0` | Environmental Protection Agency (EPA) — Ireland | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 76 | `22fb8ec4-1084-4aae-86ec-ae998713d4ee` | Sveriges Riksdag (Swedish Parliament) | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 77 | `237ddcb0-c9a8-4a37-879a-3c282bce840c` | New Jersey Economic Development Authority (NJEDA) – Clean En | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 78 | `239f2838-18b4-47ef-a2ea-e7cde7162b5d` | Global Reporting Initiative (GRI) | 1 | standards_body | T4 → T4 keep | UPDATED |
| 79 | `23a9f77a-1106-43fd-bb6b-79a973449339` | Yukon Legislative Assembly | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 80 | `241af7eb-e168-4606-93e0-5780d585bc9b` | International Energy Agency (IEA) | 1 | intergovernmental_body | T3 → T3 keep | UPDATED |
| 81 | `24f4b92e-6a76-4773-91b4-4463e9f19da9` | Legislative Assembly of Nunavut | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 82 | `253e0eb6-e9ad-4d9e-91f7-736320c015e3` | Arkansas Pollution Control and Ecology Commission (APC&EC) | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 83 | `253eb63a-a009-46ad-86d0-86eaa6f47977` | Illinois General Assembly | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 84 | `25fb1adb-2db7-498a-bd6b-aecf9961ea0f` | Inter-American Development Bank (IDB) – IDB Publications | 1 | academic_research | T3 → T3 keep | UPDATED |
| 85 | `272e9339-665d-4d75-acab-23c927dfa998` | European Commission – DG TAXUD (Taxation and Customs Union) | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 86 | `275ad555-7e43-4b81-9187-2e3c59daf627` | Keskkonnaministeerium (KKM – Estonian Ministry of Climate /  | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 87 | `28d0b9a7-39c3-48f8-a3c6-76e1002896e4` | Journal of Commerce (JOC) | 1 | trade_press | T5 → T5 keep | UPDATED |
| 88 | `28e82808-aa9f-4110-a5be-9564944106ec` | Umweltbundesamt (UBA) — German Environment Agency | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 89 | `28ecc6b0-436b-4bf4-889f-fb2673497562` | Utah Division of Air Quality (UDAQ) – Utah Department of Env | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 90 | `290e66c9-a757-4be6-ab68-a40414ec33b6` | Office of the City Clerk of Chicago | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 91 | `29557886-098f-4346-ae68-574beb139f96` | OECD (Organisation for Economic Co-operation and Development | 1 | intergovernmental_body | T3 → T3 keep | UPDATED |
| 92 | `296cd44e-5df9-4265-91d2-dfb7b8f87b7e` | Florida Department of Environmental Protection (FDEP) – Divi | 1 | primary_legal_authority | T2 → T2 keep | UPDATED |
| 93 | `29845b19-7004-485e-86f3-fdd84f8aa3f5` | Statutes of the Republic of Korea | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 94 | `29cb2f4c-c599-4183-b3e5-f8c51384e731` | Council of the District of Columbia – D.C. Law Library | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 95 | `2b6d9e9a-c8ed-42de-942f-1576dfa931ac` | CER – Community of European Railway and Infrastructure Compa | 1 | industry_association | T4 → T4 keep | UPDATED |
| 96 | `2b7e1191-f627-4838-9579-6f6c8959a0bb` | Science Based Targets initiative | 1 | standards_body | T5 → T5 keep | UPDATED |
| 97 | `2c88abc4-7564-4aca-9575-59404ba2d965` | International Maritime Organization (IMO) | 1 | intergovernmental_body | T3 → T3 keep | UPDATED |
| 98 | `2ce9a14e-62ba-42a8-b8b8-728b6f69e1ba` | Western Australian Government Gazette (WA Legislation) | 1 | primary_legal_authority | T1 → T1 keep | UPDATED |
| 99 | `2d03fce4-d135-4fbb-98d7-b9afa9394271` | World Bank Carbon Pricing Dashboard | 1 | intergovernmental_body | T3 → T3 keep | UPDATED |
| 100 | `2d0d2d7f-acee-4cc7-a887-30ae581bb7f8` | International Maritime Organization (IMO) / Republic of Kore | 1 | intergovernmental_body | T3 → T3 keep | UPDATED |

---

HOLD — batch 2 awaits operator approval

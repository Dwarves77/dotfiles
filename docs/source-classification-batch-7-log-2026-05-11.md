# Source classification backfill — batch 7

**Generated:** 2026-05-11T14:11:49.753Z
**Halted on error:** no

## Summary

| Metric | Value |
|---|---|
| Total classified rows in JSON | 783 |
| Dropped (AMBIGUOUS) | 39 |
| Dropped (URL-split flagged) | 0 |
| Candidates after filter | 744 |
| Selected for batch 7 | 100 |
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
| primary_legal_authority | 74 |
| academic_research | 7 |
| intergovernmental_body | 6 |
| statistical_data_agency | 5 |
| industry_association | 3 |
| standards_body | 3 |
| vendor_corporate | 1 |
| trade_press | 1 |

## Confidence distribution (this batch)

| Confidence | Count |
|---|---|
| MEDIUM | 67 |
| LOW | 33 |

## Notes / schema gaps

- Migration 067 (2026-05-10) added classification_confidence and classification_rationale to public.sources. Per-row UPDATE now writes 12 fields atomically.

## Per-row log

| # | id | name | items | role | tier (existing → new) | confidence | action |
|---|---|---|---|---|---|---|---|
| 1 | `2a49d892-15fb-4c7d-ac61-276b2f2a7fd9` | Intercargo — Dry Bulk Shipowners | 0 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 2 | `2a7cb270-1e64-41b4-a3ee-c3859c6612b6` | European Commission – DG Energy | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 3 | `2beafbb6-96e1-4e9a-9ef4-28270a5d77cf` | US TSA — Air Cargo Security | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 4 | `2c2bae66-f3f2-4362-81d7-052ea3f2ecfc` | Korea Register of Shipping — KR | 0 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 5 | `30662aba-076f-49ee-8896-a14f8405ae65` | European Sea Ports Organisation (ESPO) | 0 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 6 | `30b51427-df93-4f76-ab99-bf49359d18ce` | City of Houston Health Department — Environmental Services | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 7 | `33154dd7-1b59-441f-8d3b-2221090a53a5` | European Commission — Directorate-General for Mobility and T | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 8 | `356f1c0e-ee30-4ed0-804d-092617864198` | UN Security Council Sanctions | 0 | intergovernmental_body | T1 → T1 keep | MEDIUM | UPDATED |
| 9 | `35ce9af9-a6ff-4acf-a367-e3e3dd54a6dc` | Folketinget (Danish Parliament) | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 10 | `36433d07-8a8e-45e9-8c85-e105a1d4c62b` | Shanghai Municipal Bureau of Ecology and Environment (上海市生态环 | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 11 | `389f7126-b591-46b4-87c4-ac032a1c9223` | Nashville Building Energy Programs | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 12 | `39f36d8e-cc26-461e-a913-a551d4e9aa0c` | IAPH — World Ports | 0 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 13 | `3ac07144-168e-4593-8043-ee519dc3de6b` | US FMC — Federal Maritime Commission | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 14 | `3cab0b63-605b-47ef-9e4c-6af94680c10c` | DPNR – Division of Environmental Protection | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 15 | `3d0d4489-63a0-43be-b1ef-52ef2de8a672` | City of Seattle — Environment & Sustainability | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 16 | `3d98c9bf-651a-427e-bf15-ba6b2cb771a3` | EU Sanctions Map | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 17 | `3e0d6c3f-5a66-41c7-a78f-41de7491593a` | Michigan Legislature – Michigan Compiled Laws (MCL) & Admini | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 18 | `4014cfca-24dc-4e2c-a997-d64df2172e2d` | Ympäristöministeriö (Ministry of the Environment of Finland) | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 19 | `41a0d4b3-d4a3-4262-b1b2-cf3f0c0427d6` | Australia NABERS | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 20 | `42daf048-7524-4ef7-b3c7-b5676a448b69` | Parliament of Malta | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 21 | `43a8acd0-3dcc-4589-aec1-a3a996d81708` | US FMCSA Hours of Service | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 22 | `44e3ea14-8246-43b0-a01c-28fd3ccdcb8e` | Vermont Department of Environmental Conservation (VT DEC) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 23 | `45c66e48-2428-4636-b2a3-74ec1e64e737` | Commonwealth of the Northern Mariana Islands Legislature | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 24 | `47281d66-21df-4e22-a209-d033a082e8cb` | South Carolina Department of Health and Environmental Contro | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 25 | `47d12be8-c8ac-44f5-8756-7486ec4d1b67` | ACT Legislative Assembly | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 26 | `4ba3fb8d-e31b-4ada-a6d9-0338fb312630` | EU CSDDD — Corporate Sustainability Due Diligence | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 27 | `4cc8d78e-623e-4f96-9e3c-db71e2866364` | UNFCCC NDC Registry | 0 | intergovernmental_body | T3 → T3 keep | MEDIUM | UPDATED |
| 28 | `4df94809-44cf-49d5-b9c5-a6d9b5b4eb14` | IATA DGR — Dangerous Goods Regulations | 0 | industry_association | T1 → T1 keep | MEDIUM | UPDATED |
| 29 | `4f60d453-3dc6-4e87-b3aa-ef96fc4bac35` | J.P. Morgan Eye on the Market (Cembalest) | 0 | vendor_corporate | T3 → T3 keep | MEDIUM | UPDATED |
| 30 | `518a9183-b68f-495b-adb8-8c25cce61bab` | US DOT FMCSA | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 31 | `51c4a672-543d-4f89-bfc0-11d467398d3b` | Korea ETS — KETS | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 32 | `529e725e-38cb-41e2-8df9-1899405855ca` | European Commission – DG MOVE (transport.ec.europa.eu) | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 33 | `5391bc5f-c912-427f-bb1f-c2fb6dc1120b` | Government of Dubai Portal | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 34 | `5457d581-d325-4742-b07c-3eedaab29cae` | CNMI Bureau of Environmental and Coastal Quality (BECQ) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 35 | `5664b6a2-1e50-4ea0-ba69-dd94d40bb068` | Vermont Legislature – General Assembly (statutes & session l | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 36 | `576516c6-899e-4a82-b83b-a63bf44cb20a` | MarineTraffic | 0 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 37 | `584c1c96-5058-4ae3-883d-d2779f315bd4` | Lloyd's Register Marine — Sustainability Research | 0 | standards_body | T2 → T2 keep | MEDIUM | UPDATED |
| 38 | `5a00437c-90e0-442e-9941-e792b312e29f` | TNFD — Taskforce on Nature-related Financial Disclosures | 0 | standards_body | T3 → T3 keep | MEDIUM | UPDATED |
| 39 | `5fa15b40-39d4-4151-b782-4580c77b848a` | BIMCO — Baltic and International Maritime Council | 0 | industry_association | T2 → T2 keep | MEDIUM | UPDATED |
| 40 | `60031159-cc44-4baa-94e6-521298d140aa` | TradeWinds | 0 | trade_press | T5 → T5 keep | MEDIUM | UPDATED |
| 41 | `60ab8dd5-c7b3-4131-a2cb-e81ad31ca951` | European Commission – DG TAXUD (Taxation and Customs Union) | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 42 | `62f5c040-48eb-43b3-aba9-f2698576ff76` | EU AI Act | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 43 | `633ca73a-b5ad-46b5-88f0-4e6a53e70171` | SkyNRG SAF Market Outlook | 0 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 44 | `63a62c3a-8922-4b0a-992d-20b6d7062acc` | Northern Territory Environment Protection Authority (NT EPA) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 45 | `63f33e8f-75c9-4233-8493-e16ac2cf982a` | ESPO (European Sea Ports Organisation) | 0 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 46 | `64524c15-def9-4e04-a9ca-1800a5321989` | OSHA — Transport Safety | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 47 | `65f9e3de-6e4a-4ce3-a9c8-cf4fa75a29d4` | Kentucky Energy and Environment Cabinet (EEC) | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 48 | `664e8147-3199-4159-8c7f-05e6e7ba0e82` | ECOLEX | 0 | intergovernmental_body | T4 → T4 keep | MEDIUM | UPDATED |
| 49 | `67d76814-46aa-4146-a668-a07bbba10c1e` | Aplinkos apsaugos agentūra (AAA – Environmental Protection A | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 50 | `6916fcd9-7551-4479-a5d6-cc702e0b3bce` | DEWA Shams Dubai Program | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 51 | `69b7cfb9-77f8-4d85-a0f4-ea0711d69328` | British Columbia Ministry of Environment and Climate Change  | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 52 | `69c1aebe-d1c0-42f1-a36f-c3fe33cc494d` | ACEA — European Automobile Manufacturers | 0 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 53 | `6b75a323-5a56-4815-a575-70399a91af1e` | Codex Alimentarius — FAO/WHO | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 54 | `719531d9-3688-455a-aff3-453b69fc53a9` | RMI Energy Innovation | 0 | academic_research | T3 → T3 keep | MEDIUM | UPDATED |
| 55 | `71b29085-7625-4f90-8693-946a89377fed` | EFRAG — European Financial Reporting | 0 | standards_body | T2 → T2 keep | MEDIUM | UPDATED |
| 56 | `72661585-957d-4db3-bd73-c4a03cd2e64a` | Sea Cargo Charter | 0 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 57 | `735cb9df-fe9f-414c-96e1-2f7e7d172c98` | Ministry of Commerce & Industry, Government of India | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 58 | `74042f41-644e-4cdc-85a5-58fe9fa3ed15` | Senedd Cymru / Welsh Parliament | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 59 | `76852e81-0c81-49ef-bc2c-eee80337db3f` | Virginia Department of Transportation (VDOT) | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 60 | `7838b821-6c61-4979-9647-f7591d63b7f0` | US FDA — FSMA Sanitary Transportation | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 61 | `79c1a1b4-5885-4206-a034-3cbf11187ee5` | China Customs — GACC | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 62 | `7a31ea18-9109-44e5-8212-bdb772d32a89` | Ministry of Sustainability and the Environment (MSE), Singap | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 63 | `7c4fb882-7bb6-465d-b3b8-cc30ea82984b` | Singapore Carbon Tax — NEA | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 64 | `7fa29bcb-32eb-4d94-afe7-ebb2e2f624eb` | U.S. Energy Information Administration (EIA) | 0 | statistical_data_agency | T2 → T2 keep | MEDIUM | UPDATED |
| 65 | `817bf251-a8af-43c6-b8d6-f0f4304d3bee` | Transport for London (TfL) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 66 | `81c57c2c-09c1-4428-a272-547a668e979b` | Council of the European Union Press | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 67 | `84cfbfba-8351-408b-b490-3b12748ba008` | OECD (Organisation for Economic Co-operation and Development | 0 | intergovernmental_body | T3 → T3 keep | MEDIUM | UPDATED |
| 68 | `874767f5-887e-47a1-ab4d-b12924bc6188` | Assemblée nationale du Québec | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 69 | `88d55c26-8cd0-40b1-8d6d-e52dd0bde6d3` | Australia ACCU — Clean Energy Regulator | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 70 | `89fae12f-63e6-472a-bf11-1fafa6f7b4ec` | European Commission – DG Energy | 0 | primary_legal_authority | T3 → T3 keep | MEDIUM | UPDATED |
| 71 | `8acfd015-bf97-41ca-87c6-b20682a2ff35` | House of Representatives of Cyprus | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 72 | `8b2a7b49-ac16-438c-8596-3b060dcb8b45` | New Jersey Department of Environmental Protection (NJDEP) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 73 | `8bbf8fd5-7ef9-439e-b951-4bacf0f10265` | Hellenic Parliament | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 74 | `8c05c435-6fc6-4b4c-9fb0-cc845ed78501` | Ohio Environmental Protection Agency (Ohio EPA) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 75 | `8de70bd9-d0ac-4d11-8c54-ccf006184f34` | Iowa Legislature | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 76 | `8ee1c94f-c248-4e03-ae90-f3b55c1cd6f6` | New Hampshire General Court (gencourt.state.nh.us) | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 77 | `91128f76-b322-4315-b0f2-5b189958d1db` | Smart Freight Centre | 0 | academic_research | T4 → T4 keep | MEDIUM | UPDATED |
| 78 | `9127af37-57dd-4c07-9d5e-df779077e1a5` | UK Parliament (Westminster) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 79 | `92c05577-d85d-4a07-91a4-88d2f24fb5e6` | Smart Freight Centre | 0 | academic_research | T4 → T4 keep | MEDIUM | UPDATED |
| 80 | `93d68968-3f31-477a-9e68-98f6db7b7a89` | Ellen MacArthur Foundation — Circular Economy | 0 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 81 | `97b05c0a-ad3e-4f8a-87af-7e948297a81c` | Maine Legislature (legislature.maine.gov) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 82 | `97dc4cb5-8061-40c7-8f73-5ea38dd621f4` | Ministry of Oceans and Fisheries, Republic of Korea | 0 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 83 | `987ad67e-288c-4cf0-afdd-4fab324aa4ab` | Kentucky General Assembly (Legislative Research Commission) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 84 | `98831f47-0e27-4b1c-8f32-4023aede92ef` | Kansas Department of Health and Environment (KDHE) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 85 | `99b1ebc5-e5ef-4dfb-9eac-11db887179f1` | EASA — Aviation Environment | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 86 | `9af7f2c3-1538-44d9-bf74-988868410c6a` | Nebraska Department of Environment and Energy (NDEE) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 87 | `9b646f1b-8e80-47e9-9ff5-e19b9142f24c` | La Chambre des représentants de Belgique / Belgische Kamer v | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 88 | `9bc66c9e-b95a-4444-ad74-9182d5703661` | Miami City Commission | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 89 | `9e3f5b77-0a9d-41c4-9703-cdcb55999ce4` | Legislative Assembly of New Brunswick | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 90 | `9fefb65c-1e41-4c6b-a7a1-03982884604f` | Maryland Department of the Environment (MDE) – Air & Climate | 0 | primary_legal_authority | T2 → T2 keep | MEDIUM | UPDATED |
| 91 | `a15d423a-00b9-4e0f-b2d7-00c4a95c98d1` | South Dakota Department of Agriculture and Natural Resources | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 92 | `a1d82459-1ae0-4af9-bbc0-4c11f1ee26a8` | Ministry of Environment of the Republic of Korea (환경부 / ME) | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 93 | `a4c2b71c-b1ca-4892-b28c-aa9b9c24f096` | EUROPEN — European Packaging Environment | 0 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 94 | `a5697e5f-377a-4226-a00f-2488a20b1ddb` | IMDG Code — IMO Dangerous Goods | 0 | intergovernmental_body | T1 → T1 keep | MEDIUM | UPDATED |
| 95 | `a5f13dd2-8785-4573-b0ed-1190fb918a9b` | International Renewable Energy Agency (IRENA) | 0 | intergovernmental_body | T3 → T3 keep | MEDIUM | UPDATED |
| 96 | `a6999c67-3638-477d-838b-4f5a71a3cf82` | EU DG TAXUD — Customs Union | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 97 | `a742c0c6-8ba6-4591-83a0-1bbae63778b5` | IATA Sustainability Centre | 0 | industry_association | T2 → T2 keep | MEDIUM | UPDATED |
| 98 | `a8682ba6-2c30-4c12-a215-c4f37a62fdd8` | Ministry of Environment and Energy (YPEN) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 99 | `ac6ff2e4-c03f-48b1-a757-721e7420ff2f` | American Samoa Environmental Protection Agency (AS-EPA) | 0 | primary_legal_authority | T1 → T1 keep | MEDIUM | UPDATED |
| 100 | `ac7d233a-3e85-40ec-a454-47a6c987f4a2` | Legislature of the Virgin Islands | 0 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |

---

HOLD — batch 8 awaits operator approval

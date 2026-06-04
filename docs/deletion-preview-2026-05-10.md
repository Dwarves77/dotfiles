> **Historical:** 2026-05-09 to 2026-05-11 wave decision-snapshot. Kept for cross-reference. Not a current-architecture spec.

# Deletion preview, 2026-05-10 (revised, title-only matching)

Read-only diff preview. NO DELETE or UPDATE has been executed. Per-row approval required before any destructive action. Replaces prior preview which used title + summary + full_brief matching and produced false positives.

Generated from snapshot post-cold-start. 713 total intelligence_items in scope.

---

## Bucket A: HARD DELETE candidates (title-pattern garbage extractions)

**Count: 66 items.**

### Signature match criteria

Pattern matching restricted to `title` field only (per Claude Code review). Garbage extractions have titles literally describing a fetch failure. Legitimate items have content-describing titles even when the body mentions terms like 'Cloudflare' or 'security check' in passing.

Title regex (three buckets):

- **blocked**: `cloudflare`, `just a moment`, `checking your browser`, `attention required`, `challenge-platform`, `captcha`, `recaptcha`, `hcaptcha`, `security check`, `security verification`, `access denied`, `access restricted`, `access issue`, `access error`, `please verify you are human`, `enable javascript`, `page verification`, `website security/access/verification`, `verification page/portal`
- **not_found**: `404`, `404 not found`, `404 page`, `404 error`, `page not found`, `no longer (available|exists)`, `requested url .+ not found`, `page (has moved|cannot be found|doesn't exist)`, `page error`, `directory and services portal.*404`, `website page not found`
- **maintenance**: `under maintenance`, `temporarily unavailable`, `service unavailable`, `we'll be back`, `scheduled maintenance`, `website service unavailable`, `feed unavailable`, `rss feed unavailable`, `feed change notice`

Validation against prior 6 false positives confirmed: zero of {Battery & Electric Vehicle Technology, ADB Sustainable Transport, Stockholm Environment Institute, ITF International Transport Forum, Journal of Sustainable Transport, Erasmus Smart Port} appear in this title-only list.

### Reason breakdown

| Reason | Count |
|---|---:|
| blocked | 53 |
| not_found | 8 |
| maintenance | 5 |

### By host (top 15)

| Host | Count |
|---|---:|
| www.irena.org | 5 |
| www.espo.be | 2 |
| www.miamigov.com | 2 |
| www.seattle.gov | 2 |
| www.smartfreightcentre.org | 2 |
| www.transportation.gov | 2 |
| aaa.lrv.lt | 1 |
| am.jpmorgan.com | 1 |
| citycouncil.atlantaga.gov | 1 |
| dec.vermont.gov | 1 |
| docs.legis.wisconsin.gov | 1 |
| ecology.wa.gov | 1 |
| eec.ky.gov | 1 |
| epa.ohio.gov | 1 |
| epa.tas.gov.au | 1 |

Most affected hosts are tier-1 regulators behind Cloudflare or recently-restructured government portals (irena.org, parliament.uk, oecd.org, transportation.gov). The fetch-quality filter (PR #86) prevents this on next attempt; the source rows themselves should NOT be removed, only the garbage intelligence_items rows.

### Full row list (sorted by host)

| # | id | title | source host | reasons | created |
|---|---|---|---|---|---|
| 1 | `9b516e5d-9694-4b36-bfc0-ab6bef77fa08` | AAA.lrv.lt Security Verification Page | aaa.lrv.lt | blocked | 2026-05-10 |
| 2 | `d9308d9f-5d16-4141-827d-aced1fac5016` | J.P. Morgan Asset Management - Page Not Found (404 Error) | am.jpmorgan.com | not_found | 2026-05-10 |
| 3 | `ccb5ea23-e5a5-42b4-a0b5-bb6adaba6f3a` | Atlanta City Council Website Access Issue | citycouncil.atlantaga.gov | blocked | 2026-05-10 |
| 4 | `ad88c1f0-81c6-45ee-8fdb-dd6310bd5471` | Vermont DEC Website Access Error - CloudFront 403 Blockage | dec.vermont.gov | blocked | 2026-05-10 |
| 5 | `43b80df9-578d-4843-9417-c59b4c05389b` | Wisconsin Legislature RSS Feed Unavailable - Feed Change Notice | docs.legis.wisconsin.gov | maintenance | 2026-05-10 |
| 6 | `4c557e38-4bca-4624-b8e9-31297b8ed1a8` | Washington State Department of Ecology - Air & Climate Access Issue | ecology.wa.gov | blocked | 2026-05-10 |
| 7 | `2cd8e089-6d0f-4197-91be-595e59c3834d` | Kentucky Economic and Workforce Development Cabinet - Service Unavailable | eec.ky.gov | maintenance | 2026-05-10 |
| 8 | `19a5c8b2-b4c6-4064-9dff-81022a285526` | Ohio EPA Website 404 Error - Page Not Found | epa.ohio.gov | not_found | 2026-05-10 |
| 9 | `ce63aaa6-0504-46a5-95e6-31e3aec58ced` | EPA Tasmania Website Access Error - 403 Forbidden | epa.tas.gov.au | blocked | 2026-05-10 |
| 10 | `faef03bf-a90c-44ba-8f53-899b5ad18784` | New Hampshire General Court Website Access Error | gencourt.state.nh.us | blocked | 2026-05-10 |
| 11 | `a24adad3-d576-4276-af0e-bc7a5b4e721d` | LA City Council Website Page Not Found - Site Redesign | lacity.gov | not_found | 2026-05-10 |
| 12 | `95549473-d234-4d15-be19-24336a326a1a` | Kentucky Legislature Website Service Unavailable | legislature.ky.gov | maintenance | 2026-05-10 |
| 13 | `c2c33477-02c8-470d-9f2e-5abae542b7fa` | Minnesota PUC Website Bot Detection and CAPTCHA Challenge | mn.gov | blocked | 2026-05-10 |
| 14 | `2711c1f7-1bf1-4946-b127-0022c2357203` | NTEPA Website Security Verification Page | ntepa.nt.gov.au | blocked | 2026-05-10 |
| 15 | `6fe50891-43af-41e7-a0e4-fb03faca7f35` | Parliament of Malta Website Access Blocked by Cloudflare Security Service | parlament.mt | blocked | 2026-05-10 |
| 16 | `32dac4c3-bdd2-43b2-9ef3-a418e6761064` | Northern Territory Parliament Website Security Verification | parliament.nt.gov.au | blocked | 2026-05-10 |
| 17 | `ffe449a9-b276-4311-b92c-7c33be802846` | Senedd Cymru Website Access Error | senedd.wales | blocked | 2026-05-10 |
| 18 | `7da15b99-72ff-4244-a691-c8dbe93a159f` | TfL Website Verification Page | tfl.gov.uk | blocked | 2026-05-10 |
| 19 | `032a65b4-fa36-420d-a593-40c0fcf3f8dc` | Newfoundland and Labrador House of Assembly - Scheduled Maintenance | www.assembly.nl.ca | maintenance | 2026-05-10 |
| 20 | `930759fb-5b99-46f2-9d2d-7dd09b1974ec` | Atlanta Sustainability Department - Access Restricted | www.atlantaga.gov | blocked | 2026-05-10 |
| 21 | `f65eac6e-174e-4e19-b5be-b5f8a44d0f98` | Berlin Environmental and Urban Development Portal - Access Restricted | www.berlin.de | blocked | 2026-05-10 |
| 22 | `3b021c7d-93c1-4fd8-9070-f3ddb9a0dcbd` | Hawaii Capitol Website Access Blocked by Cloudflare Security Service | www.capitol.hawaii.gov | blocked | 2026-05-10 |
| 23 | `e6d41c8b-92bb-490c-9d05-88ea676feb54` | Chalmers University of Technology - Department Page (404 Error) | www.chalmers.se | not_found | 2026-05-10 |
| 24 | `cef561e8-1765-4a89-a592-542bc82a562d` | ClassNK Statutory Activities - Access Restricted | www.classnk.or.jp | blocked | 2026-05-10 |
| 25 | `3ef9f5ae-1dc8-4020-8017-9205da0f4c5f` | NH DES Website Access Error | www.des.nh.gov | blocked | 2026-05-10 |
| 26 | `9682b39d-55e9-427f-9351-4809d65357a7` | DPIIT Logistics Division - Access Restricted | www.dpiit.gov.in | blocked | 2026-05-10 |
| 27 | `c473c9c8-db2c-43a6-9640-1f0a1a7dc367` | Finnish Parliament (Eduskunta) Website Access Error | www.eduskunta.fi | blocked | 2026-05-10 |
| 28 | `5ddcfa24-48fa-4285-b57b-20d31edff585` | ESPO Website Security Verification Notice | www.espo.be | blocked | 2026-05-10 |
| 29 | `e7d5f949-dc5e-4872-8b54-ab7ea2dcc3a5` | ESPO Website Security Verification Page | www.espo.be | blocked | 2026-05-10 |
| 30 | `b53e68ef-7063-46bd-9287-ff9e68f6a63e` | Federal Register Implements Programmatic Access Restrictions and CAPTCHA Requirements | www.federalregister.gov | blocked | 2026-05-10 |
| 31 | `9ba2a13b-a452-4884-9dbc-9bb377b4a0f9` | Cloudflare Security Verification - Danish Parliament Website | www.ft.dk | blocked | 2026-05-10 |
| 32 | `32893e98-7ba3-403a-9e61-aa25c4ef517f` | Hellenic Parliament Website Access Denied | www.hellenicparliament.gr | blocked | 2026-05-10 |
| 33 | `2d7f5a1d-0100-4126-bd17-5a06535da11e` | Houston Health Department Environmental Health Page - Access Error | www.houstontx.gov | blocked | 2026-05-10 |
| 34 | `03deee5c-e631-40f0-9c20-2df6b6af996e` | IRENA Publications Portal - Access Error | www.irena.org | blocked | 2026-05-10 |
| 35 | `1ca33f79-a477-44fa-bbcf-5ec6b67f5ca6` | IRENA Data Portal Access Issue - 403 Forbidden Error | www.irena.org | blocked | 2026-05-10 |
| 36 | `7afb70b4-5d96-4a33-94f5-46cc4cc858f3` | IRENA Innovation Outlook - Renewable Ammonia (Access Restricted) | www.irena.org | blocked | 2026-05-10 |
| 37 | `7c88b380-432d-4136-be2f-37aa6fd09822` | IRENA Website Access Issue - 403 Forbidden Error | www.irena.org | blocked | 2026-05-10 |
| 38 | `6be5afaf-8f9b-4fd7-b582-76be8b4d0ff4` | IRENA Access Error - Page Unavailable | www.irena.org | blocked | 2026-05-10 |
| 39 | `e9d1381c-dcb8-43ea-86bf-b6ccd757d688` | ITF-OECD Website Access Issue - Cloudflare Security Verification | www.itf-oecd.org | blocked | 2026-05-10 |
| 40 | `0a215312-041d-4b44-a3be-c14a65e6e4ac` | La Chambre des Représentants - Access Blocked by CAPTCHA | www.lachambre.be | blocked | 2026-05-10 |
| 41 | `93f34fe0-86ac-4aed-91bc-7ff1385edf95` | Iowa Legislature Website Access Blocked | www.legis.iowa.gov | blocked | 2026-05-10 |
| 42 | `80510dc2-d073-42d2-9228-4fc0a852fb92` | MarineTraffic.com Access Blocked by Cloudflare Security Service | www.marinetraffic.com | blocked | 2026-05-10 |
| 43 | `8b842121-83ef-459d-9b72-c01255a3cb3f` | Miami City Government Directory and Services Portal - 404 Error | www.miamigov.com | not_found | 2026-05-10 |
| 44 | `b79bd7f2-4694-4029-986e-eb15252a1ae0` | Miami City Government - Resilience and Sustainability Department (404 Error) | www.miamigov.com | not_found | 2026-05-10 |
| 45 | `daa95467-d84a-416f-9e89-e66d43883553` | MSE SGP 2030 Resource - Access Error | www.mse.gov.sg | blocked | 2026-05-10 |
| 46 | `7bff9194-5edb-4e78-ab5c-e9cff712aeac` | NABERS Website Access Blocked - Rate Limiting/Security Alert | www.nabers.gov.au | blocked | 2026-05-10 |
| 47 | `fdb7aef4-9cd3-4de8-9974-7f649c156b51` | Nashville Energy Programs Page - 404 Not Found | www.nashville.gov | not_found | 2026-05-10 |
| 48 | `38d450e1-16f3-4918-b2a4-e11af5f09dd1` | OECD Environment Directorate - Website Security Verification | www.oecd.org | blocked | 2026-05-10 |
| 49 | `51272137-cd47-4bd7-8549-8c0f570b6b43` | Hungarian Parliament Website - CAPTCHA Access Control | www.parlament.hu | blocked | 2026-05-10 |
| 50 | `c666195c-b69d-48df-925a-c23166cbf418` | Portuguese Parliament Website Access Error | www.parlamento.pt | blocked | 2026-05-10 |
| 51 | `4eb77787-a12d-4739-b8f9-2ebe2c86b307` | ACT Parliament Website Security Verification Status | www.parliament.act.gov.au | blocked | 2026-05-10 |
| 52 | `2d510eea-223f-4d61-9994-39009562bfd2` | Cyprus Parliament Website Security Verification Notice | www.parliament.cy | blocked | 2026-05-10 |
| 53 | `c1aab544-dea7-4b1f-bb4d-4c6cc9788f3b` | Tasmanian Parliament Website Security Verification | www.parliament.tas.gov.au | blocked | 2026-05-10 |
| 54 | `f588c93b-a4e3-45a9-8da2-4317f1785fd5` | UK Parliament Website Security Verification | www.parliament.uk | blocked | 2026-05-10 |
| 55 | `68ff08cd-ec1f-4e1d-b875-de0e545cbbbf` | Parliament of Western Australia - Service Unavailable | www.parliament.wa.gov.au | maintenance | 2026-05-10 |
| 56 | `eedb5b64-ce3b-4dda-bf86-fa592f2c548b` | Seattle City Council Website Access Error - CloudFront 403 | www.seattle.gov | blocked | 2026-05-10 |
| 57 | `488e03d9-7d65-4201-855e-8155bace93f9` | Seattle Environment Department - Access Error | www.seattle.gov | blocked | 2026-05-10 |
| 58 | `c9eca04d-1324-4722-b90d-fdcec00f14d1` | GLEC Framework Emissions Calculation and Reporting Tool - Access Error | www.smartfreightcentre.org | blocked | 2026-05-10 |
| 59 | `8b02d041-1e90-4349-bf94-ecba500e966a` | Smart Freight Centre Website Access Error - CloudFront 403 Blocking | www.smartfreightcentre.org | blocked | 2026-05-10 |
| 60 | `d63b8c74-9bf7-47e4-9180-81adeaf4d88b` | National Freight Strategic Plan - Access Error | www.transportation.gov | blocked | 2026-05-10 |
| 61 | `7c795689-2be5-4cc6-aa27-e8da634cef1f` | National Freight Strategic Plan - Access Restricted | www.transportation.gov | blocked | 2026-05-10 |
| 62 | `91f656a9-e978-4b9f-9430-bbba683c8167` | BCA Green Mark Certification Scheme - Access Error | www1.bca.gov.sg | blocked | 2026-05-10 |
| 63 | `b8d90993-a874-4245-be78-aadec14a09af` | Government of New Brunswick Legislative Page Not Found | www2.gnb.ca | not_found | 2026-05-10 |
| 64 | `54057e9c-4b85-41ec-be8a-9574e2700106` | ym.fi Website Security Verification Page | ym.fi | blocked | 2026-05-10 |
| 65 | `95f1c8c5-8f79-4e6b-9a21-fc48acbd4df0` | YPEN Greece Government Portal - Access Denied | ypen.gov.gr | blocked | 2026-05-10 |
| 66 | `55a7d0e0-ed92-439e-844d-c361be20faa6` | Yukon Environment and Natural Resources - Page Verification | yukon.ca | blocked | 2026-05-10 |

### SQL preview (DO NOT RUN; for review only)

```sql
-- 66 rows. Wrap in transaction. Verify count matches expected before commit.
BEGIN;
DELETE FROM intelligence_items WHERE id IN (
  '9b516e5d-9694-4b36-bfc0-ab6bef77fa08',
  'd9308d9f-5d16-4141-827d-aced1fac5016',
  'ccb5ea23-e5a5-42b4-a0b5-bb6adaba6f3a',
  'ad88c1f0-81c6-45ee-8fdb-dd6310bd5471',
  '43b80df9-578d-4843-9417-c59b4c05389b',
  '4c557e38-4bca-4624-b8e9-31297b8ed1a8',
  '2cd8e089-6d0f-4197-91be-595e59c3834d',
  '19a5c8b2-b4c6-4064-9dff-81022a285526',
  'ce63aaa6-0504-46a5-95e6-31e3aec58ced',
  'faef03bf-a90c-44ba-8f53-899b5ad18784',
  'a24adad3-d576-4276-af0e-bc7a5b4e721d',
  '95549473-d234-4d15-be19-24336a326a1a',
  'c2c33477-02c8-470d-9f2e-5abae542b7fa',
  '2711c1f7-1bf1-4946-b127-0022c2357203',
  '6fe50891-43af-41e7-a0e4-fb03faca7f35',
  '32dac4c3-bdd2-43b2-9ef3-a418e6761064',
  'ffe449a9-b276-4311-b92c-7c33be802846',
  '7da15b99-72ff-4244-a691-c8dbe93a159f',
  '032a65b4-fa36-420d-a593-40c0fcf3f8dc',
  '930759fb-5b99-46f2-9d2d-7dd09b1974ec',
  'f65eac6e-174e-4e19-b5be-b5f8a44d0f98',
  '3b021c7d-93c1-4fd8-9070-f3ddb9a0dcbd',
  'e6d41c8b-92bb-490c-9d05-88ea676feb54',
  'cef561e8-1765-4a89-a592-542bc82a562d',
  '3ef9f5ae-1dc8-4020-8017-9205da0f4c5f',
  '9682b39d-55e9-427f-9351-4809d65357a7',
  'c473c9c8-db2c-43a6-9640-1f0a1a7dc367',
  '5ddcfa24-48fa-4285-b57b-20d31edff585',
  'e7d5f949-dc5e-4872-8b54-ab7ea2dcc3a5',
  'b53e68ef-7063-46bd-9287-ff9e68f6a63e',
  '9ba2a13b-a452-4884-9dbc-9bb377b4a0f9',
  '32893e98-7ba3-403a-9e61-aa25c4ef517f',
  '2d7f5a1d-0100-4126-bd17-5a06535da11e',
  '03deee5c-e631-40f0-9c20-2df6b6af996e',
  '1ca33f79-a477-44fa-bbcf-5ec6b67f5ca6',
  '7afb70b4-5d96-4a33-94f5-46cc4cc858f3',
  '7c88b380-432d-4136-be2f-37aa6fd09822',
  '6be5afaf-8f9b-4fd7-b582-76be8b4d0ff4',
  'e9d1381c-dcb8-43ea-86bf-b6ccd757d688',
  '0a215312-041d-4b44-a3be-c14a65e6e4ac',
  '93f34fe0-86ac-4aed-91bc-7ff1385edf95',
  '80510dc2-d073-42d2-9228-4fc0a852fb92',
  '8b842121-83ef-459d-9b72-c01255a3cb3f',
  'b79bd7f2-4694-4029-986e-eb15252a1ae0',
  'daa95467-d84a-416f-9e89-e66d43883553',
  '7bff9194-5edb-4e78-ab5c-e9cff712aeac',
  'fdb7aef4-9cd3-4de8-9974-7f649c156b51',
  '38d450e1-16f3-4918-b2a4-e11af5f09dd1',
  '51272137-cd47-4bd7-8549-8c0f570b6b43',
  'c666195c-b69d-48df-925a-c23166cbf418',
  '4eb77787-a12d-4739-b8f9-2ebe2c86b307',
  '2d510eea-223f-4d61-9994-39009562bfd2',
  'c1aab544-dea7-4b1f-bb4d-4c6cc9788f3b',
  'f588c93b-a4e3-45a9-8da2-4317f1785fd5',
  '68ff08cd-ec1f-4e1d-b875-de0e545cbbbf',
  'eedb5b64-ce3b-4dda-bf86-fa592f2c548b',
  '488e03d9-7d65-4201-855e-8155bace93f9',
  'c9eca04d-1324-4722-b90d-fdcec00f14d1',
  '8b02d041-1e90-4349-bf94-ecba500e966a',
  'd63b8c74-9bf7-47e4-9180-81adeaf4d88b',
  '7c795689-2be5-4cc6-aa27-e8da634cef1f',
  '91f656a9-e978-4b9f-9430-bbba683c8167',
  'b8d90993-a874-4245-be78-aadec14a09af',
  '54057e9c-4b85-41ec-be8a-9574e2700106',
  '95f1c8c5-8f79-4e6b-9a21-fc48acbd4df0',
  '55a7d0e0-ed92-439e-844d-c361be20faa6'
);
-- Expected: DELETE 66
-- COMMIT or ROLLBACK after manual confirm.
```

---

## Bucket B: FLAG-AND-HIDE candidates (true topic-relevance failures)

**Count: 2 items.**

Mechanism: migration 062 adds `intelligence_items.hidden_reason TEXT NULL`. UPDATE sets `pipeline_stage='archived'` AND `hidden_reason` populated. The integrity-flag column `agent_integrity_phrase` stays single-purpose (not overloaded).

### Items + draft reason text

#### `eb08d16c-f51c-44bd-8f50-0fada86c67d4`

- **Title:** NYC Council Files Lawsuit Against Mayor's Executive Order 50 Allowing ICE Office on Rikers Island
- **Source:** council.nyc.gov
- **Source URL:** https://council.nyc.gov/
- **Created:** 2026-05-10T02:21:03
- **Summary preview:** The New York City Council filed a lawsuit seeking a temporary restraining order and preliminary injunction against Mayor Eric Adams' Executive Order 50, which invites the Trump administration's ICE to

- **Draft `hidden_reason`:**

  > topic_out_of_scope: NYC City Council immigration / sanctuary city lawsuit. Subject matter is sanctuary city immigration enforcement, not freight, transport, sustainability, or any vertical Caros Ledge serves. Source (council.nyc.gov) is legitimate and should remain in the registry; topic gate, not source gate.

#### `0554d47e-3e90-40cb-aced-fcfb42ff793d`

- **Title:** Latvian Saeima Official Homepage - Parliamentary Information and Legislative Portal
- **Source:** www.saeima.lv
- **Source URL:** https://www.saeima.lv/
- **Created:** 2026-05-10T02:39:58
- **Summary preview:** Official website of the Latvian Parliament (Saeima) providing comprehensive information on legislative processes, parliamentary structure, current debates, international cooperation, and public engage

- **Draft `hidden_reason`:**

  > topic_out_of_scope: Latvian Saeima homepage. The page is a parliamentary portal landing, not a freight, sustainability, transport, or operations item. The Haiku classifier promoted a homepage to an intelligence item. Source may be legitimate for future ingestion of specific Latvian transport / sustainability bills; current item is the wrong page.

### SQL preview (DO NOT RUN; for review only)

```sql
-- After migration 062 applies (adds hidden_reason column):
BEGIN;
UPDATE intelligence_items
  SET pipeline_stage = 'archived',
      hidden_reason = 'topic_out_of_scope: NYC City Council immigration / sanctuary city lawsuit. Subject matter is sanctuary city immigration enforcement, not freight, transport, sustainability, or any vertical Caros Ledge serves. Source (council.nyc.gov) is legitimate and should remain in the registry; topic gate, not source gate.'
  WHERE id = 'eb08d16c-f51c-44bd-8f50-0fada86c67d4';
UPDATE intelligence_items
  SET pipeline_stage = 'archived',
      hidden_reason = 'topic_out_of_scope: Latvian Saeima homepage. The page is a parliamentary portal landing, not a freight, sustainability, transport, or operations item. The Haiku classifier promoted a homepage to an intelligence item. Source may be legitimate for future ingestion of specific Latvian transport / sustainability bills; current item is the wrong page.'
  WHERE id = '0554d47e-3e90-40cb-aced-fcfb42ff793d';
-- Expected: UPDATE 2
-- COMMIT or ROLLBACK.
```

---

## Approval gate

Per dispatch v2:

- **Bucket A** (66 rows hard delete): approve all, deny, or sub-select by id
- **Bucket B** (2 rows flag-and-hide): approve reason text per row + confirm migration 062 apply

On approval, a separate execution script will run against the exact id list in this doc and refuse to operate on any id not present here.

Migration 062 must be applied before Bucket B UPDATE can run (`hidden_reason` column required).

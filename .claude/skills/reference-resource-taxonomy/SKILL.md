---
name: reference-resource-taxonomy
description: MISLABELED FILE (2026-05-15 correction). The 7 "resource" categories listed below are actually SOURCE content categories (content-domain umbrellas under which sources are tracked: IMO GHG Strategy is a source, not a resource). Per [[rule-source-vs-resource-distinction]], a true resource taxonomy lists tools/vendors/services the operator USES (EcoVadis, Sphera, Watershed); a source taxonomy lists publishers of change-driven intelligence (regulators, news outlets, research bodies, regulations). The true resource catalog is a separate file (TBD; deferred to a future dispatch). The 7-category content below stays as the active source-content taxonomy until that future dispatch decides how to migrate it.
---

# Reference: resource-taxonomy (7 categories) — MISLABELED

## CORRECTION NOTE (2026-05-15)

This file's title and frontmatter call its contents "resources." Per the architectural distinction codified 2026-05-15 in [[rule-source-vs-resource-distinction]]:

- **Sources** publish change-driven intelligence the operator needs to ACT on (regulations, market signals, research findings, operational data, tech launches). Examples in the lists below: IMO GHG Strategy, FuelEU Maritime, CARB ACT/ACF, ReFuelEU SAF, EU CBAM, CSRD, FIATA, ICCT. These ARE sources.
- **Resources** are tools/vendors/services the operator USES. EcoVadis (currently listed below) is a resource, NOT a source.

The 7 categories listed below are actually SOURCE content categories (content-domain umbrellas under which the platform tracks sources of change-driven intelligence). The file's title is wrong; the contents are useful but mislabeled.

**Migration:**
- This file stays as the active source-content taxonomy until a future dispatch (the source-registry-hygiene dispatch named in [[rule-source-vs-resource-distinction]]) decides whether to:
  - (a) Rename this file to `reference-source-content-categories` and author a NEW `reference-resource-catalog` for actual resources
  - (b) Restructure into two files at the same time as the data cleanup
  - (c) Other
- Until then, treat this file as the SOURCE content taxonomy and treat EcoVadis (and any other true vendor/resource appearing below) as an annotation-pending exception per the EcoVadis comment in Category 5.

## Source

Original `environmental-policy-and-innovation` skill, "Resource Taxonomy" section. The source-vs-resource conflation predates this rule; the conflation is now named.

## The taxonomy

### 1. Ocean Shipping
IMO GHG Strategy, IMO Net-Zero Framework, FuelEU Maritime, EU ETS Shipping, EU MRV, CII Rating, Getting to Zero Coalition, Poseidon Principles, ESPO, Lloyd's Register Decarbonisation Hub, Global Maritime Forum.

### 2. Air Freight
CORSIA, EU ETS Aviation, ReFuelEU SAF, UK SAF Mandate, IATA CO2 Connect, ICAO SAF Dashboard, Airbus ZEROe.

### 3. Road and Land
Euro 7, EU CO2 Trucks, CARB ACT/ACF, EPA Heavy-Duty Phase 3, AFIR, European Clean Trucking Alliance, Drive Electric.

### 4. Trade and CBAM
EU CBAM, WTO Environment and Trade, UK CBAM, FTA environmental provisions, EUDR.

### 5. Compliance and Reporting
CSRD (Omnibus), ISSB/IFRS S2, ISO 14083, GLEC Framework, GHG Protocol Scope 3, CDP Supply Chain, SBTi Transport, EcoVadis (note: EcoVadis is `vendor_corporate` per [[vocabulary-source-tiers]], so it appears here as a tracked-resource category but its source tier is T6 and its content type is vendor SaaS, not regulatory standard).

### 6. Global and Cross-modal
Fit for 55, PPWR, EPA Endangerment Rescission, ICS2, CountEmissions EU, SmartWay, regional Asia/LatAm/MEAF trackers.

### 7. Research and Intelligence
FIATA, ICCT, ITF, NREL, MIT CTL, Sabin Center, Maritime Carbon Intelligence, FreightWaves, GreenBiz, Reuters Sustainable Business.

## Purpose

This taxonomy is the human-readable organization of the active resource set. It is not a vocabulary enforced at write time; the per-item taxonomies (item_type, topic_tags, operational_scenario_tags, compliance_object_tags) carry the structured classification.

This taxonomy is useful for:
- Source-coverage matrix on /research (which categories have what coverage)
- Editorial briefing organization (Weekly Briefing on dashboard groups items by category)
- Operator mental model ("show me everything in Ocean Shipping")
- Source onboarding ([[classifier-source-onboarding]] uses this to determine where a new source fits)

## When the taxonomy needs updating

The taxonomy was designed to be stable. Categories are added when a new content domain emerges that doesn't fit existing categories (e.g., if blockchain provenance for cargo emissions becomes its own regulatory domain, it might warrant a new category). Categories are not removed; if a domain becomes inactive, the category remains for historical context.

## Composition

Used by:
- [[classifier-source-onboarding]] — new sources are slotted into a category as part of onboarding
- [[writer-regulatory-fact-document]] / [[writer-technology-profile]] / etc. — Section 15 / Sources structure references the source's category
- The dashboard's Weekly Briefing — items grouped by category when categories produce coherent groupings

Related:
- [[reference-priority-source-registry]] — the URL list of authoritative sources, indexed against these categories
- v2 audit Section 6.2 (source registry as a curated product)

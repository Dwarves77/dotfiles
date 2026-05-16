---
name: rule-source-vs-resource-distinction
description: Sources and resources are architecturally distinct. Sources publish change-driven intelligence the operator needs to ACT on (regulations, market signals, research findings, operational data, technology launches with material implications). Resources are tools/vendors/services the operator USES to do their work (ESG scoring services, certification bodies, sustainable products, compliance tools, calculators). The platform NEVER ingests vendor self-promotion as intelligence. The two live in separate stores with separate pipelines. Confusing them is the failure mode this rule prevents.
---

# Rule: Source vs Resource Distinction

## Source

Operator instruction 2026-05-15 (mid-dispatch-2.5 clarification). This rule codifies an architectural distinction that was implicit in the original `environmental-policy-and-innovation` skill but never named explicitly. The reference-resource-taxonomy file at the time of this rule's authoring is itself an example of the conflation (its title says "resource" but its contents are source content categories — see that file's correction note).

## The two architectures

### Sources
- Publish change-driven intelligence the operator needs to ACT on
- Examples: a regulator (EU Commission DG CLIMA), a news outlet (Reuters Sustainable Business), a research body (ICCT, MIT CTL), an intergovernmental body (IMO), a parliamentary portal, a press wire that announces new regulations
- Generate `intelligence_items` rows when content changes
- Live in `sources` table
- Are tier-scored (T1-T7 per [[vocabulary-source-tiers]])
- Are classified into 5 axes per migration 063 (source_role, tier, jurisdictions, scope_topics, scope_modes, scope_verticals, expected_output)
- Onboarded via [[classifier-source-onboarding]]

### Resources
- Are tools, vendors, or services the operator USES
- Examples: ESG scoring services (EcoVadis), certification bodies (ISO certifiers), compliance calculators (SBTi tools), sustainable packaging vendors, carbon-offset providers, freight emission accounting software (Sphera, Watershed)
- Do NOT generate `intelligence_items`
- Do NOT appear in the `sources` table for intelligence purposes (a vendor MAY appear as a source if it publishes change-driven intelligence about ITS DOMAIN that is not self-promotional, but that's a narrow exception, not the rule)
- Live in:
  - `reference-resource-taxonomy` (the canonical catalog with categories, future)
  - The vendor directory in the community layer (post-launch, with peer endorsements and use-case notes)

## How operators become aware of resources

Three legitimate pathways:

1. **A client requires the resource.** This IS captured as a market signal (intelligence item), but the signal is the CLIENT'S announcement / RFP / requirement, not the resource's own self-promotion. The client's "we now require ISO 14083 reporting from carriers" is a market signal that goes through the source pipeline. The resource (the auditor or tool that does ISO 14083 reporting) is referenced in the brief but is NOT itself a source.

   This is the load-bearing distinction: a client-demand signal that names a resource IS intelligence (market_signal_brief format per [[writer-market-signal-brief]]); the vendor mention is incidental to the demand signal which is the actual content. Example: "Brand X now requires all carriers to hold an EcoVadis Gold rating by Q1 2027" is a market signal; the source is Brand X's announcement; EcoVadis appears in the brief as the resource the demand references. EcoVadis itself does NOT become a source.

2. **Peer recommendations in the community layer.** Resources get endorsed and discussed by operator peers in the community context per [[rule-community-attributed-output]]. This is community content, not source content.

3. **The operator's own onboarding configuration.** During workspace setup, the operator declares which resources they use (e.g., EcoVadis subscriber, Sphera customer, Watershed customer). This populates workspace settings for personalization but does not create source rows.

## Change-driven vs static (the load-bearing distinction)

The cleanest test for source vs resource is **change-driven vs static**. Per operator clarification 2026-05-15:

- **CHANGE-DRIVEN content** is intelligence regardless of publisher authority level (subject to per-page tier acceptance per [[classifier-page-routing]]). A regulator's amendment to Article 4 is change-driven; a trade press article about a competitor's new product launch is change-driven; a research paper publishing a new finding is change-driven.
- **STATIC content** is community/catalog regardless of publisher authority level. A publisher's existence, their methodology page, their calculator, or their service description is STATIC. These belong in resource catalog and the community vendor directory.

A publisher's existence, methodology, calculator, or service is NOT intelligence. The publisher's PUBLICATION OF A CHANGE (updated methodology, new product launch, acquisition, service withdrawal, position shift) IS potentially intelligence at the appropriate tier on /market.

Examples (from operator):

- "Gallery Climate Coalition exists" → community resource catalog
- "Gallery Climate Coalition updates methodology to include Scope 4" → /market at T6 (trade press for the art freight sector), with plain-language confidence label per [[rule-internal-vs-external-surface]]
- "ROKBOX exists" → community vendor directory
- "ROKBOX launches new product line addressing CITES paperwork reduction" → /market at T6, plain-language confidence label

The judgment shifts from "is the publisher a vendor?" to "is the CONTENT change-driven?" A vendor's change-driven announcements ARE intelligence at their tier. A regulator's static "About Us" page is NOT intelligence.

## What the platform NEVER ingests

The platform NEVER ingests static vendor self-promotion as intelligence. Specifically (when the content is STATIC):

- A vendor's "About Us" or "We Provide X" landing page
- A vendor's marketing collateral describing existing services (not announcing changes)
- A trade association membership page that lists the vendor as a member
- A cookie banner, terms-of-service page, or privacy policy from a vendor site
- A vendor's LinkedIn announcement that the vendor exists (vs an announcement of a change like a new product launch, which IS ingestible)

These are RESOURCES (descriptions of who the vendor is and what they sell, in static form) and belong in the resource catalog or vendor directory.

The legitimate ingestible content from a vendor: change-driven announcements. A vendor's own press release announcing a NEW product launch, an acquisition, a service withdrawal, a position shift, or a methodology change IS potentially a market signal (per [[writer-market-signal-brief]]) at the vendor's appropriate internal tier (T5-T6) with plain-language confidence labeling at the card surface.

The judgment: would this content exist if the vendor had no NEW change to announce? If yes (it's a description of an existing service), it's static and is a resource. If no (it exists because something changed and the vendor announced the change), it's change-driven and can be a market signal at the vendor's tier.

## Failure mode signature (the bug this rule prevents)

Items appearing on `/regulations` or `/market` that are vendors describing their own services. The audit identified specific examples that should never have entered the source registry:

- Cookie banner text from a vendor website
- Vendor LinkedIn announcements about themselves
- Trade association membership pages
- "About Us" / "We Provide X" landing pages
- Vendor sales decks reframed as research

Per the v2 audit's EcoVadis finding (2026-05-15): EcoVadis was classified as a market intelligence source despite being a vendor-corporate (T5/T6) entity providing audit services. Migration 074 reclassified EcoVadis. The reclassification fixed THAT instance; this rule prevents future instances by codifying the distinction upstream.

## Behavior at the source-onboarding boundary

[[classifier-source-onboarding]] applies this rule at the URL evaluation step:

1. Examine the URL's primary content type. Is it:
   - **Change-driven intelligence:** "we published a new study," "the regulator amended Article 4," "the Commission opened a consultation," "the court ruled on X" → proceed with source onboarding
   - **Self-promotional:** "we exist," "we provide service X," "join our membership," "subscribe to our tool" → route to resource-taxonomy review, NOT source onboarding

2. For ambiguous cases (vendor publishes industry analysis alongside sales content), apply the judgment above: would this content exist absent a sales motion? Examine the specific URL, not the publisher's overall posture.

3. When a source proposes that turns out to be a resource on review, flag the URL as `resource_candidate` rather than discarding it; the operator may want to capture it for the resource catalog.

## Where each store lives

| Store | What it holds | Pipeline |
|---|---|---|
| `sources` table | Change-driven publishers tracked for intelligence | [[classifier-source-onboarding]] → tier + 5-axis classification → ingestion → intelligence_items |
| `intelligence_items` | The change-driven content sources published | Agent regeneration via /api/agent/run, applying writer skills |
| `reference-resource-taxonomy` skill | Canonical catalog of resources by category | Operator-curated; updated via dispatch with operator approval |
| Vendor directory (community layer, future) | Peer-endorsed resources with use-case notes | Community-context contributions per [[rule-community-attributed-output]] |
| `workspace_settings` | Per-tenant declarations of which resources they use | Onboarding configuration |

## Composition

- Composes with: [[classifier-source-onboarding]] (the boundary enforcer), [[vocabulary-source-tiers]] (legitimate sources get a tier; resources do not), [[reference-resource-taxonomy]] (the destination for resources), [[rule-community-attributed-output]] (peer endorsements of resources happen in community context)
- Inherited by: [[classifier-source-onboarding]], any future writer or extractor that touches the source-vs-resource boundary
- Composes with: [[rule-synthesis-from-primary-sources]] (active synthesis works on PRIMARY sources; resource self-promotion is not a primary source even if it appears authoritative on the vendor's domain)

## What this rule is NOT

- Not a prohibition on resources being useful. Resources ARE useful; the operator's job often requires them. The rule prevents resources from POLLUTING the intelligence feed, not from existing.
- Not a vendor blacklist. Specific vendors are not banned; vendor self-promotion content is not ingested. The same vendor's independent industry analysis (if any) IS ingestible.
- Not a blocker for community discussion of resources. Community contributions per [[rule-community-attributed-output]] can name and discuss any resource; that's peer commentary, not platform intelligence ingestion.

## Companion data-cleanup dispatch (separate)

This rule codifies the architectural distinction. The data-cleanup needed to bring the current `sources` table into compliance is a SEPARATE dispatch (source-registry-hygiene). Its scope (per operator 2026-05-15):

1. **Reclassify (wrong page routing):** items currently misrouted by page (Norway fjord ops items appearing on /regulations that should be /operations, etc.). Mechanical UPDATE based on [[classifier-page-routing]] rules.
2. **REMOVE entirely (not sources at all):** EcoVadis, BREEAM, vendor PR pages, cookie banners, biographies, off-topic items (Boston housing), Gallery Climate Coalition as a source (it's a community/resource), trade association membership pages. These are category errors, not misclassifications; deletion is the correct treatment.
3. **Reassign to vendor directory:** legitimate resources that belong in the future community-layer vendor directory (EcoVadis as a vendor, ROKBOX, Earthcrate, etc.). Staged in [[reference-resource-taxonomy]] or a holding table until the vendor directory ships.
4. **Delete intelligence_items derived from tool/vendor sources:** these items are category errors, not misclassifications. Operator approves the deletion list (with row count) before execution per [[operational-backfill-pattern]].
5. **Update [[classifier-source-onboarding]]** to inherit this rule as a hard gate. (Done as part of Dispatch 2.5; the data cleanup is the future dispatch's scope.)

Standing scope items the future source-registry-hygiene dispatch will also address (per operator 2026-05-15):
- 39 AMBIGUOUS triage
- 130 corporate expansion
- 185 unknowns
- Lloyd's Register split (the analytical publications vs the classification services)
- Wave 1c classifier scope

## Audit cross-reference

- Migration 074 (`074_ecovadis_vendor_reclass.sql`) — reclassified 5 EcoVadis sources from market_intel to vendor_corporate; the specific instance that motivated codifying this rule
- v2 audit Section 2 / Market Intel assessment (vendor-promo items polluting the market signal feed)
- Operator instruction 2026-05-15 (the explicit articulation that produced this rule + the data-cleanup scope above)
- [[reference-resource-taxonomy]] correction note (the existing file is mislabeled — its contents are source content categories, not resources; the true resource catalog is a future dispatch)

---
id: ADR-041
title: Community is social only; no Community-derived content feeds any other surface
status: accepted
date: 2026-10-03
scope: fsi-app/src/app/community, fsi-app/src/components/community, fsi-app/src/lib/community, and every surface that previously read Community data
supersedes: docs/specs/05-community.md section 4 gates 2-5 and section 5 components 5, 6, 7, 10 and acceptance criteria 1, 2, 4, 7, 8, 9; docs/specs/02-market-intel.md section 6 item 4 as a Community-fed signal path; docs/plans/complete-build-plan-2026-10-01.md Wave 5 lane L16
related: ADR-035, ADR-039
---

## Decision

Operator ruling, 2026-10-03, verbatim: "Community is a resource for people to discuss what they're doing
in their own regions and how they're working through things if they wanna link a regulation or something
that they wanna talk about from the system that's OK, but we should not be using community to feed data
into the rest of the pages absolutely not." And: "It is a social place. It is not a source of
information."

The rule: system to Community links are allowed. No Community-derived content, count, state or aggregate
may appear on, or feed, any page or pipeline outside `/community` (and its own API).

## Reasons

- Community is a human peer surface, outside machine intake by construction. A path from a member's post
  into the intelligence corpus makes unverified member content a source, which the product's grounding
  doctrine forbids.
- Live data on 2026-10-03 (read-only SELECT): `community_posts` 0 rows, `post_promotions` 0 rows, no
  promoted or linked `staged_updates` or `intelligence_items`. Removal needs no data migration.
- The promotion machine (spec 05 section 4) was never built to its gates; keeping the half-built outbound
  paths (editorial pickup, the peers strip, the Map dots, the Dashboard counts) would leave code that
  contradicts the ruling.

## Consequences (what lane C-SOCIAL removed or changed)

Code:
- Detail pages (regulations, market, research): the `PeersDiscussingStrip` mount and all `peersEntityId`
  plumbing; the component is deleted; `fetchInstrumentEntityId` in `resource-lookup.ts` is deleted (the
  strip was its only consumer).
- Map: the community activity query, the `communityActivity` prop, the dots and the legend row.
- Dashboard and nav: `getCommunityPulse`, `CommunityPulseThread`, `mapCommunityPulseThreads`,
  `fetchCommunityCounts`, the Community rail stat and the Community nav count. The Community nav link stays.
- Admin: `CommunityPickupsQueueView`, the Community pickups tile, section and count; the pickups count and
  the "editorial review" line on the Community page.
- Promote and ladder: the promote route, `PromotePostDialog`, `PromotePostButton`, the corroboration route,
  `corroboration.mjs`, `lineage-guard.mjs`, `decay.mjs` (its only consumer was the age chip),
  `CorroborationChip`, `PromotionStateBadge`, `EvidenceAgeChip`, and the `promotion_state`, `origin_class`,
  `stance`, `evidence_chip`, `promoted_at`, `promoted_to_item_id` fields in selects and types. The entity
  threads route stays (the Community entity discovery panel uses it). `promoted_from_post_id` stays (a
  repost link inside Community).
- Health: the `map` surface no longer counts `community_posts`.
- Smoke and registries: community smoke, admin tile smoke, map smoke, audit specs, layout manifest, db
  catalog and the shared-dataset inventory updated to match.

Schema: migration 348 (`348_community_social_only.sql`, authored here, applied after the PR merges) drops
`post_promotions` and the five promotion columns on `community_posts`. It does not touch `origin_class` on
any other table or the shared vocabulary values.

Docs: spec 05 section 4 replaced with this rule and the superseded components and acceptance criteria
marked; spec 00 section 3.6 notes no Community producer assigns `community` or `community-corroborated`;
the build plan marks L16 superseded; the platform-intent and analysis-construction skills reworded.

## Design changes owed

The admin summary grid now has seven tiles where artboard 13 draws eight (the Community pickups tile is
removed). This goes on the DESIGN CHANGES OWED list for Claude Design (rule 20). The Map key returns to the
four entries artboard 10 draws.

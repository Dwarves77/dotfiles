# Caro's Ledge Sprint 2 Planning, 2026-05-18

**Date:** 2026-05-18
**Author:** synthesis dispatch consolidating all Sprint 1 audits + Chrome live findings + rewritten platform-intent skill (commit 49628a0)
**Status:** PLAN ONLY. No code. No dispatches. Operator authorizes individual builds after review.
**Branch:** `feat/sprint-1-phase-5-implementation` at 02539ff (plus three unmerged fix branches; see Pre-Sprint-2 readiness)

**Operator priority for this plan:** make the customer-facing surfaces actually deliver. Onboarding is explicitly DE-PRIORITIZED per operator direction; if the surfaces a new user lands on are broken, onboarding mechanics are moot.

**Source materials synthesized:**
- [System audit 2026-05-18](docs/sprint-1/system-audit-2026-05-18.md)
- [Critical investigations 2026-05-18](docs/sprint-1/critical-investigations-2026-05-18.md)
- [Schema reconciliation Stage 1 discovery](docs/sprint-1/schema-reconciliation-discovery-2026-05-18.md)
- [Alignment audit 2026-05-18](docs/sprint-1/alignment-audit-2026-05-18.md)
- [Intelligence Assistant audit 2026-05-18](docs/sprint-1/intelligence-assistant-audit-2026-05-18.md)
- [Onboarding audit 2026-05-18](docs/sprint-1/onboarding-audit-2026-05-18.md)
- Operator's Chrome live audit findings (in-conversation)
- [Sprint-1 followups OBS-1 through OBS-23](docs/sprint-1/followups.md)
- [caros-ledge-platform-intent SKILL.md](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md) at 49628a0
- [environmental-policy-and-innovation SKILL.md](fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md)
- [sprint-followups-discipline SKILL.md](fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md)
- [design-principles.md DP-1](docs/design-principles.md)

---

## Executive summary

Caro's Ledge has five customer-facing surfaces per the rewritten platform-intent skill. The honest state, post-Tier-1-and-Tier-2-fixes:

| Surface | State | Highest-impact gap |
|---|---|---|
| Regulations | Functional | Taxonomy bleed (industry coalitions and initiatives surfacing here instead of Market Intel or Research; downstream of category routing orphan) |
| Market Intel | Broken | Shares unfiltered payload with Operations because category-aware RPC is orphaned; no signal aggregation engine; alerts SideCard now interactive (Tier 2 supplemental did not address; still non-interactive) |
| Research | Broken | Editorial draft-staging queue, not horizon-scan destination; analytical-press sources registered as legacy resources, no live ingest pipeline producing Research Summary briefs |
| Operations | Broken | Cross-functional decision intelligence content 6 of 7 capabilities ABSENT; regex chip matchers mis-attribute wiring gaps as coverage gaps; per the rewritten skill, this is a content build not a separate decision-engine UI build |
| Community | Partially functional | Cohort-narrow (vendors all art-logistics-specific); sidebar placement treats it as sibling app not co-equal surface; region taxonomy forks from intelligence surfaces |

Plus three cross-cutting capabilities:

| Capability | State | Highest-impact gap |
|---|---|---|
| Map | Functional (as a view of Regulations) | "Facility" mode toggle exceeds Regulations scope per skill Section 4 (operator decision pending) |
| Intelligence Assistant | Partially constrained | Tier 1 stripped decision-engine output; zero platform-skill loading and structurally-impossible citation surfacing remain (Sprint 2 Tier 3) |
| Onboarding | Partially functional | DE-PRIORITIZED for this plan per operator direction; tracked separately, not gating customer-facing builds |

Sprint 2 builds the customer-facing surfaces against the binding five-surface model and three cross-cutting capabilities defined in [caros-ledge-platform-intent SKILL.md](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md). Sprint 1 shipped foundations and chrome remediation; Sprint 2 starts visible value delivery.

---

## Pre-Sprint-2 readiness checklist

The following must land before Sprint 2 customer-facing builds dispatch, OR be explicitly deferred with operator decision. None of these are Sprint 2 builds themselves; they are the foundation Sprint 2 builds against.

| Item | State | Owner / dispatch |
|---|---|---|
| **Merge Tier 1 (Assistant prompt surgery)** | Pending merge on `feat/tier1-assistant-constraint` at e0b1f98 | Operator authorizes merge |
| **Merge Tier 2 (UI hygiene + supplementary)** | Pending merge on `feat/tier2-ui-hygiene` at 9b97c3c | Operator authorizes merge |
| **Merge Onboarding fix (sector destination)** | Pending merge on `fix/onboarding-sector-destination` at c42db14 | Operator authorizes merge |
| **Merge Phase 5 implementation (PR #122)** | OPEN | Operator authorizes merge |
| **Schema reconciliation Stage 2** | Stage 1 discovery DONE; Stage 2 not yet dispatched | Operator authorizes; recommended HYBRID: backfill ledger for 23 applied + 2 DML-only entries in 026-050; apply-then-backfill for 048 + 049; apply 050 last |
| **OBS additions consolidation (proposed OBS-24 through ~OBS-40)** | NOT YET ADDED to followups.md | Operator authorizes; tracked below |
| **Doc cleanup pass (revise OBS-18, OBS-19 routing; system-audit conclusion; critical-investigations sequencing)** | NOT DONE | Sprint 1 cleanup dispatch |
| **Critical #1 (trigger derive-from-canonical) migration 083** | Designed in concept; not implemented | Operator decides: pre-Sprint-2 OR Sprint 2 Tier 3 |
| **REC-OBS-G category routing wiring** | NOT DONE | Sprint 2 Tier 3 (foundation under Market Intel + Research + Operations builds) |

**Operator decision point #1:** authorize the three fix-branch merges + PR #122 merge. These ship immediate visible improvements with no architectural risk. Cheapest meaningful improvement available today.

**Operator decision point #2:** authorize Stage 2 schema reconciliation. Without it, integrity_flags table remains absent (admin views silently return empty) and the 25-migration ledger drift continues to mask the actual schema state.

**Operator decision point #3:** authorize OBS additions consolidation. Without this, ~20 audit findings stay in audit docs but do not propagate into followups.md and future dispatches will miss them on loop-closure.

---

## Consolidated audit findings

All findings across all 6 audits + Chrome live audit + Tier 1/2/Onboarding fixes. Status tracks whether the finding is FIXED (in a shipped or pending-merge commit), OPEN (no fix yet), CLEARED (false alarm), or DEFERRED.

### Intelligence Assistant findings

| ID | Finding | Status | Where |
|---|---|---|---|
| Assistant F-1 | Zero platform skills loaded at query time; environmental-policy-and-innovation never enters system prompt | OPEN | Sprint 2 Tier 3 |
| Assistant F-2 | System prompt instructs decision-engine behavior (WHAT TO DO, owners, deadlines, per-sector risk grades) | **FIXED** | `feat/tier1-assistant-constraint` at e0b1f98 (pending merge) |
| Assistant F-3 | SELECT omits source_id, source_url, intersection_summary, related_items, full_brief; structured citation impossible | OPEN | Sprint 2 Tier 3 |
| Assistant self-description | Static string omitted Research + Community surfaces | **FIXED** | `feat/tier2-ui-hygiene` at 9b97c3c (pending merge) |
| Assistant decision-engine boundary | Live walkthrough confirmed CBAM response with action plan + owners + per-sector risk; this is the F-2 evidence | **FIXED via Tier 1** | Same as F-2 |

### UI hygiene findings (Chrome live + code audits)

| ID | Finding | Status | Where |
|---|---|---|---|
| Phase-D leak /research load-more | Customer-facing phase reference | **FIXED** | Tier 2 |
| Phase-D leak /research source coverage matrix | Customer-facing phase reference | **FIXED** | Tier 2 |
| Phase-D leak OnboardingWizard LinkedIn card | Customer-facing phase reference | **FIXED** | Tier 2 |
| Phase-D leak Community search toast | Customer-facing phase reference | **FIXED** | Tier 2 (found by Tier 2 agent, not in original brief) |
| Phase-D leak Community events backend | Customer-facing phase reference | **FIXED** | Tier 2 |
| Phase-D leak Community vendors backend | Customer-facing phase reference | **FIXED** | Tier 2 |
| Phase-D leak reactions API route copy | Customer-facing phase reference | **FIXED** | Tier 2 |
| Phase-C/D leak Settings notifications | Customer-facing phase reference | **FIXED** | Tier 2 |
| Phase-D leak BriefingScheduleSection | Customer-facing phase reference | **FIXED** | Tier 2 |
| Phase-D leak SavedSearchesSection | Customer-facing phase reference | **FIXED** | Tier 2 |
| Phase-D leak UserProfilePage | Multiple Phase-D strings in stat meta, tooltips, ARIA | **FIXED** | Tier 2 |
| Phase-D leak Community Post reactions | Customer-facing phase reference | **FIXED** | Tier 2 |
| Phase-D leak Moderation actions | PHASE_D_NOTE_MUTE constant leaked + Phase D fallback toast | **FIXED** | Tier 2 |
| Phase-D leak Operations ComingSoonBanner | Customer-facing phase reference | **FIXED** | Tier 2 |
| Database identifier leak /market intelligence_items.market_data | Schema identifier in customer copy | **FIXED** | Tier 2 |
| Database identifier leak /market action_owner | Schema identifier in customer copy | **FIXED** | Tier 2 |
| Worker-language leak /market EmptyState (item_type) | Internal worker language in customer copy | **FIXED** | Tier 2 |
| Worker-language leak /regulations detail (ingestion worker populates penalty_range) | Internal worker language in customer copy | **FIXED** | Tier 2 |
| Worker-language leak /operations (regional_data + multiple) | Schema identifier and worker language | **FIXED** | Tier 2 |
| Duplicate Technology category on /market | Render-layer key collision between topic + fallback string | **FIXED** | Tier 2 (root cause: render-layer) |
| Test/seed data on Dashboard REPLACED rail (ss1, ss2, ss3, ss5) | Fetch-layer omission of `title`; legacy_id leaked as display | **FIXED** | Tier 2 (root cause: missing `title` projection) |
| "Ingest" / "source monitoring system" leaks | Internal worker language | **FIXED** | Tier 2 (WatchlistSidebar + RegionalIntelligence) |
| Affected Lanes worker-language leak /regulations detail | Customer-facing schema reference | **FIXED** | Tier 2 supplementary |
| Map "Facility" mode toggle | Scope drift; Map is a view of Regulations per skill Section 4 | FLAGGED | Tier 2 (operator decides: remove from toggle OR rescope Map + update skill) |

### Schema / data findings

| ID | Finding | Status | Where |
|---|---|---|---|
| Critical #1 (jurisdiction_iso) | Trigger semantic gap: `_normalize_jurisdictions` does not derive jurisdiction_iso from canonical jurisdictions; 362 of 655 rows affected; NOT a Phase 5 bug | OPEN | Sprint 2 Tier 3 (migration 083); proposed OBS-24 |
| Critical #2 (integrity_flags + ledger) | 25-migration ledger drift; integrity_flags genuinely absent (migration 048 unapplied); recurring_spot_check_log is a phantom | OPEN | Schema reconciliation Stage 2 pending; proposed OBS-25 |
| Migration 070 deleted from disk | Recorded in ledger; RPCs intact via 071/073 CREATE OR REPLACE; source-history loss only | OPEN | Stage 2 decides: reconstruct placeholder OR accept loss |
| Migration 063 column shadowing on sources.tier + sources.jurisdictions | IF NOT EXISTS no-op masked intended ALTER; 5-axis classification framework's intended schema for these two columns never took effect | OPEN | Sprint 2+ (decide ALTER fix vs accept divergence vs parallel columns) |
| 26 SECURITY DEFINER functions in operator domain | Privilege-escalation surface | OPEN | Future audit dispatch; proposed REC-OBS for separate workstream |
| Onboarding wizard sector destination (profiles.sector_overrides) | Persistence wrong column; per-user composition layer unwired | **FIXED** | `fix/onboarding-sector-destination` at c42db14 (pending merge); orphan SectorOnboarding.tsx deleted |
| Invitation-accept skips wizard | No sector customization on invitation flow | OPEN | DEFERRED per operator (onboarding de-prioritized) |
| Supabase Auth default email provider | No custom SMTP; rate-limit and reliability issues; existing-email signup silently no-ops | OPEN | DEFERRED per operator (onboarding de-prioritized) |

### Sprint scope / architectural findings

| ID | Finding | Status | Where |
|---|---|---|---|
| Category-aware routing RPCs orphaned | `get_market_intel_items`, `get_research_items`, `get_operations_items` exist in DB but no src/ code calls them; /market + /operations share unfiltered payload via `get_workspace_intelligence_slim`; /research has no category filter | OPEN | Sprint 2 Tier 3 (REC-OBS-G remediation); foundation under items 2-4 |
| Category mappings in orphan RPCs would still misroute | IMO + ICAO → research (skill says regulatory); Carbon Trust + Project Drawdown → operations (skill says research); FreightWaves + Loadstar → market_news (skill says research) | OPEN | Sprint 2 Tier 3 (must refine mappings during wiring) |
| No canonical four-category column on sources | `source_role` is 10-value vocab; canonical-four lives implicitly in orphan RPCs | OPEN | Sprint 2 Tier 3 (schema add + classifier wiring per OBS-9 Sprint 2 pre-decisions) |
| Operations as separate decision-engine UI build | Wrong framing per rewritten skill Section 3 + 11 (anti-pattern); is structured content + Intelligence Assistant + customer judgment | CLARIFIED | Skill rewrite at 49628a0; OBS-19 routing needs revision |
| /admin route gate scope mismatch | Workspace-membership gate, platform-scoped surface; no is_platform_admin check; zero platform_admins exist in DB | OPEN | Sprint 2 (closes via `requirePlatformAdmin()` per OBS-17) |
| `/admin` audit log tab placeholder | ComingSoonBanner with tab strip advertising; per OBS-23 | OPEN | Sprint 2 (hide tab OR implement minimal view) |
| Anti-pattern framings in OBS-18, OBS-19 (route customer-facing remediation to Phase 7) | Captured pre-skill-rewrite; entries need in-place revision | OPEN | Sprint 1 doc cleanup pass |
| System audit conclusion "Sprint 1 has shipped substantive infrastructure" without value-delivery clarification | Anti-pattern instance; predates skill rewrite | OPEN | Sprint 1 doc cleanup pass |
| Critical-investigations sequencing absorbs customer-facing slip silently | Anti-pattern instance; predates skill rewrite | OPEN | Sprint 1 doc cleanup pass |

### Community structural findings

| ID | Finding | Status | Where |
|---|---|---|---|
| Sidebar placement contradicts co-equal model | Community separated from intelligence-pages block; sits in account-chrome zone | OPEN | Sprint 2 Tier 4 (structural alignment) |
| Chrome divergence on Community entry | "← Back to Caro's Ledge" navigation reflow on Community routes | OPEN | Sprint 2 Tier 4 |
| Region taxonomy fork | Community uses friendly names (EU/Europe, United Kingdom); intelligence surfaces use ISO codes (US-CA, AU-ACT) | OPEN | Sprint 2 (region taxonomy unification) |
| Cohort gap in Community vendors | All vendors art-logistics-specific (Chenue, Mtec, Earthcrate, Rokbox); zero broader-cohort coverage | OPEN | Sprint 2+ Community cohort expansion |

### Regulations content findings

| ID | Finding | Status | Where |
|---|---|---|---|
| Gallery Climate Coalition surfacing under Regulations | Industry coalition, should be Market Intel or Research | OPEN | Downstream of category routing wiring (REC-OBS-G); fix lands once routing wires |
| The Decarb Hub surfacing under Regulations | Industry initiative, should be Market Intel or Research | OPEN | Same as above |
| Dashboard regulation-centric | Dashboard does not reflect five-surface model; per Chrome audit | OPEN | Sprint 2+ Tier 4 |

---

## Consolidated OBS additions roadmap

Currently in followups.md: OBS-1 through OBS-23 (committed at 3d887c0). Audit findings since then warrant ~15-20 new entries. NOT YET ADDED; operator authorizes batch addition.

### High-priority new OBS (proposed)

| Number | Title | Severity | Owner | Cross-references |
|---|---|---|---|---|
| OBS-24 | Trigger `_normalize_jurisdictions` does not derive jurisdiction_iso from canonical jurisdictions; 362 of 655 rows affected | HIGH | Sprint 2 Tier 3 (migration 083) | OBS-4, OBS-13 (orthogonal) |
| OBS-25 | 25-migration schema ledger drift (versions 026-050 unrecorded, plus 070 deleted, 078 unauthored); 048 + 049 genuinely unapplied | CRITICAL | Schema reconciliation Stage 2 dispatch | OBS-17, OBS-14 |
| OBS-26 | Category-aware routing RPCs orphaned; /market + /operations share unfiltered payload; /research has no category filter (was REC-OBS-G) | HIGH | Sprint 2 Tier 3 (foundation) | OBS-9 (classifier loop), OBS-14, OBS-17 |
| OBS-27 | Intelligence Assistant zero platform skill loading at query time (was Assistant F-1) | HIGH | Sprint 2 Tier 3 | OBS-26, OBS-29 |
| OBS-28 | Intelligence Assistant citation surfacing structurally impossible (SELECT field omission; was Assistant F-3) | HIGH | Sprint 2 Tier 3 | OBS-27 |
| OBS-29 | Operations as content build, NOT separate decision-engine UI; 6 of 7 capabilities ABSENT (was REC-OBS-H) | HIGH | Sprint 2 Tier 4 (content build) | OBS-19 (needs revision); OBS-26 prerequisite |

### Medium-priority new OBS (proposed)

| Number | Title | Severity | Owner |
|---|---|---|---|
| OBS-30 | Migration 063 column shadowing (sources.tier + sources.jurisdictions); 5-axis framework's intended schema never took effect | MEDIUM | Sprint 2+ (decide ALTER fix vs accept vs parallel columns) |
| OBS-31 | Sprint 1 docs contain anti-pattern framings the platform-intent skill was created to prevent (was REC-OBS-I); OBS-18 + OBS-19 + system-audit conclusion + critical-investigations sequencing | MEDIUM | Sprint 1 doc cleanup pass |
| OBS-32 | Community sidebar placement contradicts co-equal surface model | MEDIUM | Sprint 2 Tier 4 (structural alignment) |
| OBS-33 | Community chrome divergence on entry ("← Back to Caro's Ledge" reflow) | MEDIUM | Sprint 2 Tier 4 |
| OBS-34 | Region taxonomy fork: Community friendly names vs intelligence ISO codes | MEDIUM | Sprint 2 (region unification) |
| OBS-35 | Community cohort gap: all vendors art-logistics-specific | MEDIUM | Sprint 2+ Community cohort expansion |
| OBS-36 | Regulations taxonomy bleed (Gallery Climate Coalition, The Decarb Hub surfacing under Regulations) | MEDIUM | Downstream of OBS-26 routing wiring |
| OBS-37 | Intelligence Assistant inline-interaction redesign (Option B per operator decision) | MEDIUM | Sprint 2+ Tier 4 |

### Low-priority new OBS (proposed)

| Number | Title | Severity | Owner |
|---|---|---|---|
| OBS-38 | 26 SECURITY DEFINER functions in operator domain (privilege-escalation surface) | LOW | Future audit dispatch (separate workstream) |
| OBS-39 | Map mode toggle "Facility" scope drift per skill Section 4 | LOW | Operator decision (remove from toggle OR rescope Map + update skill) |
| OBS-40 | Migration 070 file deletion; RPCs intact via 071/073 CREATE OR REPLACE; source-history loss only | LOW | Stage 2 decides reconstruct vs accept |
| OBS-41 | Dashboard regulation-centric; does not reflect five-surface model | LOW | Sprint 2+ Tier 4 |
| OBS-42 | `item_supersessions` joined `intelligence_items` rows have missing or test-quality titles (surfaced by Tier 2's "Title pending" fix) | LOW | Sprint 2 data-quality dispatch |
| OBS-43 | `/admin` audit log tab placeholder (already OBS-23; this entry covers the post-Tier-2 state if it persists) | LOW | Sprint 2 |

### Already-FIXED items (formalize as Implemented or Cleared OBS)

Per sprint-followups-discipline, FIXED items should be captured in followups.md as Implemented (with PR/commit reference) so future dispatches don't re-litigate.

| Action | Items |
|---|---|
| Mark Implemented in followups.md | OBS candidates for: Phase-D leaks (14 instances; Tier 2), database identifier leaks (4+ instances; Tier 2), worker-language leaks (5+ instances; Tier 2), duplicate Technology category (Tier 2), Dashboard REPLACED rail data leak (Tier 2), Affected Lanes worker copy (Tier 2 supp), Assistant self-description (Tier 2 supp), Assistant decision-engine prompt (Tier 1), OnboardingWizard sector destination (Onboarding fix) |
| Mark Cleared in followups.md | `recurring_spot_check_log` phantom finding (was misframed in critical-investigations doc; corrected in schema reconciliation discovery) |

**Operator decision point #4:** authorize a single doc-cleanup + OBS-additions dispatch that:
1. Adds OBS-24 through OBS-43 to followups.md with cross-references
2. Marks 25+ Tier 1/Tier 2/Onboarding-fix items as Implemented
3. Marks recurring_spot_check_log as Cleared
4. Revises OBS-18 and OBS-19 routing (strike Phase 7 misroute; route to Sprint 2 customer-facing builds)
5. Adds a post-Sprint-1 conclusion note to system-audit-2026-05-18.md acknowledging the customer-facing value gap
6. Adds a sequencing note to critical-investigations-2026-05-18.md acknowledging the customer-facing schedule impact

---

## Sprint 2 work sequence

Six work items per platform-intent skill Section 7, plus three cross-cutting items.

### Sprint 2 Tier 3 (foundation work, ~1-2 weeks total)

Order matters: REC-OBS-G category routing wiring is the foundation under Market Intel, Research, Operations builds. Schema reconciliation Stage 2 is the foundation under Intelligence Assistant skill loading + integrity_flags admin surfaces.

| # | Item | Estimated scope | Prerequisite | Output |
|---|---|---|---|---|
| 1 | Schema reconciliation Stage 2 | Medium (1-2 days) | Operator authorizes HYBRID strategy | Ledger backfilled for 26 entries; 048 + 049 + 050 applied; integrity_flags table exists |
| 2 | Doc cleanup + OBS additions consolidation | Small (half day) | Operator authorizes per item 4 above | OBS-24 through OBS-43 in followups.md; OBS-18, OBS-19 routing revised; audit conclusion notes added |
| 3 | Migration 083 trigger derive-from-canonical (OBS-24) | Small (1 day) | Stage 2 complete | New helper function in trigger; one-shot UPDATE on 362-451 rows; jurisdiction_iso populated for parseable-token rows |
| 4 | Category routing wiring (OBS-26 / REC-OBS-G) | Medium (2-3 days) | Stage 2 complete; mapping refinement | /market, /research, /operations stop sharing unfiltered payload; differentiated content per source category; Regulations taxonomy bleed (OBS-36) clears as side effect |
| 5 | Intelligence Assistant skill loading + citation surfacing + SELECT redesign (OBS-27 + OBS-28) | Medium-Large (3-5 days) | Stage 2 complete; environmental-policy-and-innovation skill content load mechanism designed | Assistant responses grounded in platform skill content; structured citations route to platform records; F-1 + F-3 closed |
| 6 | `requirePlatformAdmin()` helper + `/admin` route gate fix (OBS-17) | Small (1 day) | None | Workspace-membership gate replaced with platform-admin gate; integrity_flags surfaces gated correctly |

### Sprint 2 Tier 4 (customer-facing content + feature builds)

These build against the Tier 3 foundation. Each is plausibly its own sprint sequence; total scope is Sprint 2 through Sprint 5 territory per the platform-intent skill.

| # | Build | Estimated scope | Prerequisite |
|---|---|---|---|
| 7 | Market Intel content + signal aggregation engine | Sprint-level | OBS-26 (category routing) + Tier 3 #5 (Assistant quality) |
| 8 | Research repositioning decision + horizon-scan engine build | Sprint-level | OBS-26 + operator repositioning decision (editorial queue stays OR Research becomes horizon-scan destination) |
| 9 | Operations content build (structured content per skill Section 3; NOT separate decision-engine UI) | Multi-sprint (largest scope) | OBS-26 + Tier 3 #5 (Assistant is the cross-cutting answer helper for Operations decisions) |
| 10 | Community structural alignment + cohort expansion (OBS-32 + OBS-33 + OBS-34 + OBS-35) | Sprint-level | None (parallelizable with 7-9) |
| 11 | Dashboard five-surface refactor (OBS-41) | Medium (1-2 weeks) | OBS-26 + sidebar placement (OBS-32) |

### DEFERRED per operator (DO NOT prioritize)

| Item | Reason | Revisit when |
|---|---|---|
| Onboarding email delivery (SMTP) | Operator de-prioritized | After customer-facing surfaces deliver value |
| Onboarding LinkedIn import | Operator de-prioritized | After customer-facing surfaces deliver value |
| Onboarding chrome polish (NoWorkspaceLanding) | Operator de-prioritized | After customer-facing surfaces deliver value |
| Invitation-accept includes wizard | Operator de-prioritized | After customer-facing surfaces deliver value |
| Sector taxonomy expansion in wizard | Operator de-prioritized; ALL_SECTORS already surfaced | After customer-facing surfaces deliver value |

The Onboarding fix that DID land (sector destination correction) is preserved; this is about NOT building further onboarding capability until surfaces deliver.

---

## Per-build briefs

### Build 1: Schema reconciliation Stage 2

**Goal:** ledger backfilled to match live DB state; integrity_flags table exists for Phase 7 / admin surfaces; 049 perf indexes applied.

**Skill load:** sprint-followups-discipline (OBS coverage), environmental-policy-and-innovation (integrity rule).

**Scope:** per Stage 1 discovery recommendations.
- Backfill ledger entries 026-047 (21 FULLY APPLIED out-of-band entries; pure ledger INSERT, no schema work)
- Backfill ledger entries 045, 050 (DML-only riders)
- Apply migration 048 (`integrity_flags` table + 3 indexes + 3 RLS policies)
- Apply migration 049 (3 perf indexes)
- Apply migration 050 (CHECK constraint widening, after 048)
- Verify `recompute_agent_integrity_flag` function body matches migration 044 (not 035) before backfilling 035 + 044
- Decision: reconstruct migration 070 placeholder file OR accept loss
- Decision: migration 063 column shadowing remediation path (ALTER fix vs accept vs parallel columns)

**Out of scope:** schema work beyond what Stage 1 discovery identified. No structural changes.

**Verification:** post-Stage-2 inventory query confirms ledger matches live DB; integrity_flags table exists with expected schema; admin views render with data instead of empty state.

**Risk:** low if backfill-ledger path chosen for 026-047 (no schema mutation, just ledger INSERT). Medium for 048 + 049 application (CREATE TABLE + CREATE INDEX on a live DB; IF NOT EXISTS guards protect against re-runs).

### Build 2: Doc cleanup + OBS additions consolidation

**Goal:** all audit findings formalized as OBS entries; anti-pattern framings revised; future dispatches read a coherent followups doc.

**Skill load:** sprint-followups-discipline (canonical for OBS work).

**Scope:**
- Add OBS-24 through OBS-43 to followups.md with cross-references per the roadmap above
- Mark 25+ Tier 1/Tier 2/Onboarding-fix items as Implemented (with commit references)
- Mark `recurring_spot_check_log` as Cleared
- Revise OBS-18 entry: strike "Phase 7 design dispatch MUST address"; route to Sprint 2 Market Intel build
- Revise OBS-19 entry: strike "Phase 7 (customer-facing) or Phase 6 (ingest wiring) BINDING CONSTRAINT"; route to Sprint 2 Operations build; note that chip-matcher remediations proposed in OBS-19 are content-surface fixes superseded by the deeper Operations build
- Add postscript to system-audit-2026-05-18.md acknowledging customer-facing value gap was understated
- Add postscript to critical-investigations-2026-05-18.md acknowledging customer-facing schedule impact

**Out of scope:** no new audit findings; no schema or code changes.

**Verification:** followups.md OBS state matches reality post-Sprint-1; OBS-18 and OBS-19 route correctly; cross-references intact.

**Risk:** very low (doc work only).

### Build 3: Migration 083 trigger derive-from-canonical (OBS-24)

**Goal:** trigger function `_normalize_jurisdictions` derives `jurisdiction_iso` from canonical `jurisdictions` tokens; 362-451 affected rows populate.

**Skill load:** environmental-policy-and-innovation (integrity rule), sprint-followups-discipline.

**Scope:**
- Author migration 083 that extends `_normalize_jurisdictions` (or adds a helper called from the trigger) to derive `derived_iso` from canonical `jurisdictions` tokens (alpha-2 token emits as-is; subdivision token emits parent country code; union and dedupe; merge into jurisdiction_iso only if empty for defensive-vs-aggressive choice per OBS-24)
- One-shot UPDATE on affected rows
- Idempotent: re-running produces same output

**Out of scope:** classifier work, Phase 6 ingest wiring, page-level surfacing.

**Verification:** post-migration count of rows with populated jurisdictions + empty jurisdiction_iso drops from 362 to near-zero (subject to operator choice on defensive-vs-aggressive merge).

**Risk:** low (trigger semantic change is additive; defensive merge variant preserves operator-curated values).

### Build 4: Category routing wiring (OBS-26 / REC-OBS-G)

**Goal:** /market, /research, /operations differentiate content by source category instead of sharing an unfiltered payload.

**Skill load:** caros-ledge-platform-intent (five-surface scope), environmental-policy-and-innovation (canonical source taxonomy via item_type and format_type), sprint-followups-discipline.

**Scope:**
- Wire `get_market_intel_items` into /market via `getResourcesOnly` replacement or augmentation
- Wire `get_research_items` into /research via `getResearchPipeline` replacement or augmentation
- Wire `get_operations_items` into /operations via `getResourcesOnly` replacement or augmentation
- Refine role-to-category mappings per skill Section 3:
  - IMO + ICAO must route to Regulations (currently `intergovernmental_body` routes to Research in orphan RPC)
  - Carbon Trust + Project Drawdown must route to Research (currently `statistical_data_agency` routes to Operations)
  - FreightWaves + Loadstar + GreenBiz + Environmental Finance + Splash247 + Supply Chain Digital must route to Research (currently `trade_press` routes to Market Intel)
  - Reuters Sustainable Business → Research; Reuters Sustainable Switch (newsletter) → Market Intel
- Either (a) refine `source_role` taxonomy with new values matching the four-category split, OR (b) add canonical category column to `sources` (longer-term; OBS-26)
- Add canonical `classification_category` column to `sources` schema (option b) OR refine role mapping in routing RPCs (option a)

**Operator decision needed before this build:** option a (refine role mapping; faster, less correct long-term) vs option b (add canonical column; slower, structurally correct, depends on classifier work OBS-9).

**Out of scope:** signal aggregation, horizon-scan engine, decision-engine content (those are Tier 4 builds).

**Verification:** sample 10 most-recent items on each of /market, /research, /operations; confirm each surface shows category-appropriate items only. Regulations taxonomy bleed (Gallery Climate Coalition, Decarb Hub) clears as side effect.

**Risk:** medium. Role mapping refinement risks breaking surfaces that currently work via the unfiltered payload (some items shift from one surface to another). Verification matters.

### Build 5: Intelligence Assistant skill loading + citation surfacing + SELECT redesign (OBS-27 + OBS-28)

**Goal:** Assistant grounds responses in environmental-policy-and-innovation skill content + platform records; structured citations route to platform records; F-1 + F-3 closed.

**Skill load:** caros-ledge-platform-intent (research-helper framing already locked via Tier 1), environmental-policy-and-innovation (canonical source taxonomy + content rules; this is the primary grounding skill the Assistant should load), sprint-followups-discipline.

**Scope:**
- Design skill-loading mechanism for Assistant runtime: read environmental-policy-and-innovation SKILL.md (and possibly caros-ledge-platform-intent SKILL.md) at query time; embed relevant sections into system prompt context
- Redesign intelligence_items SELECT to include source_id, source_url, intersection_summary, related_items, full_brief, and any other fields needed for structured citation
- Add citation post-processing that validates cited item_ids exist; rejects fabricated citations
- Author response shape that supports structured citations (item_id + source URL + title) routing to platform records
- Test against the verified-failing queries from Chrome audit ("What CBAM obligations are due in Q2 2026") to confirm response is grounded in platform content, not LLM training data

**Out of scope:** per-page vs floating Assistant unification (Tier 4 Option B work).

**Verification:** test queries on each page; confirm responses cite specific platform items by id; confirm citations route to /regulations/[slug] or equivalent; confirm response content matches what the user can verify on the linked page.

**Risk:** medium-large. Skill content is substantial; including it in prompt context inflates token usage and may slow responses. Citation post-processing requires response-shape changes that may break existing UI rendering.

### Build 6: requirePlatformAdmin() helper + /admin route gate fix (OBS-17)

**Goal:** /admin route gates on platform-admin role to match its platform-scoped surface; current workspace-membership gate is a security finding.

**Skill load:** caros-ledge-platform-intent (Section 4 three-layer tenant model), sprint-followups-discipline.

**Scope:**
- Author `requirePlatformAdmin()` helper per Phase 1 Option C design (the helper was designed but never built)
- Replace inline `org_memberships.role IN ('owner','admin')` check in /admin route with `requirePlatformAdmin()`
- Decision: how to handle zero-platform-admins state (no users currently have `is_platform_admin = true`)
- Either (a) seed platform-admin role to designated operator account(s), OR (b) keep /admin gated correctly but unreachable until role is granted (operator decision)

**Out of scope:** /admin route content redesign (separate Tier 4 work); audit log tab placeholder (separate small dispatch).

**Verification:** non-platform-admin users redirect; platform-admin users (once seeded) access /admin with platform-wide data.

**Risk:** low if seed path is clean; medium if any current admin workflow depends on the workspace-membership gate (audit confirms no such dependency, but verify).

### Build 7: Market Intel content + signal aggregation engine

**Sprint-level scope.** Designed and dispatched separately after Tier 3 lands.

**Skill load:** caros-ledge-platform-intent Section 3 (Market Intel scope), environmental-policy-and-innovation (Market Signal Brief format), frontend-design, sprint-followups-discipline.

**Scope outline:**
- Source registry expansion: add MSCI, Moody's, Workiva, S&P Global Sustainable1, ESG Today, Bloomberg Green, Carbon Pulse, FT Moral Money, Reuters Sustainable Switch, more BloombergNEF entries, plus corporate-press intake (BYD-type announcements)
- Signal aggregation engine: identify signals from source content; classify by type (corporate-announcement, capital-flow, technology-deployment, supplier-shift, capacity-change, market-research-output, fuel-pricing, carbon-market)
- Predictive timing: signal-to-event lead-time estimation
- Cost time-series schema: addresses CostTrajectoryChart's acknowledged-empty state (`Data layer status: EMPTY` per MarketPage code)
- Alerts wiring: make the SideCard interactive (OBS-18; the alerts count must clickthrough to filtered view)
- Cross-reference surfacing: "regulatory deadline approaching" signals link back to Regulations content (per skill Section 3 cross-reference rules)
- EmptyState workspace-anchored rewrite (OBS-20 second-pass; Tier 2 fixed the worker-language; full sector-anchored copy is Sprint 2 work)

**Operator decisions needed:**
- Signal aggregation: rule-based vs LLM-based vs hybrid
- Alert prioritization: workspace-sector-scoped vs platform-wide
- Cost time-series schema: how granular, what storage pattern

### Build 8: Research repositioning + horizon-scan engine

**Sprint-level scope.** Operator decides repositioning first.

**Skill load:** caros-ledge-platform-intent Section 3 (Research scope), environmental-policy-and-innovation (Research Summary format 6 sections), frontend-design, sprint-followups-discipline.

**Repositioning decision (operator):**
- Option A: Research stays as editorial draft-staging queue. Customer-facing horizon-scan destination goes to a different surface (e.g., a sub-tab on Regulations, or a new surface).
- Option B: Research becomes the customer-facing horizon-scan destination. Editorial draft-staging moves to admin chrome.

**If Option B (skill-aligned):**
- Source registry verification: ensure analytical-press sources (Loadstar, FreightWaves Sustainability, Edie, GreenBiz, Environmental Finance, Splash247 Green, Supply Chain Digital, Reuters Sustainable Business analytical, Journal of Sustainable Transportation, IEA, IRENA, IPCC, World Bank, OECD, ICAP, Carbon Trust, Project Drawdown) are live ingest pipelines, not legacy resource entries
- Scanning logic: pull articles from analytical-press sources at intervals; classify as `research_finding` item_type; emit Research Summary briefs per the 6-section format
- Source coverage matrix implementation: replace hard-coded placeholder; unhide the tab
- `publishedThisWeek` callout titles as Links (close audit DRIFT-G.3 / Tier 2 partial coverage)
- Cross-reference surfacing for Operations decision-support context

### Build 9: Operations content build

**Multi-sprint scope.** Largest of the customer-facing builds.

**Skill load:** caros-ledge-platform-intent Section 3 (Operations scope; critical framing: structured content + Intelligence Assistant + customer judgment, NOT separate decision-engine UI), environmental-policy-and-innovation (Operations Profile format 8 sections), frontend-design, sprint-followups-discipline.

**Critical framing per rewritten skill:** Operations is a content build, NOT a decision-engine UI build. The customer reads structured content; the Intelligence Assistant (Build 5) handles cross-cutting questions during research; the customer makes the decision. Anyone scoping a separate decision-engine UI is over-scoping per the prior version of this skill's mis-framing.

**Scope outline (one sub-build per capability per platform-intent Section 3):**
- Regulatory feasibility by region: structured content showing which Regulations apply where, with what enforcement (cross-references Regulations)
- Regional resource availability (materials, recyclables): content sourced from regional supplier registries
- Labor markets: regional wage data, workforce availability (data feed required: LinkedIn Economic Graph or substitute)
- Materials sourcing: regional supplier base, qualified mills
- Infrastructure capacity: ports, rail, terminals, charging (data feed required)
- Operational cost data: electricity, diesel, SAF, port handling, drayage (structured cost time-series; shared schema with Market Intel cost work)

**Each capability is plausibly its own sprint sub-build.** Operations as a whole is Sprint 2 through Sprint 5.

**Out of scope:** separate decision-engine UI (anti-pattern per skill Section 11).

**Verification per capability:** sample queries on /operations should surface structured content for the queried region; chip matchers are removed in favor of structured content sections; "Coming soon, Phase D" banner is removed (Tier 2 fixed the leak; this build replaces the banner with real content).

### Build 10: Community structural alignment + cohort expansion (OBS-32 + OBS-33 + OBS-34 + OBS-35)

**Sprint-level scope.**

**Skill load:** caros-ledge-platform-intent (Community as co-equal surface; Section 3 + Section 11 anti-patterns), frontend-design, sprint-followups-discipline.

**Scope:**
- Sidebar placement: Community moves from account-chrome zone to intelligence-pages block (co-equal with Regulations, Market Intel, Research, Operations)
- Chrome alignment: remove "← Back to Caro's Ledge" entry reflow; Community routes share the same chrome as intelligence pages
- Region taxonomy unification: Community uses the same ISO code vocabulary as intelligence surfaces (or both adopt friendly names; operator decides)
- Cohort expansion: vendor directory and working-group taxonomy extended beyond current art-logistics cohort to cover the broader freight-forwarding cohort per ALL_SECTORS

**Out of scope:** Onboarding flow completion (DEFERRED per operator); email-delivered invitations (DEFERRED).

### Build 11: Dashboard five-surface refactor (OBS-41)

**Medium scope (1-2 weeks).**

**Scope:** Dashboard surfaces content from all five customer-facing surfaces (currently regulation-centric per Chrome audit). The five-surface model from platform-intent skill Section 3 is the structuring framework. Dashboard becomes an entry-point overview rather than a Regulations-skewed view.

**Prerequisite:** Build 4 (category routing) so dashboard can show differentiated content per surface; Build 10 (Community structural alignment) so Community appears as co-equal in Dashboard navigation.

---

## Cross-cutting work (parallel to Sprint 2)

These are not Sprint 2 customer-facing builds themselves; they run alongside.

### Sprint 2 governance and audit cadence

Per sprint-followups-discipline, Sprint 2 should ship:
- A sprint-2-followups.md (or extend sprint-1/followups.md, operator decides) for ongoing OBS capture during Sprint 2 dispatches
- Periodic Sprint 2 audits (mid-sprint and end-sprint) to catch drift early; the Chrome live audit pattern is the canonical methodology

### Future audit dispatches (post-Sprint-2)

- SECURITY DEFINER function audit (OBS-38; bounded but worth scheduling)
- Region taxonomy reconciliation (OBS-34 plus jurisdictional content fields across intelligence_items)
- Map scope decision (OBS-39 Facility toggle)

---

## Decision matrix for operator

Decisions required before Sprint 2 dispatches:

| # | Decision | Default if no input |
|---|---|---|
| D1 | Merge Tier 1 + Tier 2 + Onboarding fix branches to master | Held; surfaces stay in current state |
| D2 | Merge PR #122 (Phase 5 implementation) | Held; Phase 5 backfill stays unreleased to main |
| D3 | Authorize Schema reconciliation Stage 2 dispatch | Stage 2 held; integrity_flags stays absent; ledger drift continues |
| D4 | Authorize doc cleanup + OBS additions consolidation (Build 2) | Findings stay in audit docs; not propagated to followups.md |
| D5 | Authorize Critical #1 migration 083 (Build 3) | 362-451 rows stay with empty jurisdiction_iso |
| D6 | Category routing wiring path: option a (refine role mapping) vs option b (add canonical column) | Held until decided; Build 4 cannot dispatch |
| D7 | Research repositioning: Option A (stays editorial queue) vs Option B (becomes horizon-scan destination) | Held until decided; Build 8 cannot dispatch |
| D8 | Authorize Build 5 (Intelligence Assistant Tier 3 fixes: skill loading + citation + SELECT) | Held; Assistant stays under Tier 1 prompt-only constraint |
| D9 | Authorize Build 6 (`requirePlatformAdmin()` + /admin gate) | Held; /admin gate scope mismatch persists |
| D10 | Authorize Build 7 (Market Intel) | Held |
| D11 | Authorize Build 9 (Operations content; multi-sprint) | Held |
| D12 | Authorize Build 10 (Community structural alignment) | Held |
| D13 | Authorize Build 11 (Dashboard five-surface refactor) | Held |
| D14 | Map "Facility" mode toggle: remove from toggle OR formally rescope Map | Held; flagged in code; operator chooses post-Tier-2 |
| D15 | Migration 070 file: reconstruct placeholder OR accept loss | Held; deferred to Stage 2 dispatch |
| D16 | Migration 063 column shadowing: ALTER fix OR accept divergence OR parallel columns | Held; deferred to Sprint 2 schema work |
| D17 | Onboarding email + LinkedIn + chrome polish | DEFERRED per operator; not in Sprint 2 scope |

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Category routing wiring (Build 4) shifts items between surfaces; existing users see content disappear from familiar pages | Medium | Medium | Communicate change in release notes; provide cross-surface search; verify mapping refinement against skill Section 3 |
| Intelligence Assistant skill loading inflates response latency (Build 5) | High | Low-Medium | Profile token usage; selective skill content loading based on query intent; consider RAG retrieval over full skill inclusion |
| Operations content build over-scopes as decision-engine UI despite skill rewrite | Medium | High | Skill rewrite Section 11 anti-pattern explicit; sprint-followups-discipline Value Delivery Check section catches violations; per-build dispatch report scrutinized |
| Stage 2 schema reconciliation breaks downstream queries that depended on out-of-band state | Low | High | Backfill-ledger path is non-destructive; apply-missing path uses IF NOT EXISTS guards; rehearse on non-production environment if available |
| Research repositioning decision delays Build 8 indefinitely | Medium | Medium | Operator decision point D7 surfaces this; default to Option B per skill Section 3 if no decision after timeline |
| Community structural alignment (Build 10) breaks existing Community user navigation | Medium | Low | Existing users are small cohort; communicate change; preserve URL structure where possible |
| Customer-facing schedule slip during multi-sprint Operations build | High | High | Sprint 2 mid-sprint audit catches early; weekly progress reports include Value Delivery Check sections; surface slip explicitly per skill discipline |

---

## Methodology notes

**Plan authored from main thread** with full conversational context across all six audits + Chrome live findings + skill rewrite. Did not dispatch to agent because the synthesis required current commit state awareness (Tier 1 / Tier 2 / Onboarding fix branches just shipped).

**Reproducibility:** all source audit docs are in `docs/sprint-1/`; commits are tagged in the conversation history and visible via `git log`. The plan can be regenerated by re-synthesizing those inputs against the current platform-intent skill.

**Known limits:**
- Build estimates are scope-shape only; precise effort requires per-build design dispatch
- Operator decisions D6, D7 are foundational and gate Builds 4 + 8; until decided, the sequence cannot start
- Schema reconciliation Stage 2 (Build 1) is a prerequisite for Builds 5 and 6; should run first regardless of other sequencing

---

## Value Delivery Check

```
=== Value Delivery Check ===

This dispatch's work does NOT directly advance customer-facing value delivery.

This is a Sprint 2 planning document. It produces a sequence and scope inventory for the Sprint 2 customer-facing builds; it does not itself build a customer-facing surface.

The customer-facing value gap on Market Intel, Research, Operations, Community (structural alignment), and Dashboard (five-surface refactor) is addressed by Sprint 2 Builds 7-11 per platform-intent SKILL.md Section 7. The Intelligence Assistant quality gap is addressed by Sprint 2 Build 5. None of these builds dispatch from this plan; the plan sequences them for operator authorization.

Dual-posture: the planning applies equally to current operational scope and expansion-time users. Cohort expansion (Build 10) is explicitly dual-posture; routing wiring (Build 4) and Assistant quality (Build 5) serve both cohorts equally.
```

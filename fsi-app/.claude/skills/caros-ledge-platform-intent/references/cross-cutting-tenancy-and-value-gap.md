## Cross-Cutting Capabilities

These span the five surfaces; they are not surfaces themselves.

### DASHBOARD

**Surface.** Home route at `/`.

**Function.** Digest and triage view surfacing what is new, important, and flagged across the five intelligence surfaces. The customer's first stop on each session, organizing recent updates, urgent items, and saved attention items into a scannable single page. NOT a sixth intelligence surface; Dashboard does not introduce its own content category. Every item rendered on Dashboard cross-references back to its canonical surface (Regulations, Market Intel, Research, Operations, Community).

**Operator-stated framing (2026-05-24).** Dashboard stays as-is. The current "what's new + what's important + flagged items" framing is correct. Not in design rebuild scope; Sequence C rebuilds do not touch Dashboard. Future refinement, if any, runs as a separate parallel dispatch.

**Source category mapping.** Dashboard is a view across all four source categories; it does not surface its own content category.

**Current state.** Functional.

### INTELLIGENCE ASSISTANT

**Surface.** Available globally (floating button in `AppShell`) and per-page (Ask anything about prompt bars on `/market`, `/research`, `/operations`, `/regulations`, `/map`).

**Function.** Research helper. Leverages Caro's Ledge accumulated expertise (the platform skills, primarily `environmental-policy-and-innovation`, plus platform content) to answer questions arising during user research on the site. Grounded in skill content and platform records, not free-form LLM output.

**Not a synthesis engine. Not the Operations decision engine. Not the Research horizon-scan engine.** It is an answer-generation helper for cross-cutting questions during the customer's research session on the site. The customer reads the structured content on the surface they are on, asks the Assistant for help with cross-cutting questions, applies their own judgment, and decides.

**Current state.** Wired into the surfaces. Quality and grounding of responses against platform skills not yet verified end-to-end (Sprint 2+ Intelligence Assistant quality dispatch).

### MAP

**Surface.** Geographic visual layer over Regulations content. Lives at `/map`.

**Function.** Region-specific search done visually as a filter alternative to the Regulations list view. A view of Regulations content, not a separate content category.

**Future cross-cutting use.** Visualizing agent availability across regions (when that feature ships). Possibly visualizing Community working group presence by region.

**Source category mapping.** Map is a view of Regulations content; the source category is `regulatory`. Map does not surface its own content.

**Current state.** Functional as a view of Regulations.

### ONBOARDING FLOW

**Surface.** Multi-step wizard at `/onboarding`, plus `/signup`, `/invitations/[token]`, `/workspace/new`.

**Function.** Mechanism for expansion-time users to join the Workspace layer with appropriate sector_profile customization and Community participation. Required for the architectural intent to materialize.

**Current state.** Partially shipped per Multi-Tenant Foundation Workstream B (4-step wizard, signup, invitation accept/decline plumbing, minimal NoWorkspaceLanding). Gaps: sector taxonomy expansion in the wizard (currently highlights 6 current niches), email-delivered invitations (currently copy-URL only), chrome polish on `NoWorkspaceLanding`, sector_profile-driven Community group seeding for new workspaces. LinkedIn import is in-flight (operator-stated 2026-05-24, not a stub).

Onboarding is a customer-facing capability, but it is cross-cutting rather than a content surface; it provisions access to the surfaces rather than displaying content itself.

## Three-Layer Tenant Model

- **Platform layer.** Shared intelligence, source registry, classifier, internal staff (`profiles.is_platform_admin = true` gates platform-level surfaces).
- **Workspace layer.** Org-scoped intelligence delivery. `workspace_settings`, `org_memberships`, `sector_profile` drive what each workspace sees and how briefs are anchored.
- **Community layer.** Cross-org peer information-sharing. Working groups, forums, promote-to-public (a repost inside Community). Spans organizations; feeds no other surface (ADR-041). (Vendor directory removed from scope per operator-stated correction 2026-05-24.)

Onboarding is the mechanism by which an expansion-time user joins the Workspace layer and gains Community participation.

## Sprint 1 Actual Scope

Sprint 1 equals chrome remediation and foundations. Phases 1 through 11 of foundation work. Sprint 1 does NOT include customer-facing feature builds for any of the five surfaces.

**Sprint 1 includes:**

- Phase 1: admin signal documentation (RC-1)
- Phase 2: dedup schema design
- Phase 3: jurisdiction vocabulary extension
- Phase 4: migrations 079, 080, 081, 082
- Phase 5: data backfill
- Phase 6: ingest wiring (data into the system)
- Phase 7: admin chrome + minimum viable triage UI (operator-facing, not customer-facing)
- Phase 8: workspace_settings finalization
- Phases 9-11: less defined; Phase 11 is hard-delete loser rows from dedup

**Sprint 1 does NOT include:**

- Category routing wiring (the existing category-aware RPCs are orphans not invoked by application code, per alignment audit Section B; this is REC-OBS-G remediation, Sprint 2)
- Market Intel feature build
- Research feature build or repositioning decision
- Operations content build
- Community expansion (vendor / group / onboarding seeding for expansion cohorts)
- Intelligence Assistant quality verification
- Onboarding completion (email, LinkedIn, chrome polish)
- Any currently-broken customer-facing surface becoming functional

Anyone framing Phase 6 or Phase 7 as "what will fix Market Intel / Research / Operations / Community" is wrong. Phase 6 is data plumbing. Phase 7 is operator chrome.

## Customer-Facing Value Gap

Sprint 2+ work, not scoped in Sprint 1:

1. **Category routing wiring (REC-OBS-G remediation).** Connect the existing category-aware RPCs (`get_market_intel_items`, `get_research_items`, `get_operations_items`) into application code so the four intelligence pages deliver differentiated content. Foundation for everything else; without this, /market and /operations continue to share the same unfiltered payload.
2. **Market Intel feature build.** Signal aggregation, predictive timing, source-registry expansion, alerts wiring (close OBS-18), EmptyState workspace-anchored rewrite (close OBS-20), taxonomy bleed cleanup.
3. **Research repositioning and build.** Decide whether Research stays as the editorial draft-staging queue or becomes the customer-facing horizon-scan destination. Then build accordingly: source-registry expansion for analytical-press sources, scanning logic, 6-section Research Summary brief generation, source coverage matrix implementation.
4. **Operations content build.** Surface jurisdictional decision intelligence per Section 3 as structured content. NOT a separate decision-engine UI. Build the content (regulatory feasibility by region, regional resource availability, labor markets, materials sourcing, infrastructure capacity, operational cost data) and let the Intelligence Assistant handle cross-cutting questions. Replace stub chips with real content; remove phase-language banner; redesign for current cohort and expansion cohort coverage.
5. **Community expansion and onboarding completion.** Extend working-group taxonomy beyond current art-logistics cohort; complete onboarding flow (sector taxonomy expansion in wizard, email-delivered invitations, chrome polish on NoWorkspaceLanding, LinkedIn import completion); wire sector_profile-driven Community group seeding for new workspaces. (Vendor directory removed from scope per operator-stated correction 2026-05-24; LinkedIn import is in-flight rather than a stub per the same correction.)
6. **Intelligence Assistant quality.** Verify the Assistant loads and uses platform skills (especially `environmental-policy-and-innovation`) to ground responses. Verify it does not behave as a synthesis or decision engine. Bound its scope to research-helper function.

Items 2 through 5 each plausibly their own sprint. Sprint 2 through Sprint 5 territory. Item 1 (routing wiring) is the foundation that gates items 2 through 4 and should run first.

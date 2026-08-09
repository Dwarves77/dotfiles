# Analysis-anchoring resolution plan — v2, Option B chosen (2026-08-09)

PLAN FOR REVIEW. Supersedes v1. Operator ruling: **Option B — read-time contextualization.** Shared briefs
stay role-generic; the viewer's workspace profile is applied at read/query time (the RAG-with-profile /
context-injection pattern for shared-research platforms serving many customers). This document is revised
to that architecture. Nothing is built yet.

## 1. What this ruling means (and the correction it makes)

The shared briefs SHOULD be role-generic — and they already are. So:

- **No mass regeneration for anchoring.** The earlier framing ("briefs are generic, therefore deficient,
  regenerate the corpus") was correct-diagnosis / wrong-cure under Option B. Generic is the right shape for
  shared canonical analysis. The corpus is not anchoring-deficient; it is anchoring-INCOMPLETE at the READ
  layer, which never existed.
- **The real missing capability is the read-time contextualization layer.** Users have read rigorous but
  un-lensed analysis — the "what this means for YOUR operation" view was never applied because the layer
  that would apply it was never built. That is the deficit, and it is a bounded feature, not a redo.
- **The populate date is decoupled from anchoring.** Corpus buildout (more verified briefs) proceeds
  independently; the read-time layer lands on top whenever it's ready. Two tracks, not one blocked chain.

## 2. The workspace profile — captured from the system + operator, not guessed

Per-org data. `workspace_settings` already holds part of it; the rest comes from the operator's statement.
This is the input the read-time layer reads per viewer.

- **Roles:** freight forwarder, importer, exporter (all three; "we are the importer, the exporter, the freight forwarder").
- **Cargo verticals** (live, from `workspace_settings.sector_profile`): Fine Art & Museum Logistics, Live Events & Touring, Luxury Goods & High Value, Film/TV & Media, Automotive, Humanitarian & NGO Cargo.
- **Transport modes:** air, ocean/sea, road.
- **Trade lanes:** worldwide — 80 offices globally, no corridor restriction ("we work everywhere").
- **Products sold under the workspace name:** none / N/A (operational scope, not product sales).
- **Operational baseline:** automating wherever possible, with deliberate manual steps (tagging, routing/shaping information to fit operational need).
- **Jurisdictions** (live, from `workspace_settings.jurisdiction_weights`): US-domiciled, global interest — EU/US/IMO/ICAO/global top-weighted, all major freight jurisdictions present.
- **Regulation scope:** anything and everything worldwide that touches freight forwarding, import/export, and freight sustainability. Not a narrow filter.

Consequence of a BROAD profile: read-time contextualization is primarily an ANALYTICAL LENS ("how this
affects a worldwide forwarder/importer/exporter in these verticals across air/ocean/road"), not aggressive
filtering — the operator wants everything, contextualized, not narrowed.

## 3. Architecture — Option B, concretely

Shared canonical brief (generic, one per item, already built) + a per-viewer contextualization applied at
read time. The layer has two levels, cheapest-first:

- **Level 1 — structured lens ($0, fast, no LLM).** The brief already carries `topic_tags`, `jurisdictions`,
  `scenario_tags`, `compliance_object_tags`, severity, and the intersection fields. At read time, compute
  the viewer-profile match: which of the viewer's verticals/modes/jurisdictions the item touches, and
  surface that as a "Relevance to your operation" header + section highlighting + profile-weighted ranking
  on the surface lists. Pure data join against the profile; runs on every read at no marginal model cost.
- **Level 2 — authored contextualization paragraph (cached, bounded).** A short "For your operation:" read
  drafted per (item × profile) — the specific implication for this workspace's role/verticals/lanes — and
  CACHED, generated once and reused, not per-view. For a single workspace that's one pass over the corpus;
  multi-tenant, it's lazy per (workspace, item) on first view. $0 if authored in-session (the Decision-3
  engine); the paid path stays rejected. Level 2 is an enhancement on Level 1, not a prerequisite.

The profile richer fields (roles/modes/lanes/baseline) are not yet columns in `workspace_settings` (it has
`sector_profile` + `jurisdiction_weights` only). Track 1 adds a `profile` jsonb (or typed columns) so the
full profile is per-org data the read layer consumes — captured for the current workspace from §2, and
filled by onboarding for future workspaces.

## 4. Generation stays generic — but two generation-content gaps remain (separate from anchoring)

These make the SHARED brief better and stay generic (they are not per-viewer):

- **Forward-participation pathway** (analysis-spec v2.2): for an open trial/consortium/consultation, state
  generically how an operator in the role joins and the window — the read layer then times it to the
  viewer. Lands most on the Research surface. Currently absent (frozen contract).
- **Cross-surface consume:** a section drawing direction from its linked item on another surface. Partly
  present; tighten.
- **Contract unfreeze + drift gate:** bump the frozen `regeneration_skill_version "2026-05-27"`, and add a
  CI gate so the runtime contract can't silently lag the skill again (the structural fix — third time skill
  wiring has surfaced).
- **System-prompt correction:** the "## Workspace profile (runtime input)" section (system-prompt.ts:78-88)
  promises a generation-time profile that Option B says should NOT be injected there. Correct it: generation
  is forwarder-role-generic; per-workspace anchoring is a read-time layer. Removes a false promise the model
  was told and never received.

These warrant SELECTIVE regeneration of high-value items (to gain forward-participation + tighter linking),
measured on a pilot — NOT a corpus-wide anchoring redo.

## 5. Tracks (sequenced)

1. **Profile data model** — add the `profile` jsonb to `workspace_settings`; seed the current workspace from §2; expose a read helper. GATES the read layer.
2. **Read-time Level 1** — the structured lens on the item detail + surface lists. The core user-visible fix; $0.
3. **Generation cleanup** — system-prompt correction, contract unfreeze, forward-participation + cross-surface, drift gate. Code PR.
4. **Read-time Level 2** — cached authored "For your operation" reads, $0 in-session, prioritized by reader value.
5. **Selective regeneration** — only high-value items, only for the generation-content gaps, measured on a pilot first.

Corpus buildout (Decision 3) runs in parallel — not blocked by any of this.

## 6. What gates the populate date

Buildout (more verified briefs) is independent and can proceed now. The ANCHORING experience gates on
Tracks 1-2 (profile model + Level 1 lens) — a bounded feature, not a regeneration. I'll build Track 1-2
with a diff for you to see, then measure Level 2's per-item authoring cost on a small pilot before any
corpus-level estimate. No guessed timelines.

## 7. Guardrails

- Shared briefs stay role-generic (Option B); no per-workspace baking into shared rows.
- Profile content is operator/data-sourced (§2), never fabricated.
- Every FACT stays verbatim-grounded through the existing validator (moat untouched).
- Selective regeneration only where the generation-content gaps justify it, pilot-measured.

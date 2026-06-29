// INVARIANT REGISTRY — the per-INVARIANT enforcement map for all 6 platform skills.
//
// WHY THIS EXISTS (the "why wasn't this wired" answer, encoded): "wired" was previously measured
// per-SKILL ("a fitness function references this skill") instead of per-INVARIANT. A skill is a SET
// of invariants; wiring one (e.g. F10's syndication math) left the others honor-system — which is how
// the source-registration invariant (source-not-item → registered, never archived) slipped, producing
// 25 orphaned archives. This registry measures wiring per invariant.
//
// THE STANDARD (enforced by invariant-coverage.mjs, the meta-gate):
//   Every invariant is EITHER
//     (E) enforced  — `enforcedBy` lists ≥1 mechanism that RESOLVES to a real artifact, OR
//     (X) exempt    — `exempt.reason` states why it is NOT mechanically enforceable.
//   "Buildable but unbuilt" is NOT a valid exemption. Exemption is only for genuinely
//   non-mechanizable invariants (semantic generation properties, design judgment, process, or
//   signals too ambiguous for a low-false-positive gate). Each exemption names WHY.
//   `residual` (on enforced entries) names honestly what the mechanism does NOT cover (proxies).
//
// STANDING EXEMPTION-PROCESS RULE (2026-06-06 audit): before exempting an invariant as
// "weak-signal" or "non-mechanizable", you MUST check whether a DIFFERENT formulation is cleanly
// mechanizable — first-check-noisy does not mean none exists. Examples from the audit:
//   - a CEILING ("at most one") is often zero-false-positive where a FLOOR ("at least one") is noisy
//     (but VERIFY against live data — EP-7's ceiling was disproven: 224/361 briefs validly carry 2+);
//   - a branded TYPE makes a literal-scan-noisy invariant clean (SC-5 → mechanizable-via-refactor);
//   - a FK / table separation makes a "re-derived?" invariant structural (SC-4 → enforced);
//   - pgTAP makes a SQL-layer invariant testable (SC-3 SQL half → deferred-infra, named residual).
// If the cleaner formulation needs a refactor/infra you are NOT building now, the entry is
// "mechanizable-via-X, deferred for cost, REVISIT" — that is a NAMED-RESIDUAL, distinct from a true
// non-mechanizable exemption. Do not let deferred-for-cost masquerade as non-mechanizable.
//
// enforcedBy tokens (resolved by the meta-gate against live code/migrations):
//   rule:NNN          → a rule id present in ../manifest.mjs
//   fitness:FN        → a fitness id present in ../fitness/manifest.mjs
//   consistency:CN    → a check id present in ../consistency/manifest.mjs
//   audit:<path>      → a read-only verifier file that exists AND contains a GOVERNING skill-cite
//   selftest:<path>   → a *.selftest.mjs / *.test.mjs file that exists
//   migration:NNN     → a supabase/migrations/NNN_*.sql file that exists
//
// COMPLETENESS (also enforced by the meta-gate): each invariant carries an `anchor` (verbatim
// substring that MUST still be present in its skill file — catches an invariant being edited out),
// and each skill carries a normative-marker COUNT BASELINE (the gate fails if the marker count
// changes, forcing any new/removed normative statement to be triaged into this registry).

export const SKILL_FILES = {
  'environmental-policy-and-innovation': 'fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md',
  'source-credibility-model': 'fsi-app/.claude/skills/source-credibility-model/SKILL.md',
  'analysis-construction-spec': 'fsi-app/.claude/skills/analysis-construction-spec/SKILL.md',
  'caros-ledge-platform-intent': 'fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md',
  'remediation-discipline': 'fsi-app/.claude/skills/remediation-discipline/SKILL.md',
  'sprint-followups-discipline': 'fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md',
};

// The exact normative-marker pattern (case-sensitive, matches rg default). The meta-gate counts
// lines-with-a-match per skill and compares to the baseline below. Change the skill's normative
// surface → count moves → gate fails → triage into this registry → re-baseline.
export const MARKER_SOURCE =
  'mandatory|never violated|non-negotiable|Non-negotiable|MUST NOT|DO NOT|No invented|forbidden|never, never|binding|MUST';

// Baselines computed mechanically by the meta-gate (node line-count with MARKER_SOURCE). Seeded from
// the 2026-06-06 build; the gate self-reports a mismatch with the exact value to re-seed to.
export const SKILL_MARKER_BASELINE = {
  'environmental-policy-and-innovation': 17,
  'source-credibility-model': 10,
  'analysis-construction-spec': 4,
  'caros-ledge-platform-intent': 9,
  'remediation-discipline': 18,
  'sprint-followups-discipline': 17,
};

export const INVARIANTS = [
  // ───────────────────────── environmental-policy-and-innovation ─────────────────────────
  {
    id: 'EP-1-integrity',
    skill: 'environmental-policy-and-innovation',
    section: 'The Integrity Rule',
    text: 'No invented facts/operators/costs/competitors/suppliers; when facts run out, stop; omit-with-note, never fill via invention.',
    anchor: 'The Integrity Rule (mandatory, never violated)',
    enforcedBy: ['migration:035', 'migration:044', 'migration:121'],
    residual: 'Mechanical layer is a PROXY: migration 035/044 auto-flag hedge phrases ("unable to verify"…) and the provenance gate (121) keeps unverified items off customer surfaces. Semantic invention that uses no hedge phrase is not mechanically detectable — that residue is judgment-load at authoring.',
  },
  {
    id: 'EP-2-workspace-anchored',
    skill: 'environmental-policy-and-innovation',
    section: 'The Workspace-Anchored Rule',
    text: 'Output never names the workspace, company, or any person; anchoring is by role/operation/vertical/mode in generic terms.',
    anchor: 'The Workspace-Anchored Rule (mandatory, never violated)',
    enforcedBy: ['audit:fsi-app/scripts/verify/no-names.mjs'],
    residual: 'Runs over STORED briefs (data lane); a newly generated brief is checked on the next audit run, not at generation instant.',
  },
  {
    id: 'EP-3-format-mapping',
    skill: 'environmental-policy-and-innovation',
    section: 'Format Mapping',
    text: 'Each item_type maps to exactly one of the five brief formats (reg-family→Regulatory Fact; technology→Technology Profile; regional_data→Operations; market_signal/initiative→Market Signal; research_finding→Research Summary).',
    anchor: 'Format Mapping',
    enforcedBy: ['audit:fsi-app/scripts/verify/routing.mjs'],
    residual: 'routing.mjs checks the STORED brief format vs item_type over data; the in-code mapping SSOT is src/lib/domains.ts.',
  },
  {
    id: 'EP-4-source-not-item',
    skill: 'environmental-policy-and-innovation',
    section: 'Integrity Rule — source is a portal, not an item',
    text: 'A source (portal/registry/official site where legislation lives) is NOT an intelligence item; portals must not be ingested as items.',
    anchor: 'Source classification at every claim',
    enforcedBy: ['audit:fsi-app/scripts/verify/source-vs-item.mjs'],
    residual: 'Title-anchored heuristic over stored rows; ambiguous mixed pages can need human disposition (the 6-HOLD class).',
  },
  {
    id: 'EP-5-cross-format-lens',
    skill: 'environmental-policy-and-innovation',
    section: 'Cross-Format Lens Requirement',
    text: 'Every brief serves the four lenses (substantive, competitive, client-conversation, action) where facts permit.',
    anchor: 'Cross-Format Lens Requirement',
    enforcedBy: ['audit:fsi-app/scripts/verify/format-structure.mjs'],
    residual: 'format-structure proves SECTION PRESENCE (the structural carrier of the lenses); it cannot prove lens QUALITY — that is judgment.',
  },
  {
    id: 'EP-6-cause-effect',
    skill: 'environmental-policy-and-innovation',
    section: 'Cause and Effect Requirement',
    text: 'Every data point carries a sourced cause→mechanical-consequence→workspace-effect chain; data without it is noise and is not output.',
    anchor: 'Cause and Effect Requirement',
    exempt: {
      reason: 'SEMANTIC HALF exempt; STRUCTURAL HALF enforced. Enforced structurally: the per-claim provenance gate (EP-1 → section_claim_provenance + validate_item_provenance, migrations 112/114/121) requires FACT claims to carry a source_span + source_id and keeps ungrounded items off customer surfaces. NOT mechanizable: whether each datapoint\'s cause→mechanical-consequence→workspace-effect CHAIN is present and each link sourced — that is content meaning, no low-false-positive signal. So sourcing is gated; chain-completeness is authoring judgment.',
    },
  },
  {
    id: 'EP-7-severity-labels',
    skill: 'environmental-policy-and-innovation',
    section: 'Severity Labels',
    text: 'Exactly one severity label (ACTION REQUIRED / COST ALERT / WINDOW CLOSING / COMPETITIVE EDGE / MONITORING) where decision pressure exists; mandatory on reg/market/tech/ops formats.',
    anchor: 'Severity Labels',
    exempt: {
      reason: 'DATA-VERIFIED no clean bound exists (checked both, per the standing exemption-process rule). LIVE QUERY of 361 briefs: token-count distribution {0:75, 1:62, 2:57, 3:45, 4:40, 5:25, 6:23, 7:14, 8:12, …}. A CEILING (≤1) would false-flag 224/361 (62%) of VALID briefs — the reg format labels each S3 action, so multiple labels per brief are correct. A FLOOR (≥1) is also invalid (75 briefs correctly carry 0). No brief- or section-level scope yields a zero-false-positive bound because multiple labels per brief are valid by the format spec, and "where decision pressure exists" is irreducibly semantic. (Distinct: the item-level urgency `severity` column IS schema-enforced by migration 004 CHECK — a different vocabulary, not these labels.)',
    },
  },

  {
    id: 'EP-8-qualification-capture',
    skill: 'environmental-policy-and-innovation',
    section: 'Section 8 — Qualification capture (mandatory)',
    text: 'For every regulatory requirement, capture its qualifications — exceptions/carve-outs, calculation basis, defined terms (verbatim from the definitions article), and the per-year trajectory — not just the headline value; matching the workspace to a defined role or deciding an obligation attaches is a legal determination routed to counsel, never asserted.',
    anchor: 'Qualification capture (mandatory)',
    exempt: {
      reason: 'SEMANTIC generation property — same class as EP-6 (cause-effect chain) and the EP-5 lens-quality residual: whether a brief actually captures each requirement\'s exceptions / calculation basis / defined-terms / per-year trajectory, and holds the legal line, is content meaning with no low-false-positive signal. The STRUCTURAL PREREQUISITE is enforced in the pipeline: it now fetches and reads the FULL enacted text (direct-HTTP transport + raised caps + a budget-aware block builder shared by synthesis AND grounding so spans stay matchable) and CANNOT silently truncate — recordTruncation surfaces any DOWNLOAD that exceeds its cap as an integrity_flags coverage_gap (canonical-pipeline.ts + canonical-fetch.mjs {truncated,fullTextLength}). The semantic half is carried by the coverage-forcing prompt (system-prompt.ts regulatory-completeness block, synced to this skill) and PROVEN by the PPWR prove-on-one (efdb3390 quarantined→verified: 2038 ban, per-plant averaging, per-year trajectory, Art-3 defined terms captured, legal line held, zero producer-status assertions). REVISIT: a committed truncation-signal selftest would make the no-silent-truncation half enforcedBy:selftest (mechanizable, deferred for the export/extraction cost).',
    },
  },

  // ───────────────────────────── source-credibility-model ─────────────────────────────
  {
    id: 'SC-1-syndication-math',
    skill: 'source-credibility-model',
    section: 'Section 4: Citation Network Semantics',
    text: 'Syndicated republications collapse to ONE corroboration; the honest independent-citer count ≤ naive; trust_score_citation moves 0→>0 only on real corroboration.',
    anchor: 'Citation Network Semantics',
    enforcedBy: ['fitness:F10', 'selftest:fsi-app/src/lib/sources/source-growth.selftest.mjs'],
  },
  {
    id: 'SC-2-source-registration',
    skill: 'source-credibility-model',
    section: 'Section 5: Source Discovery Loop',
    text: 'A source-not-item is REGISTERED as a scannable source (never archived-without-registration); archiving a row AS a source without a registered active source orphans the scanner.',
    anchor: 'Source Discovery Loop',
    enforcedBy: [
      'rule:019',
      'audit:fsi-app/scripts/verify/orphan-source-audit.mjs',
      'migration:135',
    ],
    residual: 'rule 019 = commit-time (scripts); migration 135 = DB guard on NEW writes; orphan-source-audit = live-data scan that must reach 0 to clear pre-existing orphans. db.mjs reclassifyToSource() is the safe path all three steer toward.',
  },
  {
    id: 'SC-3-effective-tier-formula',
    skill: 'source-credibility-model',
    section: 'Section 7: Override Mechanism Rules',
    text: 'effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier); tier weights T1=1.0…T7=0; override never modifies base_tier.',
    anchor: 'effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier)',
    enforcedBy: ['fitness:F11', 'selftest:fsi-app/src/lib/trust.selftest.mjs'],
    residual: 'F11 (trust.selftest.mjs) asserts the tier-weight half against the REAL trust.ts: TIER_WEIGHTS = T1=1.0…T7=0 (Q7 verbatim), strictly decreasing, T7 contributes nothing, recency-decay curve, and the citation-component path applies the weights. The OTHER half — effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier) precedence + "override never modifies base_tier" — lives in the SQL daily-recompute job + override endpoint; no JS unit surface. Mechanizable via pgTAP SQL tests, deferred for that infra cost (REVISIT).',
  },
  {
    id: 'SC-4-bias-external-only',
    skill: 'source-credibility-model',
    section: 'Section 6: Bias Tag Vocabulary',
    text: 'Bias tags apply to external publisher sources ONLY (never to user-generated Community content, which uses author-identity + workspace-verification).',
    anchor: 'Bias tags apply to external publisher sources ONLY',
    enforcedBy: ['migration:092'],
    residual: 'VERIFIED structural, not re-derived: bias tags live in the source_bias_tags table whose source_id is a FK into sources (migration 092). User-generated Community content is a SEPARATE table (community_posts) with no path to source_bias_tags — so community content structurally cannot carry bias tags. The residual half — which source_role values WITHIN sources qualify as "external publisher" eligible — is classification judgment (the skill gives no crisp role→eligibility mapping).',
  },
  {
    id: 'SC-5-domain-int-ssot',
    skill: 'source-credibility-model',
    section: 'Section 8: Customer-Facing Signal Sets Per Surface',
    text: 'Domain integers (1-7 surface mapping) are owned solely by src/lib/domains.ts; they MUST NOT be hardcoded outside that file.',
    anchor: 'Domain integers MUST NOT be hardcoded outside that file',
    exempt: {
      reason: 'MECHANIZABLE-VIA-REFACTOR, deferred for cost (NOT non-mechanizable). A literal scan for bare integers 1-7 is genuinely weak-signal (overwhelmingly false-positive). BUT a branded `Domain` TYPE (type-level tagging so a raw int cannot flow where a Domain is expected) is a clean mechanization — same category as SC-3\'s pgTAP half: buildable via refactor, deferred for refactor cost. Interim: domains.ts SSOT convention + code review. REVISIT: introduce a branded Domain type → then a tsc/F-check enforces it.',
    },
  },

  {
    id: 'SC-6-one-tier-per-host',
    skill: 'source-credibility-model',
    section: 'Canonical Institutional Tier (Phase 0\')',
    text: 'One canonical institutional tier per host group (registrable domain = institution; documented super-domain exceptions: europa.eu subdomains distinct, legislation.gov.uk distinct from gov.uk); a host with rows at inconsistent base_tier and no explicit tier_override is the duplicate-row defect.',
    anchor: 'one canonical institutional tier per host group',
    enforcedBy: ['audit:fsi-app/scripts/verify/one-tier-per-host-audit.mjs'],
    residual: 'The audit is the live-data guard (CI-with-secrets lane); the meta-gate proves the file is wired (exists + skill-cited) in the secret-less pre-push. Per-row tier_override (section 7 override columns, reason required, default none) is the only sanctioned multi-tier escape. The durable fix (one institutions row, sources FK) is the tracked institutions-table follow-on.',
  },
  {
    id: 'SC-7-claims-tier',
    skill: 'source-credibility-model',
    section: 'Canonical Institutional Tier (Phase 0\')',
    text: 'A FACT claim\'s grounding tier stamp equals the canonical institutional tier of the source containing its span (flagged-override row tier where present; NULL when the span host is unregistered); no constant stamps.',
    anchor: 'the stamp equals the canonical institutional tier of the source containing the span',
    enforcedBy: ['audit:fsi-app/scripts/verify/claims-tier-audit.mjs'],
    residual: 'The audit is the live-data guard; honestly RED until the Phase 1 backfill re-stamps every claim from the resolver (legacy stamps are the constant 2). The meta-gate proves wiring (file exists + skill-cited). Whether the registered institutional tier is itself CORRECT is the Phase 0\' operator-ratification judgment, not mechanized here.',
  },
  {
    id: 'SC-8-authority-floor',
    skill: 'source-credibility-model',
    section: 'Section 3 — Per-item-type authority floor',
    text: 'A CRITICAL/HIGH item\'s FACT claims are held to a per-item-type authority floor (reg-family ≤T2, research_finding ≤T4, technology/innovation/tool ≤T5); market_signal/initiative and regional_data are EXEMPT pending their own gates.',
    anchor: 'Per-item-type authority floor (provenance gate)',
    enforcedBy: ['migration:141'],
    residual: 'NAMED EXEMPTIONS (REVISIT, registered here so neither silently becomes permanent): market_signal/initiative floor is corroboration-count not a tier (Section 4) — the gate is UNBUILT (codifying it now would put unbuilt mechanism in the gate, the migration-113 pattern); regional_data wants a per-SECTION floor (feasibility ≤T3, cost-data any-tier-with-source) — UNBUILT. technology ≤T5 is a FORWARD DEFAULT (0 live items) — REVISIT when the first technology items land. validate_item_provenance (migration 141) enforces the reg/research/tech floors over stored data; whether each ratified tier value is itself correct is operator judgment, not mechanized here.',
  },

  {
    id: 'SC-9-moat-base-tier-only',
    skill: 'source-credibility-model',
    section: 'Section 2 — The six-element model (the moat)',
    text: 'The reg-fact grounding-tier stamp derives from static base_tier ONLY (the per-host tier_override is the only sanctioned escape); dynamic reputation (effective_tier) and time-in-system never confer reg-fact grounding eligibility — a NULL base_tier resolves to NULL, never to a reputation tier.',
    anchor: 'dynamic reputation (effective_tier) and time-in-system never confer reg-fact grounding eligibility',
    enforcedBy: ['fitness:F12'],
    residual: 'F12 runs the pure resolver selftest (institution.selftest.mjs) behaviorally — it catches a reintroduced effective_tier fallback regardless of form, which the corpus claims-tier audit cannot (stamp + audit move together through the same resolver). Defense-in-depth: canonical-pipeline.ts no longer selects effective_tier into the resolver rows.',
  },

  // ───────────────────────────── analysis-construction-spec ─────────────────────────────
  {
    id: 'AC-1-section-construction',
    skill: 'analysis-construction-spec',
    section: '1. The construction method',
    text: 'Each format is constructed to its declared per-section spec (the section set per format); sections without grounded content are omitted-with-note, never invented to fill.',
    anchor: 'The construction method',
    enforcedBy: ['audit:fsi-app/scripts/verify/format-structure.mjs'],
    residual: 'Proves section presence/structure vs the spec; cannot prove each section\'s INGEST/TRANSFORM/OUTPUT quality (semantic).',
  },
  {
    id: 'AC-2-grounding-models',
    skill: 'analysis-construction-spec',
    section: '2. Grounding models',
    text: 'Each section declares one of four grounding models (SPAN / CORROBORATION-COUNT / MATRIX / TRANSITIVE); synthesis sections introduce no new unsourced fact.',
    anchor: 'Grounding models (the four; declared per section)',
    exempt: {
      reason: 'SEMANTIC HALF exempt; STRUCTURAL HALF enforced. Enforced structurally: per-CLAIM grounding is real — section_claim_provenance stores claim_kind (FACT/ANALYSIS/LEGAL/GAP) and validate_item_provenance (migrations 112/114) requires FACT claims grounded with a source_span + a CRITICAL/HIGH tier floor. NOT mechanizable: the per-SECTION grounding-MODEL LABEL (SPAN/CORROBORATION/MATRIX/TRANSITIVE) is not stored as a column, and "synthesis introduces no new unsourced fact" is semantic. So claim grounding is gated; the model-label declaration is construction judgment. (REVISIT: storing grounding_model per section would make the enum mechanizable.)',
    },
  },
  {
    id: 'AC-3-per-format-design-before-scale',
    skill: 'analysis-construction-spec',
    section: 'Status note',
    text: 'Until a real exemplar per format runs end-to-end, each non-regulatory format is hypothesis, not contract; never batch-generate a format at scale before its per-format design is validated on a sample.',
    anchor: 'until the first real exemplar per format runs end to end',
    exempt: {
      reason: 'Process discipline (operator-gated per-format design conversation before scale runs); not a code/data invariant. Carried by feedback memory + this skill.',
    },
  },
  {
    id: 'AC-4-no-vacuum',
    skill: 'analysis-construction-spec',
    section: '3b. The No-Vacuum Rule',
    text: 'Every item draws cross-surface direction from its documented intersection relationships; a section surfaces the cross-surface link wherever that link supplies direction.',
    anchor: 'The No-Vacuum Rule',
    exempt: {
      reason: 'SEMANTIC HALF exempt; STRUCTURAL HALF enforced. Enforced structurally: the intersection-readiness FIELDS (operational_scenario_tags, compliance_object_tags, related_items, intersection_summary) are part of the 13-field agent contract and the detect_intersections RPC consumes them (migration 021). NOT mechanizable: whether a section actually SURFACES the cross-surface link where it supplies direction is a content-quality judgment. So the fields are emitted + consumable; their directional use in prose is authoring judgment.',
    },
  },

  // ───────────────────────────── caros-ledge-platform-intent ─────────────────────────────
  {
    id: 'PI-1-five-surface',
    skill: 'caros-ledge-platform-intent',
    section: 'The Five Customer-Facing Surfaces',
    text: 'There are exactly FIVE customer surfaces (Regulations, Market Intel, Research, Operations, Community); no sixth customer surface without operator authorization.',
    anchor: 'The Five Customer-Facing Surfaces',
    enforcedBy: ['rule:018'],
  },
  {
    id: 'PI-2-regulations-only-on-regulations',
    skill: 'caros-ledge-platform-intent',
    section: 'REGULATIONS / source-category mapping',
    text: 'Regulation-family items surface only on Regulations; non-reg item types route to their own surface (no taxonomy bleed).',
    anchor: 'The four intelligence pages map to the source-category taxonomy',
    enforcedBy: ['audit:fsi-app/scripts/verify/routing.mjs'],
    residual: 'routing.mjs flags item_type↔surface drift over stored data; cross-surface item_type MOVES remain operator-authorized.',
  },
  {
    id: 'PI-3-community-coequal',
    skill: 'caros-ledge-platform-intent',
    section: 'Why this skill exists',
    text: 'Community is a CORE customer-facing surface, co-equal with the four intelligence pages — not onboarding, not a sub-feature.',
    anchor: 'Community is a CORE customer-facing surface',
    exempt: {
      reason: 'Product-scoping axiom about how Community is treated in design/dispatch; not a code/data row invariant. Carried by the skill; violations surface as design-review/dispatch-scope flags.',
    },
  },
  {
    id: 'PI-4-assistant-research-helper',
    skill: 'caros-ledge-platform-intent',
    section: 'Why this skill exists',
    text: 'The Intelligence Assistant is a research helper, NOT a synthesis/decision engine.',
    anchor: 'RESEARCH HELPER, not a synthesis',
    exempt: {
      reason: 'Architectural-intent axiom (what NOT to build); not a mechanical row/file invariant. Carried by the skill; violations are scoping decisions caught at design review.',
    },
  },

  // ───────────────────────────── remediation-discipline ─────────────────────────────
  {
    id: 'RD-1-classify-before-discard',
    skill: 'remediation-discipline',
    section: 'Section 2 / Section 4 (sweep + classify)',
    text: 'Classify before delete/archive; no archive over an undiagnosed bucket; archives are reversible (prior-value snapshot) and skill-cited.',
    anchor: 'class-over-instance',
    enforcedBy: ['rule:015', 'rule:019'],
    residual: 'rule 015 forces archive/delete through the guarded path (snapshot + cite); rule 019 forces source-archives through reclassifyToSource. "Undiagnosed bucket" judgment (was the diagnosis right?) is not mechanized.',
  },
  {
    id: 'RD-2-class-fixes-mechanical',
    skill: 'remediation-discipline',
    section: 'Section 3 Signal 5',
    text: 'A preservation/architectural argument is encoded as a fitness function (or equivalent mechanical check) in the SAME dispatch that surfaces it — not left as a docstring.',
    anchor: 'encode the preservation argument as a fitness function',
    exempt: {
      reason: 'A meta-rule about HOW remediations are scoped (encode-don\'t-document); it governs agent behavior at dispatch time, not a checkable property of a committed file. This very build is its application (rule 019 + F-layer). No standing mechanical signal.',
    },
  },
  {
    id: 'RD-3-primitive-thresholds',
    skill: 'remediation-discipline',
    section: 'Sections 5/6',
    text: 'Primitive extraction / rule codification requires 2+ confirmed instances; codification needs operator-authorized phrasing.',
    anchor: 'Recurrence threshold: 2+ confirmed instances',
    exempt: {
      reason: 'Judgment threshold applied at remediation-scoping time; not a property of committed code. Carried by the skill.',
    },
  },
  {
    id: 'RD-4-quarantine-disposition',
    skill: 'remediation-discipline',
    section: 'Section 2.1: Quarantine Is an Open Investigation (research-or-erase)',
    text: 'Quarantine is an OPEN INVESTIGATION, never terminal: entering quarantine enqueues research-or-erase; no item may sit live-quarantined past the dwell bound (or without an enqueue record) — it must reach a recorded disposition (recovered / archived / registered / erased).',
    anchor: 'Quarantine is an open investigation, never a terminal state',
    enforcedBy: ['audit:fsi-app/scripts/verify/quarantine-disposition-audit.mjs'],
    residual: 'The audit is the live-data truth-teller (enqueue-present + dwell-bound) that scripts/regen-quarantined.mjs must drive to zero; it runs in the CI-with-secrets / ops lane (DB creds), while the meta-gate proves the file is wired (exists + skill-cited) in the secret-less pre-push. The ENQUEUE half rides the existing set_provenance_status trigger integrity_flag (migration 115); the dwell clock is that flag\'s created_at, which resets on re-quarantine (an item re-processed restarts its disposition SLA — intended). Whether each disposition was the RIGHT one (research thorough enough, archive justified) is remediation judgment (RD-1), not mechanized.',
  },

  {
    id: 'RD-5-status-is-a-cache',
    skill: 'remediation-discipline',
    section: 'Status is a cache (gate/slot migrations ship revalidation)',
    text: 'provenance_status is a CACHE of a gate result; any migration that changes the gate (validate_item_provenance) or its inputs (item_type_required_slots, the tier model) MUST ship a corpus revalidation in the SAME change, and stored status must agree with the live gate in BOTH directions (no stale-verified, no stale-quarantined).',
    anchor: 'status is a cache',
    enforcedBy: ['audit:fsi-app/scripts/verify/substrate-agreement-audit.mjs'],
    residual: 'The audit (CI-with-secrets lane) recomputes validate_item_provenance per item and asserts agreement both ways — the live truth-teller for stale status. The meta-gate proves the file is wired (exists + skill-cited) in the secret-less pre-push. The standing rule "a gate/slot migration ships its corpus revalidation" is dispatch-time discipline carried by this skill; the audit catches a violation after the fact.',
  },

  {
    id: 'RD-6-deferral-vs-undispositioned',
    skill: 'remediation-discipline',
    section: 'Section 2.2: Deferred vs Undispositioned (a deferral is dispositioning-as-blocked, never silencing)',
    text: 'A past-bound quarantined item (>14d) is either disposed (recovered/archived/registered) OR carries a VALID time-bounded deferral (reason names the blocker + the awaited disposition path, a named future resolution event, an owner); expired deferrals re-open as undispositioned. Deferral is dispositioning-as-blocked, never silencing — the undispositioned count is the hard tripwire.',
    anchor: 'Deferred vs Undispositioned (a deferral is dispositioning-as-blocked, never silencing)',
    enforcedBy: ['audit:fsi-app/scripts/verify/quarantine-disposition-audit.mjs'],
    residual: 'The audit (CI-with-secrets / ops lane, DB creds) is the live-data guard: it splits past-bound into undispositioned (HARD tripwire, fails the lane) vs deferred (standing, reported only), applying isValidDeferral on the read side AND re-checking deferred_until is in the future. The write-time guard scripts/lib/deferral.mjs prevents vague deferrals from ever being written (reason must name blocker + disposition path, named future resolution_event, real owner). The meta-gate proves wiring (audit file git-tracked + skill-cited) in the secret-less pre-push. Self-resurrection on expiry is the anti-silence property — a deferral cannot quietly outlive its own clock. NOT mechanized: whether the named blocker is genuinely the real blocker (vs a plausible-sounding one) is remediation judgment (RD-1), not a checkable property.',
  },
  {
    id: 'RD-7-roadblock-alternative-search',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 8: Roadblock resilience (source fetch)',
    text: 'When a declared primary source roadblocks (timeout / <200ch stub / challenge / 403-404 / wrong-language-only), the pipeline runs a BOUNDED search for an OFFICIAL alternative and tries it — but alternative-search widens which sources are TRIED, never which tier QUALIFIES: a found alternative passes the SAME buildResolver tier resolution + the SAME per-type authority floor, so a sub-floor alternative is a corroborator at best and the item still honest-exits/counsel-holds. The roadblocked-vs-partial line (>=200ch in-language = honest partial, NOT a roadblock) and the bounded budget (~20s/fetch, <=3 alts, no retry on a dead URL) are load-bearing.',
    anchor: 'Roadblock resilience (source fetch)',
    enforcedBy: ['selftest:fsi-app/src/lib/sources/primary-fallback.test.mjs', 'migration:141'],
    residual: 'The CI unit test (in the discipline node --test glob) gates the PURE detector detectRoadblock — the roadblocked-vs-partial line (>=200ch in-language = honest partial), the challenge/stub/timeout/wrong-language cases, the no-false-challenge on a long article, and the orchestrator bound (no hang past perFetchMs). The same-floor QUALIFICATION is not a new mechanism: it is the UNCHANGED resolver (buildResolver) + per-type floor (migration 141 / validate_item_provenance criterion 3) — a found alternative becomes a primary ONLY by emergently clearing that floor, never by a fallback action, which structurally forecloses the F1 secondary-grounding regression. The counsel-hold audit (durable integrity_flag carrying alternatives_tried + best_resolved_tier + the result split NO_SOURCE_FOUND vs NO_SOURCE_QUALIFIED) makes "searched + exhausted" lane-auditable. NOT mechanized: whether web_search returned the TRULY most-authoritative alternative (vs a plausible one) is discovery judgment; the floor is the backstop that makes a wrong alternative harmless (it resolves sub-floor and is rejected).',
  },

  {
    id: 'RD-8-retrieval-before-generation',
    skill: 'remediation-discipline',
    section: 'Section 4.6: Retrieval before generation (check existing work/data before re-deriving)',
    text: 'Before any generation / discovery / re-derivation step, the first action is a RETRIEVAL CHECK — does this output already exist (another column on the row, the item\'s agent_run_searches pool, provisional_sources, the sources registry, prior-session work)? Exhaust retrieval before generation; generate only the genuine residual. Binds hardest before any batch that spends.',
    anchor: 'Retrieval before generation (check existing work/data before re-deriving)',
    exempt: {
      reason: 'PROCESS discipline applied at planning time (same class as RD-2/RD-3) — "did I check whether this output already exists before (re)generating it?" is judgment exercised when scoping a generation/discovery step, not a checkable property of a committed file or row. No low-false-positive standing signal exists for "this generation re-derived something already persisted": the stores are heterogeneous (a column, the agent_run_searches pool, provisional_sources, the registry, prior sessions), so a mechanical "should have retrieved" detector would be overwhelmingly noisy. Carried by CLAUDE.md Reuse-before-construction doctrine (extended 2026-06-23 to work-products/data) + this skill section + the retrieval-before-generation feedback memory; the backward promote-from-pool operation is its worked example (re-point = promote the already-stored enacted URL, not re-discover). REVISIT: a per-operation retrieval-check attestation could make it dispatch-auditable, deferred — attestation-not-enforcement is the trap the 2026-05-21 slim refactor retired.',
    },
  },
  {
    id: 'RG-1-plan-reground',
    skill: 'remediation-discipline',
    section: 'Plan re-grounding (re-read the code before each phase, mechanically)',
    text: 'A multi-phase program re-grounds each phase against the actual code before that phase executes: the governing program doc (docs/program/GOVERNING-PROGRAM.md) declares per-phase the concrete code-dependencies (anchors) the phase plan rests on, and a mechanical gate fails the build when the ACTIVE phase\'s anchors no longer match the code a prior phase changed. The next phase does not proceed on a stale plan.',
    anchor: 'Plan re-grounding (re-read the code before each phase, mechanically)',
    enforcedBy: ['consistency:C5'],
    residual: 'C5 verifies the ACTIVE phase\'s declared present/absent substrings against the real files; a plan-vs-code contradiction surfaces as named drift. It cannot judge whether the rest of the phase plan is sound — the anchors are the operator-declared load-bearing dependencies, and choosing good anchors is the planning judgment C5 makes checkable. Only the ACTIVE phase is checked (between-phase state is ACTIVE_PHASE: none, a no-op).',
  },

  // ───────────────────────────── sprint-followups-discipline ─────────────────────────────
  {
    id: 'SF-1-inventory-consistency',
    skill: 'sprint-followups-discipline',
    section: 'Inventory consistency rule',
    text: 'Commits modifying docs/inventories/*.md must satisfy the consistency runner (inventories match codebase reality: no missing claims, no orphans).',
    anchor: 'Inventory consistency rule',
    enforcedBy: ['rule:014', 'consistency:C3', 'consistency:C4'],
  },
  {
    id: 'SF-2-migration-ordering',
    skill: 'sprint-followups-discipline',
    section: 'Post-slim engine state (F6)',
    text: 'Migration filenames follow the numeric pattern with no duplicate numbers.',
    anchor: 'F6 (migrations numeric ordering)',
    enforcedBy: ['fitness:F6'],
  },
  {
    id: 'SF-3-admin-gating',
    skill: 'sprint-followups-discipline',
    section: 'Post-slim engine state (F2)',
    text: 'Every admin API route calls isPlatformAdmin (admin role gate).',
    anchor: 'F2 (admin-routes-isPlatformAdmin)',
    enforcedBy: ['fitness:F2'],
  },
  {
    id: 'SF-4-client-server-tier-boundary',
    skill: 'sprint-followups-discipline',
    section: 'Post-slim engine state (F8)',
    text: 'Client code does not assign body.tier / body.base_tier / body.effective_tier near a fetch/POST (server owns tier).',
    anchor: 'F8 (client-server tier boundary)',
    enforcedBy: ['fitness:F8'],
  },
  {
    id: 'SF-5-build-compiles',
    skill: 'sprint-followups-discipline',
    section: 'Post-slim engine state (F9)',
    text: 'tsc --noEmit must pass (no shipped type/build break).',
    anchor: 'F9 (build compiles)',
    enforcedBy: ['fitness:F9'],
  },
  {
    id: 'SF-6-no-hardcoded-user-path',
    skill: 'sprint-followups-discipline',
    section: 'Post-slim engine state (Rule 012)',
    text: 'No hardcoded operator user-home path (Windows Users dir, POSIX home, or Git-Bash drive-mount forms) in code files; use getRepoRoot()/os.homedir()/os.tmpdir().',
    anchor: 'Rule 012 (hardcoded user-home path)',
    enforcedBy: ['rule:012'],
  },
  {
    id: 'SF-7-worktree-convention',
    skill: 'sprint-followups-discipline',
    section: 'Worktree path convention',
    text: 'Worktrees live under .worktrees/ (FaDB-recognized); live worktrees match the worktrees inventory.',
    anchor: 'Worktree path convention',
    enforcedBy: ['consistency:C4'],
    residual: 'C4 proves live worktrees == inventory; the .worktrees/ path convention itself is operator discipline at worktree-creation.',
  },
  {
    id: 'SF-8-canonical-anthropic-path',
    skill: 'sprint-followups-discipline',
    section: 'Agent architecture (permitted routes)',
    text: 'Direct Anthropic API calls occur only in the canonical wrappers/routes (scripts/lib/anthropic.mjs + the sanctioned /api routes), never ad hoc.',
    anchor: 'Skill Load Confirmation',
    enforcedBy: ['rule:016'],
    residual: 'Anchor is a stable skill-section marker; the permitted-route invariant itself is owned by CLAUDE.md AGENT ARCHITECTURE and enforced by rule 016.',
  },
  {
    id: 'SF-9-generation-config-no-raw-env',
    skill: 'sprint-followups-discipline',
    section: 'Agent architecture (generation knobs)',
    text: 'Generation/grounding files do not read process.env directly; tuning knobs live in src/lib/agent/generation-config.ts as reviewable named constants.',
    anchor: 'Integration With the Standing Skill-Load Rule',
    enforcedBy: ['rule:017'],
    residual: 'Anchor is a stable skill-section marker; the no-raw-env invariant is owned by the agent-architecture contract and enforced by rule 017.',
  },
];

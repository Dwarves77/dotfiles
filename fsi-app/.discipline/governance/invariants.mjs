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
  // 17→18 (2026-06-30): added "analysis in workspace-ACTION sections MUST open with a recognized
  // label" to Section 3. TRIAGE: not a new rule — an instance of the existing labeling discipline
  // already enforced by the provenance gate's criterion 4 (validate_item_provenance quarantines an
  // unlabeled ANALYSIS assertion); covered by the per-claim grounding invariants, no new invariant.
  // 18→19 (2026-07-11, Wave-α C8): added "Canonical instrument key (dedup-before-grounding identity)"
  // normative line ("Two VERIFIED, non-archived items MUST NOT share a canonical instrument key").
  // TRIAGE: new invariant EP-11 (enforcedBy audit canonical-key-uniqueness.mjs + migration 200).
  'environmental-policy-and-innovation': 19,
  // 10→11 (2026-07-03): added the "Floor-qualifying source reaches grounding COMPLETE (the truncation
  // moat)" normative line. TRIAGE: new invariant SC-10 (enforcedBy selftest source-blocks.test.mjs).
  // 11→12 (2026-07-03): added the "Floor-first span re-attribution (the attribution half of the moat)"
  // normative line. TRIAGE: new invariant SC-11 (enforcedBy selftests floor-attribution.test.mjs +
  // null-tier-flag.test.mjs). Closes the attribution half the truncation moat (SC-10) left open.
  // 12→13 (2026-07-04): added the "slot-forcing genuine-support (never fabricate a FACT to clear a
  // criterion)" normative line. TRIAGE: new invariant SC-12 (enforcedBy selftest slot-forcing.test.mjs).
  'source-credibility-model': 13,
  'analysis-construction-spec': 4,
  // 9→10 (2026-07-12): the Research-positioning ruling added the analysis-follows-page-intent contract line
  // "One generic analysis path serving all pages is forbidden" (REGULATIONS §Analysis contract). TRIAGE:
  // NOT a new bare rule needing a fresh invariant — it is the doctrine-register entries
  // `analysis-follows-page-intent` (exempt; enforcement-to-build with the surface build units) and
  // `research-is-horizon-scan` (enforcedBy RD-20). Re-baseline to 10.
  'caros-ledge-platform-intent': 10,
  // 18→19 (2026-07-03): added Section 4 category 9 "Producer-consumer orphan (the half-slice defect)"
  // — "a table the application writes MUST have a consumer, OR be allowlisted…". TRIAGE: new normative
  // statement, triaged into invariant RD-9 (enforcedBy fitness:F14, the A2 orphan checker).
  // 19→20 (2026-07-04): added Section 4.6 "the spend chokepoint (generation-side dedup-before-ground)"
  // normative line. TRIAGE: new invariant RD-10 (enforcedBy fitness:F15 + spend-guard.test.mjs selftest).
  // 20→21 (2026-07-06): added Section 4 category 10 "The transport hold gate (fetch-primitive scrape-hold
  // gate)". TRIAGE: new invariant RD-11 (enforcedBy fitness:F16 + fetch-hold.test.mjs selftest).
  // 21→22 (2026-07-06): added Section 4 category 11 "The size-cap doctrine (no silent slice on the grounding
  // path)". TRIAGE: new invariant RD-12 (enforcedBy fitness:F17 + section-grounding.test.mjs selftest).
  // 22→23 (2026-07-06): added Section 4 category 12 "The error-body groundability gate (never ground a FACT to
  // a failed fetch)". TRIAGE: new invariant RD-13 (enforcedBy entity-gate.test.mjs + spend-guard.test.mjs).
  // 23→24 (2026-07-06): added Section 4 category 13 "The transport escalation ladder + write-side error-body
  // gate (transport failure is never terminal, never stored)". TRIAGE: new invariant RD-14 (enforcedBy
  // selftests transport-escalation.test.mjs + entity-gate.test.mjs).
  // 24→25 (2026-07-11): added Section 4 category 14 "Worktree isolation (agent branch/checkout/merge ONLY in
  // the assigned worktree)" — the dual (belt: PreToolUse skill-gate; suspenders: git post-checkout +
  // pre-commit hooks) fail-closed guard for the sub-agent-in-main-checkout incident. TRIAGE: new invariant
  // RD-19 (enforcedBy selftest worktree-isolation.test.mjs).
  // 25→26 (2026-07-11, Unit 0b pt2): added §2.1 the intake-side sibling "staged_updates is TRANSIT-ONLY"
  // (RD-20) — a staged row resolves (materialized / rejected-with-reason / routed-to-flag) or ages into the
  // flag resolver, never parks (P1#5 defense). TRIAGE: new invariant RD-20 (enforcedBy staged-transit-audit);
  // flips the no-human-finish-of-intake doctrine to enforced.
  // 26→27 (2026-07-12): §4 category 17 "The pause-flag one-writer (structural enforcement, no credential…)".
  // TRIAGE: not a new bare rule — the doctrine-register entry pause-flag-has-one-writer (enforcedBy RD-23:
  // F20 fitness + migration-201 guard + audit). Re-baseline to 27.
  'remediation-discipline': 27,
  // 17→18 (2026-07-12, secrets-topology dispatch): added the "Secrets-topology consistency (a referenced
  // credential must be a registered credential)" normative line to the Inventory-consistency section.
  // TRIAGE: new invariant SF-11-secrets-registered (enforcedBy selftest secrets-reference-audit.test.mjs +
  // the meta-gate runs the audit). Mechanizes no-new-secrets-without-need + credential-surface-visibility.
  'sprint-followups-discipline': 18,
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

  {
    id: 'EP-9-single-mint-chokepoint',
    skill: 'environmental-policy-and-innovation',
    section: 'Format Mapping / phase-intake-gate mint chokepoint',
    text: 'Every intelligence_items INSERT funnels through mintIntelligenceItem() (the ONE chokepoint) where source↔claim-type congruence (1a primary-artifact-on-news → market_signal retype; 1b research_finding-on-press-release → keep type, seek study) + high-precision subject-existence dedup run on BOTH mint paths (drain-first-fetch AND staged_updates materialization). A direct INSERT bypasses the intake gate and mis-types or duplicates the corpus — the exact defect that let drain-first-fetch mint 38 pre-gate polluters.',
    anchor: 'Format Mapping',
    enforcedBy: ['fitness:F13'],
    residual: 'F13 is a STATIC scan (flags any `from("intelligence_items")…insert(` outside src/lib/intake/mint-item.ts across src/**, excl tests/scripts) — it enforces the STRUCTURAL single-chokepoint invariant, with a demonstrated red-then-green failing mode. The congruence/dedup DECISION QUALITY inside the chokepoint is unit-proven separately: source-role.test.mjs (1a/1b) + entity-resolve.test.mjs (dedup high-precision + moat failing-mode). Migration 146 (origin/derive) is NOT YET APPLIED, so the link-on-dedup edge write degrades silently until it lands.',
  },

  {
    id: 'EP-10-vocab-sync',
    skill: 'environmental-policy-and-innovation',
    section: 'Database Field Emission / controlled vocabularies',
    text: 'The in-code metadata vocabularies (metadata-vocab.ts DB_*_VALUES) MUST equal the DB CHECK-constraint value sets on intelligence_items (severity/priority/urgency_tier/format_type/signal_band/theme); a drift silently rejects whole-row writes (the severity 3-way fracture), so an emitted value outside the live constraint fails the write.',
    anchor: 'controlled vocabulary for `intelligence_items.topic_tags`',
    enforcedBy: ['audit:fsi-app/scripts/verify/vocab-sync-audit.mjs'],
    residual: 'vocab-sync-audit.mjs (CI-with-secrets lane) reads pg_get_constraintdef from the catalog and compares each column\'s CHECK value set to the matching metadata-vocab Set — the standing truth-teller for a code-vs-DB vocab drift. It was an unwired lane audit before this registration (the meta-gate blind spot). The meta-gate proves wiring (file tracked + skill-cited) in the secret-less pre-push. topic_tags/compliance_object_tags closed-vocab enforcement at emission time is the generation-side half (system-prompt + parser), reference-layer not mechanized here.',
  },
  {
    id: 'EP-11-canonical-instrument-key',
    skill: 'environmental-policy-and-innovation',
    section: 'Output Formats / Canonical instrument key (dedup-before-grounding identity)',
    text: 'Every reg-family EU-instrument item carries a canonical instrument key (bare CELEX, derived from instrument_identifier or source_url; NULL when not confidently derivable — a bare YYYY/N is never guessed). Two VERIFIED, non-archived items MUST NOT share a canonical instrument key (that is two live customer-visible copies of one regulation — the PPWR-both-verified twin defect); the key is the join the dedup-before-grounding gate needs.',
    anchor: 'Two VERIFIED, non-archived items MUST NOT share a canonical instrument key',
    enforcedBy: ['audit:fsi-app/scripts/verify/canonical-key-uniqueness.mjs', 'migration:200'],
    residual: 'Two independent guards: migration 200 = the partial UNIQUE index uq_intelligence_items_canonical_key_verified_live (canonical_instrument_key WHERE verified AND NOT archived) — a DB-level structural bar against a NEW verified twin, plus the BEFORE INSERT/UPDATE normalizing trigger that derives the key; canonical-key-uniqueness.mjs = the live-data lane audit (CI-with-secrets) that mirrors the index AND derives on-the-fly (so it catches a would-be verified twin even before backfill), reaching 0 collisions after the C7.3 merge archives b7736a1a (the one live verified/quarantined 2019/1242 twin lever). The meta-gate proves wiring (file tracked + skill-cited) in the secret-less pre-push. Archived tombstones (verified BUT is_archived — 5cc10a6d PPWR, 6b0939a5 AFIR) are excluded from the guard by construction (WHERE is_archived IS NOT TRUE). Whether two DIFFERENT-format rows are truly one instrument vs item-vs-amendment is a DB-1 item-domain call, not mechanized here (the both-quarantined FuelEU/2024-1610 pairs are the ruling residual).',
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
    enforcedBy: ['audit:fsi-app/scripts/verify/claims-tier-audit.mjs', 'audit:fsi-app/scripts/verify/ledger-onepass-audit.mjs'],
    residual: 'Two independent live-data guards: claims-tier-audit.mjs verifies DERIVATION-CONSISTENCY (D1, migration 145): the stored stamp equals the tier derived from the claim\'s source_id -> COALESCE(tier_override, base_tier) (base_tier-only, moat-pure); it deliberately does NOT re-resolve the span URL NOW — registry growth after grounding is Phase-3 GROWTH, not drift the audit polices. ledger-onepass-audit.mjs is the composed one-pass cross-check that ALSO re-derives the per-type floor in JS (buildResolver + migration 141), catching an SQL-gate-vs-JS-primitive drift. Both were unwired lane audits before this registration. GREEN as of 2026-06-29 (0 mismatches). The meta-gate proves wiring (file exists + skill-cited). Whether a registered institutional tier is itself CORRECT is operator-ratification judgment, not mechanized here.',
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

  {
    id: 'SC-10-floor-source-complete',
    skill: 'source-credibility-model',
    section: 'Canonical Institutional Tier — floor-qualifying source reaches grounding complete (the truncation moat)',
    text: 'A source at/above the item authority floor (tier <= floor) reaches the grounding model COMPLETE, never silently truncated; the synthesis/grounding block builder is TIER-ORDERED (floor-qualifiers full first, lowest-tier corroborators truncate first); a floor source over the hard context ceiling is a SURFACED wall (truncation-guard flag + item stays quarantined with a named reason), never a silent slice. A truncated floor source forces the fact to a sub-floor corroborator (fact_below_authority_floor) even on a healthy pool.',
    anchor: 'Floor-qualifying source reaches grounding COMPLETE (the truncation moat)',
    enforcedBy: ['selftest:fsi-app/src/lib/agent/source-blocks.test.mjs'],
    residual: 'The selftest (in the discipline node --test glob) proves the PURE builder red-then-green: a floor-qualifying source whose fact span sits beyond the old per-corroborator cap is truncated by the order-based logic (RED, fact_below_floor) and COMPLETE under the tier-ordered builder (GREEN); plus the ceiling-wall surfacing and authorityFloorFor (mirrors migration 141 / SC-8). The WIRING (both synthesis R1 and grounding R2 call buildSourceBlocks over the SAME pool/budget/tiers, tiers resolved via buildResolver = base_tier moat) lives in canonical-pipeline.ts; the coupling is by construction (one builder, one call shape), not separately unit-asserted (integration residual). Discovered as the Lane-#4 batch-1 root cause 2026-07-03.',
  },

  {
    id: 'SC-11-floor-first-attribution',
    skill: 'source-credibility-model',
    section: 'Canonical Institutional Tier — floor-first span re-attribution (the attribution half of the moat)',
    text: 'When a FACT\'s verbatim span sits in BOTH a floor-qualifying source and a sub-floor corroborator, grounding attributes it to the floor-qualifying source (best-tier-first) so it grounds AT the floor, not the echo; NEVER forced — a span absent from every floor source keeps its honest attribution (walls/relabels/GAP) and is never stamped to a floor source it is not in; a FACT still resolving to an unregistered host is surfaced as one host-aggregated integrity_flag.',
    anchor: 'Floor-first span re-attribution (the attribution half of the moat)',
    enforcedBy: ['selftest:fsi-app/src/lib/agent/floor-attribution.test.mjs', 'selftest:fsi-app/src/lib/agent/null-tier-flag.test.mjs', 'audit:fsi-app/scripts/verify/unregistered-span-host-audit.mjs'],
    residual: 'The selftests prove the PURE decisions red-then-green: floor-attribution.test.mjs shows a span present in BOTH a floor source and a sub-floor corroborator re-homes to the floor source (RED under the legacy single-URL attribution → fact_below_authority_floor; GREEN under reattributeToFloor) and 4c never-forced (span absent from every floor source → null, no floor stamp); null-tier-flag.test.mjs proves the host-aggregate merge is idempotent per item (re-ground overwrites, never double-counts). The WIRING (groundBrief calls reattributeToFloor at the resolveSpan site over the SAME paginated fail-closed resolver it stamps with; surfaceNullTierHosts upserts the per-host flag) lives in canonical-pipeline.ts — integration residual, not separately unit-asserted. The 4a/4d PROMPT disciplines (synthesis floor-source-span preference; grounding original-language span) ride system-prompt.ts + the grounding extractor prompt (reference-layer, not mechanized). Span-attribution unit, Lane-#4 residual, 2026-07-03.',
  },

  {
    id: 'SC-12-slot-forcing-genuine-support',
    skill: 'source-credibility-model',
    section: 'Canonical Institutional Tier — slot-forcing genuine-support (never fabricate a FACT to clear a criterion)',
    text: 'Slot-forcing closes a required-slot / unlabeled-binding-assertion gap by tagging a FACT with slot_key WHERE the prose covers the slot, or emitting the mandated honest GAP where it does not; a FACT is emitted ONLY where the grounding JUDGE confirms the span supports the assertion (word-overlap NOMINATES candidates, it never decides); a judge-failed assertion routes to the 4c label path or an honest GAP and MUST NOT become a FACT — a FACT is never emitted to clear a criterion.',
    anchor: 'Slot-forcing genuine-support (never fabricate a FACT to clear a criterion)',
    enforcedBy: ['selftest:fsi-app/src/lib/agent/slot-forcing.test.mjs'],
    residual: 'The selftest proves the PURE decision red-then-green: an unsupported assertion (judge.supports=false) NEVER becomes a FACT (routes to RELABEL where prose covers it, honest GAP where absent); a judge-confirmed span becomes a slot_key-tagged FACT with its verbatim span; nominateForSlot only nominates pool-present clauses over MIN_NOMINATION_SPAN, best-topic-overlap first. This is the integrity rule (no invented facts) mechanized for slot coverage. The WIRING (groundBrief invokes forceSlotCoverage with a LIVE judge = a spend-client call over the item pool, appends the FACT/GAP claims, routes RELABELs to the 4c prose path) is the proof-sample integration — the judge decisions are quoted in the genuine-support audit. Slot-forcing unit, 2026-07-04.',
  },

  // ───────────────────────────── analysis-construction-spec ─────────────────────────────
  {
    id: 'AC-1-section-construction',
    skill: 'analysis-construction-spec',
    section: '1. The construction method',
    text: 'Each format is constructed to its declared per-section spec (the section set per format); sections without grounded content are omitted-with-note, never invented to fill.',
    anchor: 'The construction method',
    enforcedBy: ['audit:fsi-app/scripts/verify/format-structure.mjs', 'audit:fsi-app/scripts/audit-skill-conformance.mjs'],
    residual: 'format-structure.mjs proves section presence/structure vs the spec; cannot prove each section\'s INGEST/TRANSFORM/OUTPUT quality (semantic). audit-skill-conformance.mjs is the broader code-checkable conformance sweep over ALL items (format_type↔item_type, min-section count, topic/severity vocab) — the SOFT/informational lane audit, evidence-basing the regen scope; it was an unwired lane audit before this registration (default invocation reads only; --apply persists to integrity_flags via the guarded path).',
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
    enforcedBy: ['audit:fsi-app/scripts/verify/quarantine-disposition-audit.mjs', 'audit:fsi-app/scripts/verify/deferral-hygiene-audit.mjs'],
    residual: 'The audit (CI-with-secrets / ops lane, DB creds) is the live-data guard: it splits past-bound into undispositioned (HARD tripwire, fails the lane) vs deferred (standing, reported only), applying isValidDeferral on the read side AND re-checking deferred_until is in the future. The write-time guard scripts/lib/deferral.mjs prevents vague deferrals from ever being written (reason must name blocker + disposition path, named future resolution_event, real owner). The meta-gate proves wiring (audit file git-tracked + skill-cited) in the secret-less pre-push. Self-resurrection on expiry is the anti-silence property — a deferral cannot quietly outlive its own clock. The FLAG side is now guarded too: deferral-hygiene-audit.mjs (read-only, report-only) names the integrity_flags disposition_deferred rows that rotted — expired-open (deferred_until passed while status=open) and deleted-subject (subject item hard-deleted) — the register cited 47 expired-open + 62 deleted-subject; it reports, never writes (resolution is a later disposition dispatch). NOT mechanized: whether the named blocker is genuinely the real blocker (vs a plausible-sounding one) is remediation judgment (RD-1), not a checkable property.',
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

  {
    id: 'RD-9-producer-consumer-orphan',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 9: Producer-consumer orphan (the half-slice defect)',
    text: 'A table the application writes MUST have a consumer, OR be allowlisted as a legitimate terminal sink (append-only audit trail, or a writer preceding a named-later-phase reader) WITH a stated reason + review-by-phase tag; the allowlist is itself audited (a stale entry is reported). The half-slice defect (writer-no-reader / reader-no-writer) is detected mechanically and conservatively — gate on high-confidence zero-reader write-orphans; reader-side findings are reported, not gated.',
    anchor: 'Producer-consumer orphan (the half-slice defect)',
    enforcedBy: ['fitness:F14'],
    residual: 'F14 (producer-consumer-orphan.mjs pure core, negative-tested red-then-green) gates the high-confidence half-slice — a schema table with a CODE writer and ZERO readers of any kind (no code .select, no SQL FROM/JOIN/REFERENCES) — beyond the reason-bearing, phase-tagged terminal-sink allowlist, and fails on a stale allowlist entry. NAMED RESIDUALS: (1) TABLE-level only — field-level "reader of never-written column" is a best-effort INFORMATIONAL pass (insert/update key parsing is high-false-positive), not gated (REVISIT); (2) TRANSITIVE deadness not chased — a table read only inside a dead RPC/view counts as consumed (conservative, avoids false positives), so a dead SQL subgraph can hide an orphan; (3) reader-orphans are reported for Phase-7 scoping, not gated. The first-run report (2026-07-03) grandfathered notification_deliveries / bulk_imports / ingestion_control_log pending Phase 7 disposition — it does not authorize deletion.',
  },

  {
    id: 'RD-10-spend-chokepoint',
    skill: 'remediation-discipline',
    section: 'Section 4.6 — the spend chokepoint (generation-side dedup-before-ground)',
    text: 'Every model call MUST route through the ONE spend client, which requires a SpendTicket; a ticketless call throws, a per-item ticket whose failure set is fully deterministically-resolvable OR whose standing disposition is DELETE is REJECTED, and the budget ceiling is enforced in code. No Anthropic API call / client instantiation may exist outside the spend client and its sanctioned transport, beyond a reason-bearing, review-by-phase-tagged SHRINKING allowlist that is itself audited (a stale entry is RED).',
    anchor: 'The spend chokepoint (generation-side dedup-before-ground)',
    enforcedBy: ['fitness:F15', 'selftest:fsi-app/src/lib/llm/spend-guard.test.mjs'],
    residual: 'F15 (grep-class, red-then-green: a simulated direct-API bypass in a non-allowlisted file is RED with file:line; the A2 allowlist is stale-audited by the test) gates the STRUCTURAL guarantee — no ungated call site. spend-guard.test.mjs proves the PURE guard red-then-green: ticketless throws, deterministically-resolvable rejected (deterministic-lever), DELETE-disposition rejected, ceiling throws. NAMED RESIDUAL: the allowlist is NON-EMPTY (live count/home = LEGACY_ALLOWLIST in F15-spend-chokepoint.mjs — never cache the number here; it shrinks per migration, was 12 at ship) — each reason-bearing + reviewByPhase-tagged; the shrink plan migrates them to spendStream/spendSearch (classifiers via standingClass). The necessity gate is only as good as the ticket the caller supplies (failureClasses/necessity/disposition); the runner computes them from live provenance. Telemetry single-homed in spend-client.logSpendRun (the 4f relocation).',
  },

  {
    id: 'RD-11-transport-hold-gate',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 10: The transport hold gate (fetch-primitive scrape-hold gate)',
    text: 'The scrape hold MUST be a first-class mechanical gate at the single canonical fetch primitive: assertFetchAllowed(url) throws FetchHoldError while SCRAPE_HOLD is engaged, so "scrape hold LIVE, zero fetches" is enforced in code, not by credential-absence. Because fetch is single-homed, no other file may construct a raw Browserless content fetch that bypasses the gate. The hold defaults to LIFTED (explicit operator control) so wiring it does not break prod; a canonical-URL cache (url-canon single home, per-source TTL) + per-run telemetry accompany it.',
    anchor: 'The transport hold gate (fetch-primitive scrape-hold gate)',
    enforcedBy: ['fitness:F16', 'selftest:fsi-app/src/lib/sources/fetch-hold.test.mjs'],
    residual: 'F16 (grep-class, red-then-green: the primitive missing assertFetchAllowed is RED; a raw Browserless /content fetch in a non-sanctioned file is RED with file:line) gates the STRUCTURAL guarantee — the hold gate is present at the single primitive and un-bypassable. fetch-hold.test.mjs proves the PURE core red-then-green: engaged→throws (fetchImpl never called), lifted→passes, canonical cache HIT on url-canon-equivalent URLs, TTL freshness, hold-blocked/hit/miss telemetry. NAMED RESIDUAL: the hold DEFAULTS to LIFTED (prod-preserving) — the build-time zero-fetch posture is held by the runners deleting BROWSERLESS_API_KEY as belt-and-suspenders + the operator engaging SCRAPE_HOLD; lifting the hold (SCRAPE_HOLD=off) is the operator cadence ruling. The cache store is per-run in-memory (a durable/DB-backed cache is a future extension); TTL table is a small curated host list + a 24h default (REVISIT as sources are added).',
  },

  {
    id: 'RD-12-size-cap-doctrine',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 11: The size-cap doctrine (no silent slice on the grounding path)',
    text: 'Every size cap on the capture→synthesis→grounding→judge path is either sized so it never binds in normal operation, or fails LOUD (surfaced wall — recordTruncation → coverage_gap flag + item held with a named reason) when it binds. Silent slicing is forbidden (the GROUND_SECTION_MAX_CHARS=12000 category-2 defect that hid the back of every long section from the grounder). Every path cap is enumerated + classified; a new unregistered/silent cap is RED.',
    anchor: 'The size-cap doctrine (no silent slice on the grounding path)',
    enforcedBy: ['fitness:F17', 'selftest:fsi-app/src/lib/agent/section-grounding.test.mjs'],
    residual: 'F17 (grep-class, red-then-green: a new unregistered *_MAX_CHARS/*_BUDGET_CHARS/*_CEILING_CHARS on the path is RED; a registry entry marked silent-grounding is RED) gates the STRUCTURAL guarantee — no silent cap slips onto the path unclassified. section-grounding.test.mjs proves the fix red-then-green: a binding fact beyond the old 12KB boundary is invisible to the old slice(0,12000) and reaches the grounder complete post-fix; a pathological over-ceiling section is SURFACED (truncated=true + fullLength), never silent. NAMED RESIDUALS: (1) the classify-path excerpt caps (haiku-classify ~6000, first-fetch ~6000, recommend-tier 4000) are SILENT binders on the CLASSIFICATION path (tier/type/portal), not the fact-grounding path — LOW risk (source nature is evident early), registered in the cap-inventory as REVISIT, not converted now; (2) F17 registers cap CONSTANTS on generation-config + section-grounding — an inline `.slice(0, N)` re-introduced elsewhere on the path is caught by review + the section-grounding selftest, not by F17 grep (the constant-declaration form is the robust signal). Full inventory: docs/design/cap-inventory-2026-07-06.md.',
  },

  {
    id: 'RD-13-one-url-canonicalizer',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 4: API contract gaps (URL canonicalization) — one home for URL identity',
    text: 'URL-identity normalization (the transform that makes two URLs meaning the same resource compare equal) lives in ONE sanctioned home — canonicalizeUrl (src/lib/sources/url-canonicalize.ts). No module may re-implement it with an ad-hoc regex chain. The forbidden shapes are the two the deleted intake _normUrl used: bare scheme-strip (.replace(/^https?:\\/\\/…)) and whole query/fragment drop (.replace(/[#?]…)). The second was the D1 defect — dropping the whole query collapsed every eur-lex …?uri=CELEX:… URL to one key and false-deduped distinct EUR-Lex regs at the mint chokepoint. canonicalizeUrl PRESERVES query content (the CELEX is the identity) while folding scheme-case/www/default-port/trailing-slash/query-order/fragment.',
    anchor: 'API contract gaps',
    enforcedBy: ['fitness:F18', 'selftest:fsi-app/src/lib/entities/entity-resolve.test.mjs'],
    residual: 'F18 (grep-class, red-then-green: a bare scheme-strip or a query/fragment-drop character class of {#,?} anywhere in fsi-app/src/** outside the sanctioned home is RED with file:line) gates the STRUCTURAL guarantee — the _normUrl class cannot be reintroduced. entity-resolve.test.mjs proves the BEHAVIOR red-then-green: two eur-lex legal-content URLs naming DIFFERENT CELEX do NOT dedup (query is identity), noise variants (scheme-case/www/trailing-slash/fragment) DO dedup, and the reg-number matcher does not false-positive across the pair. NAMED NON-TARGETS (deliberately not flagged, each a DIFFERENT operation): host extraction (new URL(x).host.replace(/^www./)) for registrable-domain/tier/portal resolution; canonicalizeCitationUrl (src/lib/agent/url-canon.mjs) — the SQL mig-150 mirror with its own drift guard, which also PRESERVES the query; verification.ts checkDuplicate — new URL()-structural SOURCE-registry dedup (deliberately query-dropping for portals, a distinct table + concern). The switch to canonicalizeUrl is STRICTER than _normUrl on http-vs-https (scheme kept, only case normalized) and path case (preserved); the reg_number + instrument_identifier matchers remain the PRIMARY identity signals, so the tightening removes false positives without adding false negatives of substance.',
  },

  {
    id: 'RD-14-line-read-is-not-verification',
    skill: 'remediation-discipline',
    section: 'Section 3.5 — investigation discipline: a deterministic gate ships with a table-driven contract test; an audit line-read is not behavioral verification',
    text: 'A deterministic intake gate (sourceRole/congruence, urlIsRoot, matchExistingSubject, and the mint idempotency short-circuits: source_url / legacy_id / the fail-closed read-error refusal) ships with a COMMITTED table-driven behavioral contract test over a golden URL corpus, proven red-then-green — a line-read of the gate does NOT count as verification. The named gates are enforced by their committed tests running; new deterministic gates are closeout-audited for the same coverage.',
    anchor: 'Investigation discipline',
    enforcedBy: ['selftest:fsi-app/src/lib/intake/intake-gates-golden.test.mjs', 'selftest:fsi-app/src/lib/intake/mint-idempotency.npmtest.mjs'],
    residual: 'intake-gates-golden.test.mjs (depless suite) proves sourceRole/congruence (1a retype + 1b seek-study), urlIsRoot (portal roots incl. language-prefix + landing-file variants vs deep docs), and matchExistingSubject (CELEX discrimination + noise-variant equivalence + reg-# cross-match + title-sim rejection) table-driven over the committed intake-url-corpus.mjs. mint-idempotency.npmtest.mjs (jiti) proves the source_url + legacy_id short-circuits return the existing item with NO INSERT; mint-failclosed.npmtest.mjs proves the fail-closed probe/corpus read-error refusals. The meta-gate keys on these committed contract-test files existing (deleting one is RED). The "every NEW deterministic gate carries such a test" growth case is closeout-audited authoring discipline — the mechanical anchor is the named-gate committed corpus + tests.',
  },

  {
    id: 'RD-15-no-service-anon-downgrade',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 4: API contract gaps — a service-role client is fail-closed, never anon-downgraded',
    text: 'A service-role Supabase client MUST be fail-closed: a missing SUPABASE_SERVICE_ROLE_KEY THROWS (or yields no data) — it NEVER silently downgrades to NEXT_PUBLIC_SUPABASE_ANON_KEY. The downgrade masks service-role misconfiguration in production as RLS-limited reads (empty/wrong data downstream). The canonical getServiceSupabase (src/lib/supabase-service.ts) is the fail-closed home; the `SUPABASE_SERVICE_ROLE_KEY || …ANON_KEY` pattern anywhere in src is forbidden.',
    anchor: 'API contract gaps',
    enforcedBy: ['fitness:F19', 'selftest:fsi-app/.discipline/fitness/functions/F19-no-service-anon-downgrade.test.mjs'],
    residual: 'F19 (grep-class, red-then-green: the `SERVICE_ROLE || …ANON_KEY` downgrade in either order, tolerant of the line break it is written across, is RED with file:line) gates the STRUCTURAL guarantee — the anon-downgrade class (SF-1 fixed in the canonical, then re-appeared ad-hoc in coverage-gaps.ts — Ruling 2 C1) cannot recur. coverage-gaps.ts now routes through getServiceSupabase (fail-closed → caught → empty coverage, never WRONG coverage from anon reads). NAMED RESIDUAL: the broad 52-file getServiceClient→getServiceSupabase CONSOLIDATION (hygiene, correctness-neutral where those factories are already service-only) rides the hygiene pass; F19 makes the SAFETY property (no anon downgrade) hold across all of them by gate regardless of the literal consolidation.',
  },

  {
    id: 'RD-13-error-body-groundability-gate',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 12: The error-body groundability gate (never ground a FACT to a failed fetch)',
    text: 'A failed-fetch capture (bot wall / 403 / 404 / Request-Access block / nav shell) stored as source content MUST NEVER enter grounding input, the floor pool, or slot-forcing nomination — grounding a FACT to a 404 body is the fabricate-via-error-page moat breach. The single-home isErrorBody gates the grounding pool at its origin (partitionErrorBodies); excluded captures are surfaced, never silently dropped. The necessity gate additionally REJECTS a paid re-ground whose remaining failures can only be satisfied by content behind a failed fetch (junk-pool, event-bound to re-collection).',
    anchor: 'The error-body groundability gate (never ground a FACT to a failed fetch)',
    enforcedBy: ['selftest:fsi-app/src/lib/sources/entity-gate.test.mjs', 'selftest:fsi-app/src/lib/llm/spend-guard.test.mjs'],
    residual: 'entity-gate.test.mjs proves the gate red-then-green with REAL corpus fixtures: a EUR-Lex 404, a Cloudflare bot wall, and a 403 block are error bodies EXCLUDED from the pool that feeds grounding input + floor pool + nomination; a real law body is NOT over-excluded. spend-guard.test.mjs proves the junk-pool necessity rejection. The gate is a single filter on the shared `fetched` pool in groundBrief, so all three downstream consumers (buildSourceBlocks, floorSources, forceSlotCoverage) are gated at once. NAMED RESIDUALS: (1) isErrorBody is CONSERVATIVE — it misses a mid-size (>1500ch, <2-marker) 404 like the two EUR-Lex "Page Not Found" pages (2989ch); those were caught by human adjudication + the named-breach fix, and the durable fix is migration 147 sources.fetch_status (persist the transport-layer verdict so the gate reads a column, not a heuristic); (2) the gate prevents FUTURE junk-grounding — the EXISTING 51+ error-grounded FACTs across 27 items are flagged (error-body-gate / error-page-breach integrity_flags) and fixed by re-fetch+re-ground at hold-lift, status changing on evidence (no preemptive re-quarantine); (3) render-derive at read time until the DDL window lands migration 147.',
  },

  {
    id: 'RD-14-transport-escalation-write-gate',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 13: The transport escalation ladder + write-side error-body gate',
    text: 'RD-13 gates READ-side consumption; RD-14 is the WRITE-side complement + the per-failure-class escalation ladder. The capture layer MUST NEVER store an error body (bot wall / 403 / 404 / Request-Access wall / nav shell / JS shell) as source content into agent_run_searches — isErrorBody (single home) at CAPTURE time, plus the capture-time superset that also refuses the Request-Access wall + JS shell isErrorBody misses. The ladder at the single primitive: (a) canonical-URL cache first; (b) block/bot-wall on one transport → try the OTHER, either direction (fires on the 403 class, not only cdn_block); (c) JS-shell/soft-404 → Browserless render path; (d) API hosts (federalregister.gov + eCFR) → official JSON API, never HTML; (e) genuine 404/410 after the ladder → seek-more task, never a stored error body; (f) exhausted → record the verdict + item HOLDS with the named reason NO_REACHABLE_SOURCE, event-bound. Transport failure is never terminal and never stored.',
    anchor: 'The transport escalation ladder + write-side error-body gate (transport failure is never terminal, never stored)',
    enforcedBy: ['selftest:fsi-app/src/lib/sources/transport-escalation.test.mjs', 'selftest:fsi-app/src/lib/sources/transport-runtime.test.mjs', 'selftest:fsi-app/src/lib/sources/entity-gate.test.mjs'],
    residual: 'transport-escalation.test.mjs proves the PURE decision logic red-then-green with the FOUR real adjudicated fixtures (SFC 403 on render → plain-HTTP salvage GREEN; EUR-Lex 404 both transports → seek-more, ZERO stored; customs.go.jp JS shell on direct → render path chosen; federalregister Request-Access → API route chosen, HTML never touched) plus both-directions try-other, ladder-exhausted → NO_REACHABLE_SOURCE hold, cache short-circuit, the classifier per failure class incl. the two-detector gap, and captureForStorage (error bodies NEVER stored; all-junk capture holds). entity-gate.test.mjs proves the single-home isErrorBody the write gate reuses. LADDER WIRING (2026-07-06 follow-up dispatch): the ladder is NOW the LIVE runtime fetch path — canonical-pipeline.ts fetchWithTransport delegates to transport-runtime.escalateToFetchResult (→ escalateFetch), so fetchMeta / blFetchClean / fetchPrimaryDeep and all three pool-INSERT sites route PER CLASS at runtime (API→apiFetchForHost, JS-shell/soft-404→render, block→try-both, 404→seek-more, exhaustion→NO_REACHABLE_SOURCE hold); transport-runtime.test.mjs proves the LIVE adapter routes per class red-then-green with the same real fixtures (dep-injected transports, no real fetch) + truncation-metadata preservation + the primary lastFailureText reason-carry. The TWO-DETECTOR leak is FOLDED: fetchWithTransport no longer calls bare detectRoadblock, and detectRoadblock now shares the classifier\'s isErrorBody 2500ch backstop (primary-fallback.mjs), so the 600-vs-2500 disagreement that stored the junk is structurally eliminated (proven by primary-fallback.test.mjs "TWO-HOMES FOLD"). NAMED RESIDUALS: (1) captureForStorage inherits isErrorBody\'s conservatism on the mid-size EUR-Lex 404 class — the classifier superset catches Request-Access + JS-shell but the >1500ch <2-marker soft-404 remains a named RD-13 residual until migration 147 sources.fetch_status persists the transport verdict; (2) the seek-more task (e) is emitted at runtime but its DURABLE home + the fetch_status verdict (f) still land with the hold-lift re-fetch batch + migration 147 (the runtime emits the task shape; persisting/queuing it is the next batch). HARD SEQUENCING GATE (RD-14, amended 2026-07-06 post-#198-merge; cadence correction folded): the hold-lift re-fetch (BATCH 1) is a BOUNDED ONE-TIME re-collection with THREE preconditions and MUST NOT run until ALL THREE hold. PRECONDITION 1 (wiring) = SATISFIED: escalateFetch/escalateToFetchResult IS the LIVE runtime fetch path (fetchWithTransport delegates through it); do not run batch 1 against any code state where fetchWithTransport bypasses the ladder. PRECONDITION 2 (seek-more + durable audit) = NOT YET BUILT: seek-more candidate generation (identifier resolution + web-search feeding the url-array seam) AND a DURABLE per-item exhaustion-record home must be MERGED first — under Earth-Exhaustion no item may reach a hold-or-delete call on unreachability grounds without a stored exhaustion record. PRECONDITION 3 (operator go-line) = NOT GIVEN: Jason must issue an explicit batch-1 line ("Batch 1 approved, quote confirmed"); batch 1 does NOT imply, require, or start any recurring schedule. NO SESSION RUNS BATCH 1 ON WIRING ALONE, AND NO AUTO-ANYTHING. Cadence is SEPARATE and LATER — set by Jason in admin after the site redesign, on his schedule, never tied to batch 1; scrape hold stays LIVE indefinitely until then. The amended anti-parking invariant (an unreachability hold WITHOUT an exhaustion record = RED) ships WITH the seek-more unit, which must create the record shape first. CADENCE PRECONDITION (recorded 2026-07-06 alongside the batch-1 gate): CADENCE = any NEW-INTAKE MINTING, and it is SEPARATELY gated — it requires the INTAKE GATE LIVE = #171 (mint chokepoint) MERGED + migration 146 APPLIED + full-path mint-chokepoint proof GREEN + ACTIVE_PHASE FLIPPED. No mint gate has ever been live on master (mint-item.ts is branch-only, F13 reserved-not-active); the scrape hold is the SOLE current protection against minting. BATCH 1 is EXEMPT from this precondition — it operates on EXISTING items only with ZERO mints; if any batch-1 operation would MINT a new intelligence_items row, STOP AND REPORT (do not proceed). The batch-1 go-line and the cadence go-line are SEPARATE future Jason lines.',
  },

  // RD-15 (no-unreachability-hold-without-exhaustion-record) — NAMED RESIDUAL, NOT YET AN ENTRY (comment only,
  // intentionally not in the INVARIANTS array so it is not build-failing yet). The anti-parking invariant: an
  // item MUST NOT reach a hold-or-delete call on UNREACHABILITY grounds without a stored EXHAUSTION RECORD (proof
  // of what was tried per candidate × transport). As of the seek-more unit (2026-07-06, feat/seek-more) the
  // RECORD SHAPE + its interim durable home now EXIST: src/lib/sources/seek-more.mjs (generateCandidates →
  // escalateFetch(url[]) → runSeekMore returns the per-attempt exhaustion record; exhaustionFlagRow /
  // persistExhaustionRecord persist it via the INTERIM FLAG PATTERN — integrity_flags, created_by=
  // 'exhaustion_record', category='source_issue', subject_ref=itemId, attempts in recommended_actions jsonb —
  // superseded by migration 147 sources.fetch_status). RD-15 is SEQUENCED LAST: it is wired build-FAILING only
  // AFTER (a) migration 147 lands the durable fetch_status column and (b) Jason's batch-1 go-line, so the gate
  // is not turned on before the persistence path it polices is live end-to-end. Until then this comment is the
  // registered residual (same pattern as a deferred-for-cost named residual), and the seek-more selftest
  // (src/lib/sources/seek-more.test.mjs) proves the record shape + interim persistence red-then-green.

  {
    id: 'RD-16-transport-hold-all-four',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 10: The transport hold gate (all four transports)',
    text: 'The scrape hold MUST gate ALL FOUR transports — direct-HTTP, API, RSS, Browserless — at their canonical entry points, not only the Browserless primitive: assertFetchAllowed(url) throws FetchHoldError while SCRAPE_HOLD is engaged, so "hold LIVE, zero fetches" is airtight across every transport (CODE-1 F-02). A transport module that makes a network fetch without the hold check FAILS the discipline gate (widened fitness F16 over TRANSPORT_MODULES). Paired with the hold: the url-canon-keyed, per-source-TTL fetch cache is INJECTED into buildLiveTransports (the cacheGet seam escalateFetch checks first) so a re-ground / retry / refresh of the same url does not re-fetch (CODE-1 F-03).',
    anchor: 'The transport hold gate (fetch-primitive scrape-hold gate)',
    enforcedBy: ['fitness:F16', 'selftest:fsi-app/src/lib/sources/fetch-hold.test.mjs'],
    residual: 'F16 widened (C5, 2026-07-11): beyond the primitive-carries-the-gate + no-raw-Browserless checks, F16 now enumerates TRANSPORT_MODULES (rss-fetch.ts, api-fetch.ts, canonical-pipeline.ts — the direct-HTTP + API-ladder home) and REDs any that lack assertFetchAllowed. Gated inline: directFetchClean (direct-HTTP), apiFetchForHost (API-ladder), apiFetch (api-fetch.ts), rssFetch (rss-fetch.ts); browserlessFetch was already gated (RD-11). The fetch cache (fetch-hold.mjs cacheGet/cachePut) is now injected into buildLiveTransports keyed on the canonical URL with the per-host TTL table, so escalateFetch reads a fresh hit before any transport fires. fetch-hold.test.mjs proves the pure core (engaged→throws / lifted→passes / cache HIT on url-canon-equivalent URLs / TTL freshness) red-then-green; F16-transport-hold-gate.test.mjs proves the widened gate REDs a transport module missing the call. NAMED RESIDUAL: the cache store is PROCESS-scoped in-memory (correct for the batch runners, a cold no-op per serverless invocation); a durable/DB-backed cache stays a future extension. The hold still DEFAULTS to LIFTED (prod-preserving); engaging it is the operator cadence control.',
  },

  {
    id: 'RD-17-rls-credential-parity',
    skill: 'remediation-discipline',
    section: 'Section 4 — Configuration drift (credential hygiene) / the reconciler class',
    text: 'On an RLS-enabled table a GRANT is inert unless a matching RLS POLICY also permits the (role, command) — Postgres RLS denies by default. A non-bypass role granted SELECT/INSERT/UPDATE/DELETE with NO covering permissive policy is a grant-without-policy defect (the reconciler credential that was granted but had no USING/WITH CHECK policy — the exact gap migration 169 fixed). Per (table, command, grantee), grants and policies must agree.',
    anchor: 'credential hygiene',
    enforcedBy: ['audit:fsi-app/scripts/verify/rls-credential-parity.mjs'],
    residual: 'rls-credential-parity.mjs (CI-with-secrets lane, pg_catalog + information_schema, read-only) is LOW-FALSE-POSITIVE by scope: it flags grant-without-policy ONLY for CUSTOM application roles (e.g. reconciler), NOT anon/authenticated — those are the RLS-gated public roles whose missing-policy is the intended default-deny (flagging them would fire on every stock Supabase project; live confirmed 52+ such benign anon/authenticated defaults). The meta-gate proves wiring (file tracked + skill-cited) in the secret-less pre-push. LIVE READ-ONLY RUN 2026-07-11 (project kwrsbpiseruzbfwjpvsp): the two custom roles (reconciler, supabase_privileged_role) have ZERO grant-without-policy — mig-169\'s reconciler-cred gap is confirmed CLOSED. NAMED RESIDUAL: it does NOT judge whether an EXISTING policy\'s USING/WITH CHECK predicate is semantically correct (a covering policy clears the flag) — that is the reconcile-revalidate end-to-end proof (RD-6/reconciler dispatch), not a catalog check. Restrictive policies are excluded (they never grant). Highest-value governance rider: it makes a future re-introduction of the class (a new custom write-role granted without a policy) build-catchable.',
  },

  {
    id: 'RD-18-column-existence-parity',
    skill: 'remediation-discipline',
    section: 'Section 4 category 3 — Type-system drift (schema-vs-code)',
    text: 'A code write-site that names a column the schema does not have is a PostgREST silent whole-row reject (error swallowed) — the reviewer_notes / dismissed_* phantom-column class. Every literal .from("T").insert|update|upsert({...}) column key MUST exist in the live schema; a code-referenced phantom column is a drift caught before it reaches prod.',
    anchor: 'schema-vs-code compatibility breaks',
    enforcedBy: ['audit:fsi-app/scripts/verify/column-existence-parity.mjs'],
    residual: 'column-existence-parity.mjs (CI-with-secrets lane) greps literal object-literal write-sites, extracts top-level column keys, and asserts each exists in information_schema.columns for that table. HONEST SCOPE (the achievable targeted version, NOT a full typed contract): it sees LITERAL keys only — spread writes ({...payload}), dynamically-built rows, computed keys, and a variable passed to .insert(row) are reported UNRESOLVED (informational), never flagged as phantom; select-column strings are not parsed (write-side is the higher-severity class). The durable form is a committed `supabase gen types` snapshot + a tsc gate (REVISIT); this catalog-vs-grep audit is the zero-DDL interim that catches the reviewer_notes class today. The meta-gate proves wiring (file tracked + skill-cited).',
  },

  {
    id: 'RD-19-worktree-isolation',
    skill: 'remediation-discipline',
    section: 'Section 4 category 14 — Worktree isolation (agent branch/checkout/merge ONLY in the assigned worktree)',
    text: 'Agent branch/checkout/merge operations occur ONLY in that agent\'s assigned worktree; the main checkout is the orchestrator\'s exclusive surface. Enforced fail-closed + dual: a git post-checkout hook HARD-FAILS (detection+alarm; it cannot undo the move) and a git pre-commit hook BLOCKS when an AGENT context (CLAUDE_CODE_CHILD_SESSION) operates in the MAIN checkout (git-dir == git-common-dir) OR the main checkout sits on an agent-owned branch (worktree-agent-<hex>/agent-<hex>); the PreToolUse skill-gate belt surfaces every branch/checkout/merge/rebase op in the main session (the leg the session-scoped gate CAN reach). Git hooks fire regardless of session type, so the suspenders catch a sub-agent\'s op the belt cannot.',
    anchor: 'Worktree isolation (agent branch/checkout/merge ONLY in the assigned worktree)',
    enforcedBy: ['selftest:fsi-app/.discipline/governance/worktree-isolation.test.mjs'],
    residual: 'worktree-isolation.test.mjs proves the PURE verdict red-then-green: main+agent checkout/commit BLOCKS with the verbatim doctrine; worktree+agent and orchestrator-in-main PASS; the agent-owned-branch commit BLOCKS even without the env marker; and a WIRING assertion reads the post-checkout/pre-commit hook scripts + the runner + the skill-gate to prove they consume the single-home module (so the gate cannot be silently unwired). The two runtime legs (git hooks + PreToolUse) are the belt+suspenders MECHANISMS; the selftest is the proof-of-logic the meta-gate resolves. NAMED RESIDUALS: (1) the WHO signal rests on the harness naming CLAUDE_CODE_CHILD_SESSION for sub-agents and NOT the orchestrator (AI_AGENT is present in both, non-discriminating) — if a future harness ran the orchestrator as a child session, or an agent WITHOUT the marker, the WHO gate would misfire; the pre-commit branch-name belt is the env-independent backstop for the missing-marker case, and the WHERE signal (git-dir vs common-dir) is zero-false-positive. (2) post-checkout is DETECTION+ALARM only — git already moved HEAD by the time it runs; the pre-commit leg is the real block that stops the wrong-label commit. (3) OUT-OF-REPO INSTALL: the hooks only fire once install-hooks.mjs copies them into the shared .git/hooks (git-common-dir); like the pre-push/commit-msg hooks this install is operator-run and lives outside the repo, so the meta-gate proves the SOURCE + logic are wired, not that the operator installed them (same boundary as the skill-gate settings.json in step 3c). (4) the skill-gate belt is main-session-only (PreToolUse does not fire in subagents, verified 2026-06-07) — it ASKs (cannot read the eventual cwd from the payload); the git hooks are what actually gate a sub-agent.',
  },

  {
    id: 'RD-20-staged-transit-disposition',
    skill: 'remediation-discipline',
    section: 'Section 2.1 — the intake-side sibling (staged_updates is transit-only)',
    text: 'staged_updates is TRANSIT-ONLY (the intake half of no-human-finish-of-intake): a staged row resolves to MATERIALIZED (approved + materialized_at set), REJECTED-with-reason, or ROUTED-to-the-flag-resolver (an OPEN integrity_flag on the staged id — Unit 2), and MUST NOT sit in a transit state (pending / approved-unmaterialized) past the max-age. A materialization failure ages into the flag resolver, never a new species of parked approved-unmaterialized orphan (the P1#5 defect).',
    anchor: 'staged_updates` is TRANSIT-ONLY',
    enforcedBy: ['audit:fsi-app/scripts/verify/staged-transit-audit.mjs'],
    residual: 'staged-transit-audit.mjs (CI-with-secrets / ops lane, DB creds) is the live-data truth-teller: it classifies every staged row against the REPAIRED lifecycle (migration 034 materialization_error/materialized_at + Wave-α approve-idempotency + reviewer_notes) into resolved (materialized / rejected-with-reason / routed-to-flag) vs transit (pending / approved-unmaterialized), and fails the lane on any transit row past the 72h max-age not routed to a flag. The meta-gate proves the file is git-tracked + skill-cited in the secret-less pre-push. SEQUENCING (honest): while the human-approval materialization path is still live (until the run-one-cycle orchestration removes it, Unit 0c), the live run can show a real transit backlog — the audit surfacing what the transit-only model eliminates (flag-rate is not defect-rate), driven to zero by U0c/U1; it never blocks the required pre-push. Whether a rejected row\'s reason is genuinely adequate is remediation judgment (RD-1), not mechanized (a reasonless rejected row is a reported soft finding).',
  },
  {
    id: 'RD-21-generation-pause-split',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 15: The generation pause split (pause is prohibition, dormancy is schedule)',
    text: 'Generation pause is SPLIT by a single pure primitive evaluateGenerationPause(scrape, caller): emergencyPaused (global_processing_paused) is a HARD stop for EVERY caller (the operator stop is inviolable, no caller identity overrides it); cadence===off is DORMANT and halts AUTONOMOUS generation only — an F16-signed manual caller (manual-intake-run) proceeds. The fetch gate isGloballyPaused is unchanged; downstream integrity gates (data-audit-block, daily-cap, floors, judge) bind every caller. This is why the manual-intake path can GROUND (not only MINT) in the dormant pre-launch state.',
    anchor: 'The generation pause split (pause is prohibition, dormancy is schedule)',
    enforcedBy: ['selftest:fsi-app/src/lib/api/generation-pause.npmtest.mjs'],
    residual: 'generation-pause.npmtest.mjs proves the split red-then-green (7/7): the signed manual caller PASSES cadence-off (dormancy is a schedule), and is BLOCKED under emergencyPaused (the operator stop is inviolable — no caller identity overrides it); autonomous/unsigned callers stay gated by cadence-off; everyone runs when a cadence is set and no emergency. The STOP-FLAG-WRITE half — that no agent may ALTER global_processing_paused/scrape_cadence by a direct write — is a SEPARATE mechanical leg, now RD-23 (pause-flag-has-one-writer): the F20 fitness function (static one-writer) + the migration-201 guard trigger + admin_set_pause_state RPC (runtime bounce of any unmarked write) + the audit table. This REPLACES the DEAD 2a operator-credential design (which required a manual operator step to provision a login role/secret — human intervention as a fix, ruled dead 2026-07-12).',
  },
  {
    id: 'RD-22-mint-source-link',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 16: The source-link mint invariant (a mint cannot produce a source-less LIVE item)',
    text: 'A mint cannot produce a source-less LIVE intelligence_items row: grounding grounds a brief against the item source, so a source_id=NULL item can never verify. Enforced at the ONE mint home (mint-item.ts sourceLinkDecision): a preset source_id is trusted, an unresolved source_url is REJECTED-with-reason (register first, no silent orphan, no auto-registration), a registry read error fails closed. Companion (Fix B): a STRUCTURAL ground-failure class (no source_id) routes STRAIGHT to held-for-re-source, skipping the futile re-ground/re-research passes, and the erase step is relabeled honestly (brief-nulled-held, never archived).',
    anchor: 'The source-link mint invariant (a mint cannot produce a source-less LIVE item)',
    enforcedBy: [
      'audit:fsi-app/scripts/verify/source-link-audit.mjs',
      'selftest:fsi-app/src/lib/intake/mint-source-link.npmtest.mjs',
      'selftest:fsi-app/src/lib/intake/source-link-invariant.test.mjs',
      'selftest:fsi-app/src/lib/agent/ground-failure-class.test.mjs',
    ],
    residual: 'The CHOKEPOINT gate is proven red-then-green in mint-source-link.npmtest.mjs (a registered source LINKS + inserts; an unregistered url REJECTS action=unsourced, no insert) — it forecloses new source-less LIVE mints for ALL callers of the single mint home. source-link-audit.mjs (live-data, CI-with-secrets lane) is the belt: it fails on any source-less LIVE row NOT in the documented pre-cutover grandfather (source-link-invariant.mjs GRANDFATHERED_SOURCELESS = the two 2026-07-12 T9 orphans, whose re-sourcing is Unit 3; the list should only ever shrink). The Fix-B structural routing is proven in ground-failure-class.test.mjs (no source_id -> structural_hold = zero re-research). NAMED RESIDUAL: the scan path only attaches a source_id when the url ALREADY matches a registered sources row, so an unregistered-url candidate now REJECTS on both paths (register the source first) — the intended tightening. Auto-registration of the institution as a source at mint is deliberately NOT built under this unit.',
  },
  {
    id: 'RD-23-pause-flag-one-writer',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 17: The pause-flag one-writer (structural enforcement, no credential, no manual step)',
    text: 'system_state.global_processing_paused / scrape_cadence have EXACTLY ONE writer, enforced structurally with no credential and no manual step: (static) the F20 fitness function fails CI on any direct write to those columns in src outside the sanctioned admin route; (runtime) migration 201 — the SECURITY DEFINER RPC admin_set_pause_state declares a transaction-local marker app.pause_flag_writer, and the guard_pause_flag_writer trigger BOUNCES any flag change lacking the marker (a generic service-role UPDATE is rejected); (detection) system_state_flag_audit logs every authorized write. This REPLACES the DEAD 2a operator-credential design (which required a manual operator step).',
    anchor: 'The pause-flag one-writer (structural enforcement, no credential, no manual step)',
    enforcedBy: [
      'fitness:F20',
      'selftest:fsi-app/.discipline/fitness/functions/F20-pause-flag-one-writer.test.mjs',
      'migration:201',
      'audit:fsi-app/scripts/verify/pause-flag-guard-proof.mjs',
    ],
    residual: 'F20 (grep-class, red-then-green in F20-...test.mjs: a direct .update/assignment/SQL-SET on the flags outside the sanctioned route is RED; reads + type annotations + the RPC caller are GREEN; a LIVE census proves the whole src tree passes — the RPC is the only writer) gates the STATIC one-writer. Migration 201 (the guard trigger + the admin_set_pause_state RPC) is the RUNTIME bounce: the bounce is proven red-then-green by pause-flag-guard-proof.mjs on a SYNTHETIC temp table in a rolled-back transaction (unmarked UPDATE raises; a marked UPDATE succeeds) — the live flag is NEVER written, including by the test. RESIDUAL (honest, same class as any GUC marker): a determined caller with raw SQL access could set the marker itself in the same transaction and bypass the trigger — but no COMMITTED code can (F20), the casual agent flip (a plain UPDATE) bounces, and every write is audited. This is structural defense-in-layers, not a cryptographic vault; it needs no human-held secret, which was the whole point.',
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
  {
    id: 'SF-10-customer-surface-rendering',
    skill: 'sprint-followups-discipline',
    section: 'Customer-surface rendering fidelity (overflow / placeholder-literal / hydration are build-catchable)',
    text: 'A customer-facing surface must render its data extremes without a horizontal-overflow escape (scrollWidth <= clientWidth on the audited containers + body, excluding the internally-panning .leaflet-container), without an F-1 placeholder-literal ("Source Name"/"Tier estimate"/"URL"/… rendered as data), and without a V-07 hydration mismatch (the server + first-client render use a now-independent label so React #418/#423 cannot fire). These three defect classes are caught by a fixture-based rendering guard, not left to a browser-floor manual audit — the L-1/L-4/L-6 overflow, F-1 placeholder, and V-07 hydration fixes are its red-then-green proof.',
    anchor: 'Handling New OBS Surfaced During Execution',
    enforcedBy: [
      'selftest:fsi-app/.discipline/rendering/assertions.test.mjs',
      'selftest:fsi-app/.discipline/rendering/run-rendering-guard.mjs',
    ],
    residual: 'The portable selftest (in the no-npm `node --test` discipline glob) proves the THREE detectors red-then-green over the REAL app modules: the overflow detector (fitting-vs-overflowing measurement), the F-1 placeholder detector reusing isPlaceholderText + HEADER_LITERALS over the pre-fix vs current stripSourcesSection output, and the V-07 hydration detector reusing the real stableDateLabel (now-independent, green) vs relativeTimeLabel (now-dependent, red). run-rendering-guard.mjs renders the extreme-data fixtures at every app breakpoint tier (380/420/480/560/640/767/768/900/960/1100/1200/1440) in Playwright chromium and measures REAL layout (scrollWidth/clientWidth — impossible in jsdom), feeding the SAME detectors; it runs in the dedicated CI "Rendering guard" job, which is NON-BLOCKING (continue-on-error, the SOFT/data-audit-lane pattern) and does NOT enter the required-check set until 3 consecutive green runs on master (operator policy 2026-07-11 — a flaky required check is a merge embargo). The portable selftest above IS a required gate, so the detection logic gates today; only the real-browser leg is non-blocking while it stabilizes. Anchor is a stable SF section marker; the invariant is owned by this guard mechanism. ASSERTION-CLASS RESIDUAL (day-one catch, 2026-07-11): the guard\'s HARD assertions must prefer STRUCTURAL truths (scrollWidth <= clientWidth, no placeholder literal, no hydration error) over ABSOLUTE pixel widths — cross-OS text measurement always carries a small tolerance band (Linux fallback digits render ~11px wider than Windows), so pixel deltas are INFORMATIONAL, not pass/fail. FIDELITY RESIDUAL: the browser fixtures currently reproduce each fix\'s LAYOUT CONTRACT as a facsimile (e.g. the timeline label row as a flex approximation of the real absolute-positioned InteractiveTimeline) and declare Plus Jakarta Sans without bundling it — a guard that tests a facsimile certifies the facsimile. The fix direction (NA-1/NA-2, docs/ops/rendering-guard-followups-2026-07-11.md): BUNDLE the real font into the fixture environment and RENDER THE REAL COMPONENT, not an approximation; a full-page E2E under auth+live-data is the named not-yet-built extension.',
  },

  {
    id: 'SF-11-secrets-registered',
    skill: 'sprint-followups-discipline',
    section: 'Secrets-topology consistency (a referenced credential must be a registered credential)',
    text: 'Every GitHub Actions secret a workflow references (secrets.X in .github/workflows/*) MUST be a REGISTERED secret in the secrets registry (WORKFLOW_SECRETS). An unregistered/invented workflow secret reference — the R0.2 defect where secrets.PROBE_SECRET named a secret that never existed and resolved to empty — is a build failure. This is the inventory-consistency class (SF-1 sibling) applied to the credential surface: referenced == registered.',
    anchor: 'a referenced credential must be a registered credential',
    enforcedBy: ['selftest:fsi-app/.discipline/governance/secrets-reference-audit.test.mjs'],
    residual: 'secrets-reference-audit.mjs is FILESYSTEM-PURE (scans workflow YAML + the registry; no secrets/DB), so it runs in BOTH the required discipline suite (via the red-then-green .test.mjs, auto-globbed governance/*.test.mjs) AND the meta-gate itself (runSecretsReferenceAudit is called in runInvariantCoverage → an unregistered reference literally fails the meta-gate). The registry (secrets-registry.mjs WORKFLOW_SECRETS) is kept EQUAL to the live GitHub store (verified 2026-07-12 via gh secret list). SCOPE (honest): it enforces the GitHub-Actions vault only (the vault this repo\'s workflows read); Vercel-runtime + local-.env credentials are DOCUMENTED in the TOPOLOGY + docs/ops/secrets-topology.md but not diffed (no in-repo manifest to diff Vercel env against — that would need the Vercel API). VALUES never appear anywhere — names + wiring only.',
  },

  {
    id: 'SF-12-doctrine-no-uncited-gate',
    skill: 'sprint-followups-discipline',
    section: 'Inventory consistency (a gate-asserting doctrine clause must be a cited doctrine clause)',
    text: 'no-human-finish-of-intake (RD-20) extends across the whole doctrine surface: a doctrine clause asserting a HUMAN GATE (a human must approve/review/confirm before the machine proceeds) in intake/triage/promotion/demotion/disposition MUST NOT sit UNCITED — it is either rewritten to the machine-gates-are-approval + operator-visibility form, or annotated [RETAINED: reason; register:<id>] for a legitimately-human-gated destructive/irreversible action. The self-inflicted variant is also forbidden: a thread/closer of the form "operator re-confirms a ruling already given" is a self-inflicted gate — a ruled decision does not return to the board as blocked; it executes, and if conditions changed the executor names the changed condition, never silently re-parks. This is the inventory-consistency class (referenced == cited) applied to the human-gate contradiction.',
    anchor: 'Inventory consistency',
    enforcedBy: ['selftest:fsi-app/.discipline/governance/doctrine-contradiction.test.mjs'],
    residual: 'doctrine-contradiction.mjs is FILESYSTEM-PURE (scans the committed doctrine surface: root + fsi-app CLAUDE.md, the 6 skills, the doctrine-register), so it runs in BOTH the discipline suite (red-then-green doctrine-contradiction.test.mjs, auto-globbed governance/*.test.mjs) AND the meta-gate itself (scanDoctrineContradictions is called in runInvariantCoverage → an uncited human-gate clause literally fails the meta-gate). LOW-FALSE-POSITIVE BY CONSTRUCTION (the RLS-parity discipline, operator sharpening 2026-07-12): the patterns distinguish GATE VERBS (requires review / approval / pending human / awaits operator) from VISIBILITY VERBS (surfaces to / visible in / shown on the trail / single-pane operator review), so a DP-1 single-pane-review line and a "surface to the queue" line are never flagged — visibility is preserved by no-human-finish. Negated anti-pattern statements ("no human-approval gate") and register-cited clauses are exempt. NAMED RESIDUAL: the mechanical scan scopes to the committed binding-doctrine files (transient docs/ops session logs are swept by hand to stay low-FP); the self-inflicted-gate board rule is enforced in the pattern list + carried as authoring discipline.',
  },
];

export const meta = {
  name: 'all-surfaces-deepdive-build',
  description: 'Make the deep dive the default generator for EVERY surface — per-format section extractor, required slots, grounding model, and section-aware display, each built FROM its skill — then prove one exemplar per surface end-to-end through /api/agent/run.',
  phases: [
    { title: 'Build', detail: 'one worktree agent per surface: extractor + slots migration + grounding wiring + section-aware display + one exemplar' },
    { title: 'Verify', detail: 'adversarial check per surface: the exemplar actually has rows in intelligence_item_sections, grounded claims, and the display renders sections — not raw markdown' },
  ],
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// PRECONDITION — Phase 0 (the SHARED dispatch seam) is built INLINE by the orchestrator and committed
// BEFORE this workflow runs. Phase 0 establishes the FormatSpec interface + the extractor/grounding
// registry + refactors sectionBrief/groundBrief in src/lib/agent/canonical-pipeline.ts to dispatch
// through it, and lands STUB per-format modules. Each agent below branches from that commit (worktree)
// and replaces ONLY its own format's files — disjoint file sets => conflict-free merges. The agents do
// NOT edit canonical-pipeline.ts or the registry (Phase 0 owns those).
//
// FormatSpec interface (Phase 0):
//   export const spec: FormatSpec = {
//     itemTypes: string[],                       // which item_type values this format owns
//     formatType: string,                        // format_type value (e.g. 'market_signal_brief')
//     sections: { key, order, heading, conditional }[],   // the format's section list, headings match the skill
//     grounding: 'span' | 'corroboration' | 'matrix',     // declared grounding model (transitive is per-section, automatic)
//     extract(fullBrief: string): SectionRow[],  // clone of extract-research-sections.ts heading-walk
//   }
//
// REUSE LAW (Rule 3 — one way to do each thing; do NOT stand up parallel engines):
//  • corroboration-count  -> ADAPTER over src/lib/sources/source-growth.ts aggregateConvergence /
//    growSourcesFromBrief (independent_citers, confirmation_count, trust_score_citation, syndication
//    dedup). It is ALREADY built this session. Market reads those convergence fields; it does not count.
//  • matrix               -> a COVERAGE QUERY over existing regional_data rows (group by dimension ×
//    jurisdiction; gate S3/S4 on >=2 sourced regions per dimension). No new store.
//  • transitive           -> ALREADY emergent from the claim-ledger + criterion-4 labeling discipline
//    (the JOLT lesson). Synthesis sections ground LAST; add only a "introduces no new unsourced fact"
//    guard. No engine.
// Each agent EXEMPLAR-TESTS its grounding model against existing data/machinery BEFORE writing any new
// code, and reports if a thin adapter already suffices.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const INTERFACE = `Build FROM the skill, never from memory. Implement the Phase-0 FormatSpec interface for your format.
- Section extractor: clone src/lib/agent/extract-research-sections.ts (the proven heading-walk via extractSectionByHeading). Map your format's section headings EXACTLY as the system prompt / skill emits them. Omit absent sections (integrity rule), never invent rows.
- Required slots: add a migration seeding item_type_required_slots for your item_types (analog of supabase/migrations/113 + 126). Slots = the load-bearing facts criterion 5 checks. Pick 3-4 slot_keys whose tokens will naturally appear in a grounded claim for your format (study the research slots; avoid abstract keys that never appear in claim_text — that is what quarantined the MIT item with 0 FACT claims).
- Grounding model: obey the REUSE LAW. corroboration -> thin adapter over source-growth.ts; matrix -> coverage query over regional_data; span -> already works; transitive -> add the no-new-unsourced-fact guard only. Exemplar-test FIRST; report if existing machinery already suffices.
- Section-aware display: render rows from intelligence_item_sections (analog of RegulationDetailSurface's <RegulationSections>). Do NOT leave the surface rendering raw full_brief markdown.
- Exemplar: pick ONE real in-scope item of your item_type, run it through the canonical pipeline (generate -> section -> ground -> grow) via scripts/canonical-pipeline-proof.mjs or a thin runner, and confirm: brief generated, sections extracted into intelligence_item_sections, grounded (provenance verified OR an HONEST quarantine with a named reason), display renders the sections. Browserless units are limited — ONE exemplar only.
- npm run build must pass in your worktree before you return.
Reconcile against the SKILL, not the mockups. Report spec edits your exemplar surfaced (the spec EXPECTS Research S3/S5 edits).`

const SURFACES = [
  {
    key: 'regulations',
    skill: '.claude/skills/environmental-policy-and-innovation/SKILL.md — "Regulatory Fact Document (14 sections, conditional)" + the shared rules',
    itemTypes: 'regulation, directive, standard, guidance, framework',
    work: `Adapt the EXISTING extract-regulation-sections.ts to the FormatSpec interface and ensure all 14 sections (8 always-present + 6 conditional) extract. It is currently NOT wired into canonical-pipeline.ts sectionBrief (returns "not wired") — Phase 0 wires the dispatch; you supply the real extractor. RegulationDetailSurface is already section-aware — verify it renders all 14 sections (some conditional). Grounding: span + transitive (S4 compliance-chain, S13 adjacent research are synthesis). Slots already seeded (effective_date, primary_deadline, jurisdictional_scope, penalty_summary). FINISH Regulations to the full 14 sections — this surface must be complete, nothing deferred.`,
  },
  {
    key: 'research',
    skill: '.claude/skills/analysis-construction-spec/SKILL.md §7 Research Summary (6 sections) + the reg skill for shared rules',
    itemTypes: 'research_finding',
    work: `Extractor exists + wired; slots seeded. THE GAP is the DISPLAY: ResearchFindingDetailSurface (src/components/research/ResearchFindingDetailSurface.tsx) renders RAW full_brief markdown — make it section-aware off intelligence_item_sections (analog of RegulationSections). Grounding: span + transitive (S2/S3/S5 are synthesis). FIX the real defect found this session: item 88c3a053 (MIT Climate Machine) generated a 24,881ch brief but grounded 0 FACT claims -> quarantined on missing decision_relevance slot. Diagnose why the ledger extracted 0 FACTs (span-match failure? all prose labeled analysis?) and fix so a rich research brief reliably grounds its slots.`,
  },
  {
    key: 'market',
    skill: '.claude/skills/analysis-construction-spec/SKILL.md §6 Market Signal Brief (8 sections)',
    itemTypes: 'market_signal, initiative',
    work: `BUILD: extract-market-sections.ts (8 sections), slots migration for market_signal+initiative, and the CORROBORATION-COUNT grounding as a THIN ADAPTER over source-growth.ts aggregateConvergence (S1 strength = independent_citers / confirmation_count from the convergence the grow step already computes; syndication-collapsed). Do NOT build a counting engine. No-Vacuum: S3 conversion trigger frequently IS a specific regulation — emit + render the link. DISPLAY: MarketSignalDetailSurface (src/components/pages/MarketSignalDetailSurface.tsx) renders raw markdown -> make section-aware.`,
  },
  {
    key: 'technology',
    skill: '.claude/skills/analysis-construction-spec/SKILL.md §8 Technology Profile (8 sections)',
    itemTypes: 'technology, innovation, tool',
    work: `BUILD: extract-technology-sections.ts (8 sections), slots migration for technology+innovation+tool, grounding span + transitive (S2/S4/S6/S7 synthesis). DISPLAY: NO detail surface exists — build TechnologyDetailSurface (analog of RegulationDetailSurface, section-aware off intelligence_item_sections) and route technology/innovation/tool item_types to it. Note: 3 institutional-body rows are typed 'tool' (known data debt) — they still receive this format; do not special-case.`,
  },
  {
    key: 'operations',
    skill: '.claude/skills/analysis-construction-spec/SKILL.md §5 Operations Profile (8 sections, gated data-sourcing program)',
    itemTypes: 'regional_data',
    work: `BUILD: extract-operations-sections.ts (8 sections), slots migration for regional_data, and MATRIX grounding as a COVERAGE QUERY over existing regional_data (dimension = topic_tag/cost-line; group by dimension × jurisdiction; S1/S2 are single-region span facts that populate incrementally; S3/S4 comparison sections GATE on >=2 sourced regions per dimension and stay omit-with-note until then). Exemplar-test the coverage gate against the 26 non-archived regional_data items before building. DISPLAY: NO surface exists — build OperationsDetailSurface (section-aware) and route regional_data to it. Build the wiring/infrastructure to completion; the coverage gate lights comparison sections up as data fills, it does not defer the build.`,
  },
]

const BUILD_REPORT = {
  type: 'object',
  required: ['surface', 'filesAdded', 'filesModified', 'groundingModelReused', 'exemplarItemId', 'sectionsExtracted', 'grounded', 'displaySectionAware', 'buildPasses'],
  properties: {
    surface: { type: 'string' },
    filesAdded: { type: 'array', items: { type: 'string' } },
    filesModified: { type: 'array', items: { type: 'string' } },
    slotsMigration: { type: 'string', description: 'migration filename seeding required slots, or "n/a (already seeded)"' },
    groundingModelReused: { type: 'string', description: 'what existing machinery was reused (source-growth adapter / regional_data coverage query / claim-ledger transitive) and whether ANY net-new code was needed' },
    exemplarItemId: { type: 'string' },
    exemplarTitle: { type: 'string' },
    sectionsExtracted: { type: 'number', description: 'rows written to intelligence_item_sections for the exemplar' },
    grounded: { type: 'string', enum: ['verified', 'honest_quarantine', 'failed'], description: 'honest_quarantine is acceptable with a named reason' },
    groundedReason: { type: 'string' },
    displaySectionAware: { type: 'boolean', description: 'does the detail surface now render from intelligence_item_sections rather than raw full_brief' },
    buildPasses: { type: 'boolean' },
    worktreePath: { type: 'string' },
    specEditsDiscovered: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const VERIFY_REPORT = {
  type: 'object',
  required: ['surface', 'exemplarConfirmed', 'problems'],
  properties: {
    surface: { type: 'string' },
    sectionsInDb: { type: 'number' },
    groundedClaimsInDb: { type: 'number' },
    displayReadsSectionsTable: { type: 'boolean' },
    rawMarkdownFallbackRemoved: { type: 'boolean' },
    exemplarConfirmed: { type: 'boolean', description: 'true only if sections rows exist AND display reads them AND grounding is verified-or-honestly-quarantined' },
    problems: { type: 'array', items: { type: 'string' } },
  },
}

function buildPrompt(s) {
  return `You are building the deep-dive deliverables for the ${s.key.toUpperCase()} surface of Caro's Ledge (repo cwd = fsi-app). You are in an ISOLATED git worktree branched from the Phase-0 scaffold commit; touch ONLY this surface's files.

STEP 1 — load the skill, never work from memory. Read: fsi-app/${s.skill}. Also skim the Phase-0 FormatSpec interface in src/lib/agent/extract-registry.ts and the proven template src/lib/agent/extract-research-sections.ts.

ITEM TYPES this surface owns: ${s.itemTypes}.

WORK: ${s.work}

CONTRACT:
${INTERFACE}

Return the structured BUILD_REPORT. Honesty rule: an HONEST quarantine with a named reason beats a faked verified. Report exactly what you reused vs built net-new (Rule 3).`
}

function verifyPrompt(s, report) {
  return `Adversarially verify the ${s.key.toUpperCase()} surface build. Default to skeptical: assume the build is incomplete until the ARTIFACT proves otherwise (Rule 4 — the build report is a plumbing flag, the DB rows + the rendered display are the artifact).

The build agent reported exemplar item id = ${report?.exemplarItemId || 'UNKNOWN'}, sectionsExtracted = ${report?.sectionsExtracted}, grounded = ${report?.grounded}, displaySectionAware = ${report?.displaySectionAware}, worktree = ${report?.worktreePath || 'unknown'}.

Check, by LOOKING (query Supabase via a node script like scripts/_diag/artifact-check.mjs using .env.local service role; read the display component source in the worktree):
1. Does intelligence_item_sections actually have rows for the exemplar item? How many?
2. Does section_claim_provenance have grounded claims (FACT/ANALYSIS/GAP) for it, or is provenance an HONEST quarantine with a stated reason?
3. Does the ${s.key} detail component now READ from intelligence_item_sections, or does it still fall back to raw full_brief markdown? Quote the lines.
4. Does the slots migration exist and seed real slot_keys whose tokens can appear in claim_text?
Set exemplarConfirmed=true ONLY if sections rows exist AND the display reads them AND grounding is verified-or-honestly-quarantined. List every problem found.`
}

phase('Build')
log(`Building deep-dive defaults for ${SURFACES.length} surfaces (worktree-isolated). Each: extractor + slots + grounding (reuse-first) + section-aware display + 1 exemplar.`)

// pipeline: each surface builds, then its exemplar is adversarially verified the moment its build
// returns — no barrier, so 'market' can verify while 'operations' is still building.
const results = await pipeline(
  SURFACES,
  (s) => agent(buildPrompt(s), { label: `build:${s.key}`, phase: 'Build', model: 'sonnet', isolation: 'worktree', schema: BUILD_REPORT }),
  (report, s) => report
    ? agent(verifyPrompt(s, report), { label: `verify:${s.key}`, phase: 'Verify', model: 'sonnet', schema: VERIFY_REPORT }).then((v) => ({ surface: s.key, report, verify: v }))
    : { surface: s.key, report: null, verify: null },
)

const confirmed = results.filter((r) => r && r.verify && r.verify.exemplarConfirmed)
log(`Build complete. ${confirmed.length}/${SURFACES.length} surfaces exemplar-confirmed. Orchestrator merges worktrees + runs Phase-3 generation (gated, separately quoted).`)
return results

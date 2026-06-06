export const meta = {
  name: 'all-surfaces-deepdive-build',
  description: 'Make the deep dive the default generator for EVERY surface — author per-format section extractor refinement, required-slots migration, grounding-model adapter (reuse-first), and section-aware display, each FROM its skill, in worktree isolation. The orchestrator then integrates + runs one metered exemplar per surface.',
  phases: [
    { title: 'Author', detail: 'one worktree agent per surface authors extractor + slots migration + grounding adapter + section-aware display, from its skill' },
    { title: 'Review', detail: 'adversarial skill-conformance + reuse-law code review of each surface, read-only' },
  ],
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// EXECUTION MODEL. Phase 0 (the FormatSpec interface + extract-registry + sectionBrief dispatch +
// per-format spec modules) is ALREADY COMMITTED (de68ba7). Each agent below runs in an ISOLATED git
// worktree branched from that commit and ONLY AUTHORS FILES (Read skills + existing components, Write
// new ones). Agents do NOT run code: a fresh worktree has no .env.local and no node_modules, so
// generation/build can't run there — and that is fine, because the orchestrator owns integration:
// merge the branches (disjoint file sets + pre-assigned migration numbers => clean), then run ONE
// metered exemplar per surface through the canonical pipeline (controls the limited Browserless units)
// and npm build, in the main tree which has env + deps.
//
// REUSE LAW (Rule 3 — one way to do each thing; NO parallel engines):
//  • corroboration-count -> thin ADAPTER over src/lib/sources/source-growth.ts (aggregateConvergence /
//    growSourcesFromBrief: independent_citers, confirmation_count, syndication-collapsed). Built this
//    session. Market reads it; it does not re-count.
//  • matrix -> a COVERAGE QUERY over existing regional_data rows (dimension x jurisdiction; gate S3/S4
//    on >=2 sourced regions). No new store.
//  • transitive -> already emergent from the claim-ledger + criterion-4 labeling (the JOLT lesson). A
//    "synthesis section introduces no new unsourced fact" guard only.
// Each agent must EXEMPLAR-TEST (by reading existing code + data shapes) whether existing machinery
// already suffices BEFORE proposing any net-new code, and SAY SO in its report.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const CONTRACT = `You AUTHOR code only — do NOT run npm/node/generation (your worktree has no .env.local or node_modules; the orchestrator runs validation after merge). Build FROM the skill, never from memory.

Deliverables for your surface, touching ONLY your format's files (disjoint by design — do not edit canonical-pipeline.ts, extract-registry.ts, or another surface's files):
1. Section extractor / spec: refine src/lib/agent/formats/<surface>.ts — verify the section headings EXACTLY match what the skill + src/lib/agent/system-prompt.ts emit for this format. The heading-walk (makeProseExtractor) is already wired; your job is heading accuracy + conditional flags.
2. Required-slots migration: create supabase/migrations/<YOUR PRE-ASSIGNED NUMBER>_<surface>_required_slots.sql seeding item_type_required_slots for your item_types (analog of migrations 113 + 126). Pick 3-4 slot_keys whose tokens will NATURALLY appear in a grounded claim_text for this format — study the research slots and the MIT 0-FACT failure (abstract slot keys that never appear in claim_text quarantine good briefs). Idempotent INSERT (ON CONFLICT DO NOTHING).
3. Grounding adapter: obey the REUSE LAW. Read source-growth.ts (Market), the regional_data shape (Operations), and the claim-ledger in canonical-pipeline.ts groundBrief (transitive) FIRST. Author the THIN adapter only; if existing machinery already suffices, author nothing net-new and explain why in your report. If a groundBrief hook is genuinely needed, write the adapter as a function in YOUR module and document the one-line call the orchestrator will add to groundBrief (do not edit groundBrief yourself — that's a shared file).
4. Section-aware display: render rows from intelligence_item_sections (analog of RegulationDetailSurface's <RegulationSections>). Build/replace ONLY your surface's detail component; do not leave it rendering raw full_brief markdown. New surfaces (Technology, Operations) also need a /<surface>/[slug] route page + (Technology) a get_technology_items RPC migration — use your pre-assigned migration number range.
5. Reconcile against the SKILL, not the mockups; for Regulations also read the actual design mockup/protocol before deciding display curation (the 7-section display is a prior mockup-lock — flag if it now wants more). Report every spec edit and open question.

Return the structured AUTHOR_REPORT.`

const SURFACES = [
  {
    key: 'regulations', mig: '127',
    skill: '.claude/skills/environmental-policy-and-innovation/SKILL.md — Regulatory Fact Document (14 sections) + shared rules',
    itemTypes: 'regulation, directive, standard, guidance, framework',
    work: `Phase 0 already emits all 14 section rows. Your job: (a) verify the 14 headings in formats/regulation.ts match system-prompt.ts emission; (b) decide whether RegulationDetailSurface should render more than the mockup-locked 7 sections — READ the design mockup/protocol + the existing extract-regulation-sections.ts structured parsers before deciding, and FLAG if the lock now wants the full 14 (do not silently override the lock). Slots already seeded — no migration needed unless headings reveal a gap. Grounding span + transitive (S4, S13 synthesis).`,
  },
  {
    key: 'research', mig: '128',
    skill: '.claude/skills/analysis-construction-spec/SKILL.md §7 Research Summary (6 sections)',
    itemTypes: 'research_finding',
    work: `Extractor + slots already wired/seeded. THE GAP is DISPLAY: src/components/research/ResearchFindingDetailSurface.tsx renders RAW full_brief markdown — make it section-aware off intelligence_item_sections (analog of RegulationSections). ALSO fix the real defect: item 88c3a053 (MIT Climate Machine) generated 24,881ch but grounded 0 FACT claims -> quarantined on missing decision_relevance slot. Read groundBrief's ledger prompt + the slot-coverage logic and diagnose why a rich brief grounds 0 FACTs (span-match failure? everything labeled analysis?); author the fix (likely in the ledger system prompt / slot-token guidance) so rich research briefs reliably ground their 4 slots. Document the one-line change if it touches groundBrief.`,
  },
  {
    key: 'market', mig: '129',
    skill: '.claude/skills/analysis-construction-spec/SKILL.md §6 Market Signal Brief (8 sections)',
    itemTypes: 'market_signal, initiative',
    work: `Verify formats/market.ts headings vs system-prompt.ts. Slots migration (market_signal+initiative). CORROBORATION grounding = THIN ADAPTER over source-growth.ts aggregateConvergence (S1 strength = independent_citers/confirmation_count, syndication-collapsed) — read source-growth.ts FIRST and confirm growSourcesFromBrief already computes it; author only the read-side adapter that surfaces convergence on the brief. No-Vacuum: S3 conversion trigger frequently IS a regulation — render the link. DISPLAY: src/components/pages/MarketSignalDetailSurface.tsx renders raw markdown -> section-aware.`,
  },
  {
    key: 'technology', mig: '130',
    skill: '.claude/skills/analysis-construction-spec/SKILL.md §8 Technology Profile (8 sections)',
    itemTypes: 'technology, innovation, tool',
    work: `Verify formats/technology.ts headings vs system-prompt.ts. Slots migration (technology+innovation+tool). Grounding span + transitive. DISPLAY: NO detail surface exists — author TechnologyDetailSurface (section-aware off intelligence_item_sections, analog of RegulationDetailSurface) + a /technology/[slug] route page + a get_technology_items RPC migration (analog of migration 125's get_research_items, item_type IN technology/innovation/tool, provenance_status='verified'). The 3 institutional-body 'tool' rows still take this format — no special-case.`,
  },
  {
    key: 'operations', mig: '131',
    skill: '.claude/skills/analysis-construction-spec/SKILL.md §5 Operations Profile (8 sections, gated data program)',
    itemTypes: 'regional_data',
    work: `Verify formats/operations.ts headings vs system-prompt.ts. Slots migration (regional_data). MATRIX grounding = COVERAGE QUERY over existing regional_data (dimension = cost-line/topic_tag; group by dimension x jurisdiction; S1/S2 single-region span facts populate incrementally; S3/S4 GATE on >=2 sourced regions per dimension, omit-with-note until then). Read the regional_data row shape (jurisdictions, topic_tags, region_tags, key_data) and author the coverage-gate helper that decides which comparison sections are eligible — exemplar-test it against the 26 non-archived regional_data rows in your reasoning. DISPLAY: NO surface exists — author OperationsDetailSurface (section-aware, render the per-jurisdiction matrix + coverage state) + a /operations/[slug] route page (get_operations_items RPC already exists in migration 125).`,
  },
]

const AUTHOR_REPORT = {
  type: 'object',
  required: ['surface', 'filesAuthored', 'groundingReuse', 'displaySectionAware', 'specEdits', 'openQuestions'],
  properties: {
    surface: { type: 'string' },
    filesAuthored: { type: 'array', items: { type: 'string' }, description: 'every file created or edited, full path' },
    slotsMigration: { type: 'string', description: 'migration filename, or "n/a (already seeded)"' },
    slotKeys: { type: 'array', items: { type: 'string' }, description: 'the slot_keys chosen and WHY their tokens will appear in claim_text' },
    groundingReuse: { type: 'string', description: 'what existing machinery was reused; whether ANY net-new code was authored and why (Rule 3)' },
    groundBriefHookNeeded: { type: 'string', description: 'the one-line call the orchestrator must add to groundBrief, or "none"' },
    displaySectionAware: { type: 'boolean', description: 'does the detail surface now read intelligence_item_sections rather than raw full_brief' },
    newRoutesOrRpcs: { type: 'array', items: { type: 'string' } },
    headingsMatchSkill: { type: 'boolean', description: 'verified section headings == system-prompt.ts emission' },
    specEdits: { type: 'array', items: { type: 'string' }, description: 'edits the skill/spec needs (e.g. Research S3/S5), or design-lock flags (Regulations 7-vs-14)' },
    openQuestions: { type: 'array', items: { type: 'string' } },
    worktreePath: { type: 'string' },
  },
}

const REVIEW_REPORT = {
  type: 'object',
  required: ['surface', 'conformant', 'problems'],
  properties: {
    surface: { type: 'string' },
    headingsMatchSkill: { type: 'boolean' },
    reuseLawRespected: { type: 'boolean', description: 'no parallel grounding engine where existing machinery suffices' },
    displayReadsSectionsTable: { type: 'boolean' },
    slotKeysGroundable: { type: 'boolean', description: 'will the slot_key tokens actually appear in claim_text (the MIT 0-FACT trap)?' },
    conformant: { type: 'boolean' },
    problems: { type: 'array', items: { type: 'string' } },
  },
}

function authorPrompt(s) {
  return `You author the deep-dive deliverables for the ${s.key.toUpperCase()} surface of Caro's Ledge (work inside the fsi-app/ subtree of your worktree). YOUR PRE-ASSIGNED MIGRATION NUMBER(S) start at ${s.mig} (use ${s.mig}, ${s.mig}b, etc. — never another number, to avoid merge collisions).

STEP 1 — load the skill, never work from memory. Read: fsi-app/${s.skill}. Skim the Phase-0 interface src/lib/agent/format-spec.ts + your module src/lib/agent/formats/${s.key === 'regulations' ? 'regulation' : s.key === 'operations' ? 'operations' : s.key}.ts + the proven section-aware display src/components/regulations/RegulationDetailSurface.tsx.

ITEM TYPES: ${s.itemTypes}.

WORK: ${s.work}

CONTRACT:
${CONTRACT}`
}

function reviewPrompt(s, rep) {
  return `Adversarially review the ${s.key.toUpperCase()} surface authoring (read-only; the agent could not run code, so YOU verify by reading). Default skeptical.

Reported: filesAuthored=${JSON.stringify(rep?.filesAuthored || [])}, slotKeys=${JSON.stringify(rep?.slotKeys || [])}, groundingReuse="${rep?.groundingReuse || ''}", displaySectionAware=${rep?.displaySectionAware}, worktree=${rep?.worktreePath || '?'}.

Read the authored files in the worktree + the relevant skill section and check:
1. Do the section headings in the format module EXACTLY match the skill + src/lib/agent/system-prompt.ts emission? (A mismatch silently drops the section — the MIT/heading trap.)
2. REUSE LAW: did they author a parallel grounding engine where source-growth.ts / regional_data coverage / the claim-ledger already suffices? Flag any net-new engine that duplicates existing machinery.
3. Does the detail component READ from intelligence_item_sections (quote the lines), or still fall back to raw full_brief?
4. Will the chosen slot_key tokens actually appear in a grounded claim_text (the MIT decision_relevance 0-FACT trap), or are they abstract keys that will quarantine good briefs?
Set conformant=true only if all four hold. List every problem.`
}

phase('Author')
log(`Authoring deep-dive defaults for ${SURFACES.length} surfaces in worktree isolation (author-only; orchestrator integrates + runs metered exemplars).`)

const results = await pipeline(
  SURFACES,
  (s) => agent(authorPrompt(s), { label: `author:${s.key}`, phase: 'Author', model: 'sonnet', isolation: 'worktree', schema: AUTHOR_REPORT }),
  (rep, s) => rep
    ? agent(reviewPrompt(s, rep), { label: `review:${s.key}`, phase: 'Review', model: 'sonnet', schema: REVIEW_REPORT }).then((v) => ({ surface: s.key, mig: s.mig, report: rep, review: v }))
    : { surface: s.key, mig: s.mig, report: null, review: null },
)

const ok = results.filter((r) => r && r.review && r.review.conformant)
log(`Authoring complete. ${ok.length}/${SURFACES.length} surfaces conformant on review. Orchestrator merges worktrees, applies groundBrief hooks, runs one metered exemplar per surface, then Phase-3 generation (gated, separately quoted).`)
return results

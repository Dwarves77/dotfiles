// RD-84: registered by lane PARITY-PARTS (2026-09-24, docs/ops/session-log.md "operator rulings"
// entry, item 2, and the artboard-parity 8-point check). One entry, one file; see
// invariants.d/README.md.

export const invariant = {
  id: 'RD-84',
  skill: 'remediation-discipline',
  section:
    'Section 4 - category 52: the four detail surfaces drifted from the approved artboards on ' +
    'eight independent axes, each traced to ONE shared part',
  text:
    'The four detail surfaces (regulations, market, research, operations) must render the ' +
    'shared parts the operator approved against docs/design/handoff-2026-09-07/screens/ ' +
    '(artboards 03/05/07/09), fixed by attacking the CLASS cause in the shared part rather than ' +
    'patching a page: (1) band tints, every item-group/state-note/ACTION-strip that renders ' +
    'carries the item band tint, wired once through DetailPageWrapper -> band-context.tsx, never ' +
    'a fabricated ACTION strip where the item carries no real recommendedActions entry; ' +
    '(2) ONE masthead card, the action row/exposure/timeline (ActionCard) renders inside ' +
    'Masthead\'s own card via its additive actionSlot prop, never a sibling card; (3) ONE stepped ' +
    'meter, ImpactMeter never mounts variant="full" on a live surface (F57), and no legend text ' +
    'describes the retired four-dimension model; (5) no forbidden placeholder literal ("PENDING", ' +
    '"NOT IN PRIMARY SOURCE", "Connect shipment data", "UNSCORED") renders anywhere, whether via ' +
    'Absence or via CSS text-transform on ordinary copy; (7) the Summary|Full depth switch is a ' +
    'real DOM descendant of the section index\'s own bordered tab-strip card, never a sibling ' +
    'positioned beside it; (8) Connections is never a rail card, always a "Related" section in ' +
    'main content. Market, research and operations additionally hold the fixed S-order (01 ' +
    'Summary, 02 Substantive/Series/Findings, 03 Exposure, 04 Timeline, 05 Sources, 06 Related; ' +
    'numbers never renumbered; Exposure/Timeline live in the masthead ActionCard, never their own ' +
    'tab); regulations keeps its own format. [CONFIRMED, lane PARITY-PARTS, 2026-09-24, by a ' +
    'read-only headless-Chromium harness (fsi-app/scripts/tmp/artboard-parity.mjs) against ' +
    'production, then reproduced locally.]',
  anchor:
    '### Section 4 - category 52: the four detail surfaces drifted from the approved artboards on ' +
    'eight independent axes, each traced to ONE shared part',
  enforcedBy: [
    'fitness:F57',
    'selftest:fsi-app/.discipline/rendering/smoke/parity-checks-smoke.mjs',
  ],
  residual:
    'F57 covers only the one sub-rule that is genuinely a static source-code fact (no live ' +
    '<ImpactMeter variant="full"> mount, check 3\'s static half). The other seven axes (checks ' +
    '1, 2, the render half of 3, 5, 7, 8, and the market/research/operations S-order) are rendered ' +
    'facts, colors, DOM containment, tab overflow, section structure, that no static grep can see; ' +
    'they are proven by parity-checks-smoke.mjs, which mounts the real shared parts (ActionCard, ' +
    'Masthead, SectionIndex, ItemGroup/StateNote via band-context, Absence, AtAGlanceCard) inside ' +
    'the Playwright-driven rendering-guard job and measures the actual DOM/computed-style output, ' +
    'the same class of enforcement RD-80\'s own rendering-guard smoke specs use. That job requires ' +
    'playwright, scoped-installed only in the dedicated rendering-guard CI job (same posture as ' +
    'RD-80\'s residual); it self-skips, diagnosably, wherever playwright is not present locally.',
};

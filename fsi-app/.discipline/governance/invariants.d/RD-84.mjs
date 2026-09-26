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
    'production, then reproduced locally.] ' +
    'EXTENDED (operator ruling, 2026-09-25, same invariant): the regulation-detail priority control ' +
    '(HeroPriorityDropdown) mounts as the LAST control in ActionCard/ActionRow\'s own action row ' +
    '(ActionRow\'s new `overflow` prop), never as a sibling row above the masthead; it is a ' +
    'per-user setting and never changes the item\'s BandChip colour. UpcomingObligationsStrip\'s ' +
    '`variant="detail"` mount is retired entirely (F58); each of its obligations merges into the ' +
    'TIMELINE as one marker instead (mergeObligationEvents, timeline-math.ts), which now collapses ' +
    'at 4 (not 8) markers, showing the next 4 plus a real "+N more" link to the item\'s own ' +
    'Obligation Register section (`#obligation-register`, ObligationRegisterFilterBar.tsx\'s own ' +
    'existing anchor) rather than inert text. ' +
    'EXTENDED (lane PARITY-PARTS look-only pass, 2026-09-25, against the new artboards merged in ' +
    '#801): three of the checks above are REVERSED or NARROWED by the new boards, not merely re-' +
    'skinned. (5) is REVERSED: the absence rule no longer renders nothing for a missing value - a ' +
    'value that exists is shown, one that cannot exist yet names the data it needs via a closed ' +
    '"needs ..." phrase map (Absence.tsx NEEDS_PHRASE); "pending", "unscored" and "not scored" ' +
    'still never render as literal words, so the FORBIDDEN literal list is unchanged even though the ' +
    'default (reason) variant now renders text again. (8) is NARROWED: Connections is still never a ' +
    'rail card, but on regulations/research/operations (boards 03/07/09) it is no longer a "Related" ' +
    'section in main content either - it renders INSIDE the one masthead card via Masthead\'s new ' +
    '`connectionsSlot` (same additive pattern as `actionSlot`), and each surface\'s sticky section ' +
    'index drops its former "Related" entry accordingly. Market (board 05) is not named by the new ' +
    'boards for this move (rule 19: the boards\' own per-surface list is not generalised past what it ' +
    'states) and keeps Connections as a main-content "Related" section, unchanged. A NEW class rule: ' +
    'ItemGroup\'s band-tag PILL (dot + label) now renders only for an EXPLICITLY passed `band` prop, ' +
    'never for the page\'s own ambient BandProvider band, because the masthead\'s ActionCard already ' +
    'shows that band once (operator note: "band tag on every fact card should appear once, in the ' +
    'masthead, not per-card") - the header\'s TINT still reads the ambient band unchanged.',
  anchor:
    '### Section 4 - category 52: the four detail surfaces drifted from the approved artboards on ' +
    'eight independent axes, each traced to ONE shared part',
  enforcedBy: [
    'fitness:F57',
    'fitness:F58',
    'selftest:fsi-app/.discipline/rendering/run-rendering-guard.mjs',
  ],
  residual:
    'F57 covers only the one sub-rule that is genuinely a static source-code fact (no live ' +
    '<ImpactMeter variant="full"> mount, check 3\'s static half). The other seven axes (checks ' +
    '1, 2, the render half of 3, 5, 7, 8, and the market/research/operations S-order) are rendered ' +
    'facts, colors, DOM containment, tab overflow, section structure, that no static grep can see; ' +
    'they are proven by parity-checks-smoke.mjs (registered in ux-smoke-specs.mjs, mounting the real ' +
    'shared parts, ActionCard, Masthead, SectionIndex, ItemGroup/StateNote via band-context, Absence, ' +
    'AtAGlanceCard, and measuring the actual DOM/computed-style output), the same class of ' +
    'enforcement RD-80\'s own rendering-guard smoke specs use. F58 covers the 2026-09-25 ruling\'s ' +
    'other static half (no live <UpcomingObligationsStrip variant="detail"> mount on any of the ' +
    'four detail surfaces, the same class F57 is for ImpactMeter); the ruling\'s rendered half (at ' +
    'most 4 visible TIMELINE markers, a real "+N more" link when collapsed) is parity-checks-smoke.mjs\'s ' +
    'own added measurement, using a local 6-entry timeline override so the collapsed branch is ' +
    'actually reachable (the shared fixture\'s own timeline is 3 entries, under the 4 bound). The ' +
    'priority-control relocation (ActionRow\'s new `overflow` prop) has no dedicated static or ' +
    'rendering check of its own: it is provable only by ABSENCE of the old sibling-row markup, which ' +
    'both F58\'s scope and the smoke spec\'s existing check-2 (no second card outside the masthead) ' +
    'already cover incidentally - a distinct guard was judged not to earn its own F-id for one ' +
    'relocation with no forbidden-pattern shape to grep for. The enforcedBy entry cites the guard ' +
    'ENTRYPOINT (`run-rendering-guard.mjs`), not the smoke module directly, per the execution-wiring ' +
    'resolver\'s own surface list (Surface 6, SF-10\'s precedent): the resolver recognizes only the ' +
    'entrypoint path as execution-wired for a rendering-guard smoke spec, since a per-spec citation ' +
    'has no matching surface and reads as unwired even though the entrypoint runs it every guard ' +
    'invocation. That job requires playwright, scoped-installed only in the dedicated rendering-guard ' +
    'CI job (same posture as RD-80\'s residual); it self-skips, diagnosably, wherever playwright is ' +
    'not present locally.',
};

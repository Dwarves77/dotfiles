# UX laws: the interface rules every surface lane applies

Status: BINDING from 2026-09-03. Supplied by the operator as build instructions ("these instructions
feel relevant to our build"); recorded here so that every lane, every session, and every review reads
the same text. Referenced by DP-2 in `design-principles.md`, by the lane common contract
(`/root/work/lane-briefs/COMMON-*.md`, "UX contract" section), and by the lane report's compliance
section. Applies to customer surfaces and operator surfaces alike; DP-1 (single-pane operator review)
remains the stricter rule where the two overlap.

Goal: minimise confusion, reduce effort, prevent mistakes, and help the reader complete the intended
task as quickly as possible. Apply across layouts, navigation, onboarding, forms, settings,
dashboards, and interactive flows.

## 1. Reduce choices per screen (Hick's Law)
Decision time grows with the number and complexity of choices. Give each screen one clear purpose.
Remove irrelevant or low-priority options. Break complicated decisions into smaller steps. Recommend an
option when the reader may struggle to choose.

## 2. Make targets large (Fitts's Law)
Large, nearby targets are faster to hit. Buttons and controls must be easy to click or tap.
Interactive elements get sufficient spacing. Never make a tiny icon the only interaction target.
Increase the clickable area around important controls. House floor: interactive targets are at least
44 CSS px on the shorter axis, or at least 24 px with 8 px clear space on every side.

## 3. Follow familiar patterns (Jakob's Law)
Readers expect the product to work like products they already understand. Use established
conventions. Put navigation, search, settings, and account controls where readers expect them. Use
familiar icons and interaction patterns. Do not invent a pattern unless it gives a meaningful
advantage.

## 4. Group related information (Law of Proximity)
Elements positioned near one another read as related. Place related labels, controls, and
information together. Use spacing to communicate relationships; separate unrelated groups with more
space. Do not rely on borders when spacing can establish the hierarchy.

## 5. Break content into chunks (Miller's Law)
Working memory is small. Divide long content into small, meaningful groups. Break complex forms and
tasks into manageable steps. Use headings, sections, and concise labels. Never ask the reader to
remember information between screens.

## 6. Respond within 400 milliseconds (Doherty Threshold)
Acknowledge every action immediately. Show loading, processing, or success states when results are
not instant. Use optimistic updates when they are safe. Never leave the reader wondering whether the
action registered.

## 7. Highlight the primary action (Von Restorff Effect)
One dominant call to action per section, with the strongest visual emphasis. Secondary actions stay
visually quieter. Buttons do not compete.

## 8. Place key actions nearby (Fitts's Law)
Put actions beside the content they affect. Keep form submission near the final input. Frequent
actions within easy reach. No unnecessary cursor or eye travel.

## 9. Put essentials first (Serial Position Effect)
First and last items are remembered. Most important information first; the final action or takeaway
last; lower-priority information in the middle. Order navigation and lists by reader importance.

## 10. End flows memorably (Peak-End Rule)
A clear, satisfying completion state. Confirm what the reader accomplished. Say what happens next.
Never end a flow on an empty or ambiguous screen.

## 11. Show visible progress (Zeigarnik Effect)
Show completed and unfinished steps. Save progress whenever possible. Make interrupted tasks easy to
resume. Use checklists or completion states for multi-step work.

## 12. Simplify complex interfaces (Law of Prägnanz)
Prefer simple structures and recognisable shapes. Remove decoration and visual noise. Obvious visual
hierarchy. Understandable at a glance.

## 13. Use sensible defaults (Hick's Law)
Preselect the safest and most common option. Use existing context to remove input. Never default
into an unexpected commitment. Every default is easy to change.

## 14. Prevent errors proactively (Postel's Law)
Accept common input formats and variations. Explain requirements before submission. Disable
impossible or unavailable actions. Warn before risky or destructive actions.

## 15. Make errors recoverable (Postel's Law)
Preserve the reader's work after an error. Explain what went wrong in plain language. Say exactly
how to fix it. Offer undo, retry, restore, or cancel where appropriate.

## 16. Maintain pattern consistency (Law of Similarity)
Similar components look and behave the same: colours, labels, icons, spacing, interaction states.
Never reuse one visual treatment for different actions. Reuse established components before creating
new ones.

## 17. Connect related elements visually (Law of Uniform Connectedness)
Use containers, lines, backgrounds, or shared states to show relationships. Connect controls to the
content they affect. Keep unrelated elements apart. Connection is deliberate, never decorative.

## 18. Reduce task completion time (Parkinson's Law)
Minimise steps. Remove unnecessary confirmations and screens. Prefill what the reader already gave.
Shortcuts for frequent or repeat actions.

## 19. Reveal complexity gradually (Tesler's Law)
Essential controls first. Advanced options only when relevant. Let the system carry complexity. Never
force the reader to understand internal technical details.

## 20. Make completion feel closer (Goal-Gradient Effect)
Show progress through multi-step flows. Divide long tasks into visible milestones. Emphasise progress
made. Make the remaining work specific and achievable.

## Implementation requirements
When creating or revising an interface: (1) identify the reader's primary goal; (2) design the
shortest clear path to it; (3) make the next action visually obvious; (4) remove anything that
distracts from completion; (5) give immediate feedback after every interaction; (6) prevent errors
before they occur; (7) preserve work when something goes wrong; (8) confirm clearly when the goal is
complete.

When laws conflict, prioritise clarity, accessibility, reader control, and successful task
completion. Do not apply them mechanically; use them to make deliberate decisions for the reader's
context and goal.

## How this is enforced (the mechanisms, not the prose)
- **RD-60 / F35 `row-ux-coverage`** (`fsi-app/.discipline/fitness/functions/F35-row-ux-coverage.mjs`): every
  row component in `ROW_COMPONENTS` must be mounted by a registered UX smoke spec and carry
  `data-guard-title`; red otherwise, in every fitness run and in CI.
- **Rendering guard UX smoke slot** (`fsi-app/.discipline/rendering/run-rendering-guard.mjs`,
  `smoke/ux-harness.mjs`, `ux-assert.mjs`): the real `.tsx` is mounted at 375 × 812 and 1280 × 800 and
  fails on horizontal overflow, on a title wrapping at under 60 % of its card (law 2's neighbour, the
  one-word-per-line class), or on an interactive target below the law-2 floor. Detector core proven
  red-then-green in `ux-assert.test.mjs` (required no-npm suite).
- **Discipline CI, UX compliance gate** (`.github/workflows/discipline.yml`, memory-gate step): a PR that
  touches `fsi-app/src/**/*.tsx|css` fails unless the session-log addendum in the same range carries a
  "UX compliance" block (per screen: goal, path, one primary action, feedback state per async action).
- **Loading**: CLAUDE.md Loading priority item 6, the SessionStart hook, `sprint-followups-discipline`,
  and `docs/dispatches/lane-common-contract.md` §UX contract all point here.

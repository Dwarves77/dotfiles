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
  // 7th governing skill, added 2026-08-10 (U8, skill↔code drift gate closure): the standalone,
  // operator-side copy of the five-surface-test rule. It was cited throughout doctrine-register.mjs
  // (the every-decline-names-the-five-contracts residual: "The five contracts also live verbatim in
  // caros-ledge-platform-intent... and the standalone caros-ledge-surface-contracts skill") and in
  // skill-map.mjs's design-constraints comment ("Every skill is linked to an automatic trigger"), but
  // was ABSENT from this map — meaning this file had ZERO marker-baseline / anchor-drift protection.
  // A silent edit here (e.g. weakening "MUST record a five-surface test" to "should") would have gone
  // undetected by the meta-gate even though the identical content in caros-ledge-platform-intent is
  // drift-guarded via PI-5. See SCS-1 below.
  'caros-ledge-surface-contracts': 'fsi-app/.claude/skills/caros-ledge-surface-contracts/SKILL.md',
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
  // 20→21 (2026-09-01, lane DOC, governing-skill parity): the skill's "Rules for All Output" was stale
  // at 14 rules against the runtime prompt's 16, and its field-emission section still enumerated the
  // original 13 fields under a stale "19-field contract" label instead of the prompt's actual 20. Fixed
  // by copying rules 15-16 and the seven missing field bullets (what_is_it, signal_band, theme,
  // what_it_changes, does_not_resolve, conversion_trigger, cross_references) verbatim from
  // system-prompt.ts. This is a COPY CORRECTION (no new doctrine — the rule text and field contract were
  // already live in the prompt; only the skill's mirror was behind) that happens to add exactly one new
  // MARKER_SOURCE hit: the does_not_resolve field's prompt-verbatim description ends "...for binding
  // answer", and "binding" is a marker token. TRIAGE: NOT a new bare rule needing its own invariant — the
  // does_not_resolve field is already covered by the whole-file 20-field enumeration EP-13 binds. New
  // invariant EP-13-skill-prompt-parity registered instead for the parity guarantee itself (enforcedBy
  // selftest skill-prompt-parity.test.mjs), anchored on the new "is enforced by
  // `src/lib/agent/skill-prompt-parity.test.mjs`" line added to the Rules section. Re-baseline to 21.
  'environmental-policy-and-innovation': 21,
  // 10→11 (2026-07-03): added the "Floor-qualifying source reaches grounding COMPLETE (the truncation
  // moat)" normative line. TRIAGE: new invariant SC-10 (enforcedBy selftest source-blocks.test.mjs).
  // 11→12 (2026-07-03): added the "Floor-first span re-attribution (the attribution half of the moat)"
  // normative line. TRIAGE: new invariant SC-11 (enforcedBy selftests floor-attribution.test.mjs +
  // null-tier-flag.test.mjs). Closes the attribution half the truncation moat (SC-10) left open.
  // 12→13 (2026-07-04): added the "slot-forcing genuine-support (never fabricate a FACT to clear a
  // criterion)" normative line. TRIAGE: new invariant SC-12 (enforcedBy selftest slot-forcing.test.mjs).
  // 13→14 (2026-07-13): added the "standard floor is the authoring body, scoped by institution" normative
  // line. TRIAGE: new invariant SC-14 (enforcedBy selftest source-blocks.test.mjs + migration 202).
  // Stays 14 at 2026-08-11. SC-15 (source-role-at-birth, fitness F22) was added that day, but this
  // baseline counts NORMATIVE MARKERS IN THE SKILL TEXT, not invariants. SC-15 anchors on an existing
  // normative line ("roles and tiers are credibility differentiation within a surface") — the skill
  // stated the rule already; what was missing was a mechanism enforcing it. No marker was added, so
  // bumping this to 15 is exactly the drift this baseline exists to catch (it caught it).
  'source-credibility-model': 14,
  'analysis-construction-spec': 4,
  // 9→10 (2026-07-12): the Research-positioning ruling added the analysis-follows-page-intent contract line
  // "One generic analysis path serving all pages is forbidden" (REGULATIONS §Analysis contract). TRIAGE:
  // NOT a new bare rule needing a fresh invariant — it is the doctrine-register entries
  // `analysis-follows-page-intent` (exempt; enforcement-to-build with the surface build units) and
  // `research-is-horizon-scan` (enforcedBy RD-20). Re-baseline to 10.
  // 10→12 (2026-07-17, SURFACE-CONTRACT SCOPE GATE dispatch): added the "The Five-Surface Scope Test
  // (every decline names the five contracts)" section — 2 marker lines (the PI-5 anchor "Every scope
  // decision that declines or parks a candidate MUST record a five-surface test" + "MUST record a
  // five-surface test (PI-5)" in the same anchor line, plus the "MUST test it… / never skipped" wording).
  // TRIAGE: new invariant PI-5 (enforcedBy selftest surface-contract-gate.golden.mjs; live DB binding
  // PENDING-C per operator ruling 2026-07-17). Re-baseline to 12.
  'caros-ledge-platform-intent': 12,
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
  // 27→32 (2026-07-13, snapshot-first rebuild PR-2): added Section 4 category 18 "Snapshot-first grounding
  // (acquisition is locked by default)" — 5 normative anchor lines (single-entry forbidden / paid-row MUST
  // carry attribution / paid acquire MUST pre-log justification / acquiring run MUST write snapshot / fresh
  // snapshot MUST NOT reach paid path). TRIAGE: new invariants RD-24..RD-29 (F21 fitness + selftests) + the
  // four snapshot-first doctrine-register entries. Re-baseline to 32.
  // 32→34 (2026-07-13): added the two-mechanism spend model — "Operator-sets-cost: the paid path MUST carry
  // an operator-priced line" + "Data-existence-before-acquisition: no fetch without a cited inventory-miss".
  // TRIAGE: new invariants RD-31 + RD-32 (enforcedBy the priced-line/spend-guard/spend-health selftests).
  // 35→38 (2026-07-14): added category 22 (re-grounds-never-destroy) — three normative lines (replace-only-if-
  // not-weaker; retain-prior-and-record-finding; charset-aware-decode). TRIAGE: RD-36 (ledger-dominance golden)
  // + RD-37 (charset-decode golden). The prior-ledger-survives-section bullet is enforced by RD-36.
  // 38→39 (2026-07-16): added categories 27 (primary-text-is-permanent — document baseline) + 28 (doctrine-
  // binds-to-pipeline-not-executor — executor-agnostic enforcement). TRIAGE: RD-46 (primary-text-permanent
  // golden + migration 052) + RD-47 (executor-parity golden). One marker line net (the category-28 "MUST be
  // interchangeable" anchor); the category-27 "never an overwrite" anchor carries no MARKER_SOURCE token.
  // 39→40 (2026-07-18, NCAER confidentiality incident ruling): added the RD-46 addendum "confidentiality-ruled
  // purges are a sanctioned, narrow exception to append-only" — one new MUST line (the evidentiary-minimum-
  // before-purge requirement). TRIAGE: new invariant RD-49-confidentiality-ruled-purge-exception (exempt,
  // process-class — the purge-authorization judgment is operator-ruled per incident, same as RD-8/RG-1; the
  // bound is the incident-record-first + guarded-write-path-only requirement, not a standing mechanical gate).
  // 40→41 (2026-09-01, Wave MH-2): added category 31 "Harness-run integrity" and its one-line anchor
  // ("... MUST NOT drift from the harness_version its recorded runs name without EITHER a newer run or a
  // pending-run marker ..."). TRIAGE: new invariant RD-55-harness-run-integrity (enforcedBy fitness:F28 +
  // its selftest — scripts/lib/run-artifact.mjs's writer/reader enforce the artifact schema fail-closed on
  // write; F28 enforces census/staleness-coupling/proposer-attestation against the committed tree).
  // 41→43 (2026-09-02, Lane DP-ENGINE, system-completion train): added category 32 "Propagation engine
  // gates", two new MUST NOT lines — the derived_values pollution barrier ("Nothing outside src/lib/
  // propagation/ MUST read the raw derived_values table directly...") and statutory purity ("A statutory
  // computation's declared inputs MUST NOT cite a live estimated_values row or a derived_values row whose
  // derivation is modelled/estimated/interpolated..."). TRIAGE: two new invariants,
  // RD-56-derived-values-gate (enforcedBy fitness:F31 + its selftest) and RD-57-statutory-purity
  // (enforcedBy fitness:F32 + its selftest) — migration 285's RLS/F31 enforce the first in code and the DB;
  // migration 286's assert_statutory_purity() trigger (proven live by that migration's own self-check) plus
  // F32's structural-presence check + tested JS mirror enforce the second.
  // 44→45 (2026-09-04, lane PERF-8): added "A `"use client"` component MUST NOT call
  // toLocaleDateString/toLocaleTimeString/Intl.DateTimeFormat without an explicit `timeZone`" to Section 4
  // category 36 (date-format timezone pin), diagnosing React #418 on /regulations. TRIAGE: new invariant
  // RD-61-date-format-timezone-pin (enforcedBy fitness:F36 + its selftest).
  // 45→46 (2026-09-04, lane PERF-ARCH): added "A route tracked in ... PERF_BUDGET_REGISTRY MUST carry,
  // for every metric, a finite `ratchet`, a `target` no worse than the ratchet, a real `measuredAt` date,
  // and an `evidence` string labeled `[CONFIRMED]` or `[HYPOTHESIS]`" to Section 4 category 37 (perf-budget
  // ratchet), closing the gap that every prior PERF lane's measurement lived only in a dated prose audit
  // with nothing re-checking it on the next change. TRIAGE: new invariant RD-62-perf-budget-ratchet
  // (enforcedBy fitness:F37 + its selftest).
  // 46→47 (2026-09-05, lane CAP-1000, "two defects one cause"): added Section 4 category 38 (unbounded
  // Supabase reads — PostgREST's db-max-rows=1000 silently truncates any `.limit(N>1000)` request) and its
  // one-line anchor ("A read that means to enumerate an entire table or result set MUST page via
  // `.range()` ... MUST come from a DB-computed `{ count: 'exact', head: true }` ..."). TRIAGE: new
  // invariant RD-63-unbounded-supabase-read (enforcedBy fitness:F38 + its selftest).
  // 47→48 (2026-09-06, lane INCLAUSE-CLASS, IN-CHUNK id-list class): added Section 4 category 39
  // (unbounded `.in(col, list)` filters — PostgREST URL-encodes the whole list into the GET request, so a
  // runtime-sized list eventually 400s the request itself, distinct from category 38's response-truncation
  // shape) and its one-line anchor ("A `.in(column, list)` call whose `list` is a runtime value ... MUST
  // route through the shared chunking helpers ..."). TRIAGE: new invariant RD-64-unbounded-in-filter
  // (enforcedBy fitness:F39 + its selftest).
  // 48→49 (2026-09-08, lane TAGS-401, train 61): added Section 4 category 40 (a browser call to a
  // requireAuth-guarded route attaches the session token in ONE place) and its one-line anchor ("A
  // browser module calling a requireAuth-guarded `/api/` route MUST go through the one shared
  // authenticated fetcher ..."). TRIAGE: new invariant RD-65-authed-api-fetch (enforcedBy fitness:F40
  // + its selftest). Source: the workspace-tags feature 401'd for every signed-in user in production
  // from the day it landed while every gate stayed green.
  // 49→50 (2026-09-08, lane mobfix61, operator mobile report D-M3): added Section 4 category 41 (a
  // responsive `@media` rule naming a class no element carries is a silent no-op — the map page's
  // 300px rail track survived at every width because the only media query in the file named a class
  // the page does not use, and nothing in the toolchain can see a CSS selector that matches nothing)
  // and its one-line anchor ("Every `cl-*` class targeted inside an `@media` block ... MUST be carried
  // by an element in the same file ..."). TRIAGE: new invariant RD-66-dead-media-query-class
  // (enforcedBy fitness:F41 + its selftest).
  // FOLD-61: this category and its invariant arrived numbered 40 / RD-65 / F40, colliding with
  // lane TAGS-401's above. Renumbered to 41 / RD-66 / F41 at the fold; both are kept, and TAGS-401
  // kept its number because it landed first and was cited in more places. The BASELINE is 50, not
  // 49: each lane wrote 48 -> 49 for its own single new marker, and the fold carries both markers.
  // 50→51 (2026-09-08, lane cardrule): added Section 4 category 42's normative marker, "a visual
  // shell repeated across files MUST become one component that owns every property of the shell,
  // and the class MUST be closed by a gate that fails on a hand-built copy". TRIAGE: new invariant
  // RD-67 (enforcedBy fitness:F42 + its selftest).
  // 51→52 (2026-09-08, lane noexpand; renumbered at FOLD 64): added Section 4 category 43, "a page that opens something
  // before the reader acted", one normative line. TRIAGE: new invariant RD-67-default-open-disclosure
  // (enforcedBy fitness:F43 + its selftest + the rendering guard's no-default-open leg). Not an
  // instance of an existing rule: the two shapes of this defect are invisible to different tools and
  // the second one has no source-level tell at all, which is why it needs both halves.
  // 53→54 (2026-09-17, lane L30): category 45, the duplicated-code ratchet (one MUST line). TRIAGE: new invariant RD-69 (fitness F45).
  // 54→55 (2026-09-17, lane L31): category 45 gains the host-home bullet (one MUST line). TRIAGE: new invariant RD-70 (fitness F46).
  // 55→56 (2026-09-17, lane L32): category 45 gains the database-census bullet (one MUST line). TRIAGE: new invariant RD-71 (fitness F47).
  // 56→57 (2026-09-18, lane M9a): new category 46, the loop-manifest bullet (one MUST line). TRIAGE: new invariant RD-74 (fitness F50).
  // 57→58 (2026-09-18, lane w10a, counted on the tree that also carries M9a's category 46, parts brief docs/design/parts-brief-2026-09-18.md 1.2): added Section
  // 4 category 47, "a page does not retype a part's literal styles" (one MUST line). TRIAGE: new
  // invariant RD-73 (fitness F49). M9a's own RD number was not present on this lane's tree when this
  // landed (lane brief instruction: take the next free one and note it). The next free id on this
  // tree was RD-72, but `git log --all` shows RD-72 already taken on the unmerged branch
  // lane/w9-l41-refetch-capped-env-2026-09-17 (commit a08d1e6e, "Lane L41 ... F48 ... (RD-72)"), a
  // sibling branch with the same RD-68..71 base that independently chose the same next number; RD-73
  // is taken instead to avoid a KNOWN collision rather than a hypothetical one. The coordinator still
  // resolves whichever of the two lands second at merge if this guess is wrong.
  // CATEGORY NUMBER renumbered 46->47 (2026-09-18, coordinator note, after lane M9a's PR 721 also
  // authored a "Section 4 - category 46" section and merges first): master's highest category was 45
  // when both lanes were told to take the next free one; M9a keeps 46, this lane's own category
  // becomes 47 everywhere it is named (SKILL.md heading, this comment, the RD-73 invariant's
  // section/anchor fields below, the session-log entry; F49-parts-not-pages.mjs itself never named
  // the category number, so it needed no change). The
  // invariant id stays RD-73 (only the category NUMBER moved); the skill-contract-map.mjs re-pin
  // reflects the renumbered text, done last so the pinned hash matches the final file.
  'remediation-discipline': 58,
  // 17→18 (2026-07-12, secrets-topology dispatch): added the "Secrets-topology consistency (a referenced
  // credential must be a registered credential)" normative line to the Inventory-consistency section.
  // TRIAGE: new invariant SF-11-secrets-registered (enforcedBy selftest secrets-reference-audit.test.mjs +
  // the meta-gate runs the audit). Mechanizes no-new-secrets-without-need + credential-surface-visibility.
  'sprint-followups-discipline': 18,
  // NEW (2026-08-10, U8 skill↔code drift gate closure): caros-ledge-surface-contracts was the 7th
  // governing skill, absent from SKILL_FILES until now (see the comment there). Live-computed count
  // via the same MARKER_SOURCE regex over the file as committed. TRIAGE: new invariant SCS-1
  // (enforcedBy the SAME golden PI-5 uses — this skill restates PI-5's rule verbatim for the operator's
  // side, so it shares PI-5's enforcement mechanism rather than inventing a parallel one).
  'caros-ledge-surface-contracts': 2,
};

// ───────────────────────── INVARIANTS, derived (plan 6.8, Rule A, lane N5) ─────────────────────────
// The 1,500+-line array literal that used to live here is now one file per invariant under
// invariants.d/ (see invariants.d/README.md). This loader reads that directory, imports every file,
// validates it, and sorts the result by id with a natural number sort (RD-2 before RD-10) so file order
// on disk never matters and two lanes adding an invariant each add one file, never one shared-array
// append (the Cause A class plan 6.8 removes). Top-level await is used deliberately: every existing
// consumer reaches INVARIANTS through a static `import … from './invariants.mjs'`, and Node's ESM
// loader awaits a module's own top-level await before resolving that import, so this stays a plain
// synchronous-looking named export to every caller.

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const INVARIANTS_DIR_URL = new URL('./invariants.d/', import.meta.url);

// Natural sort: split each id into digit-runs and non-digit-runs, compare digit-runs numerically so
// 'RD-2' sorts before 'RD-10' (a plain string compare would put 'RD-10' first).
export function compareInvariantIds(a, b) {
  const toChunks = (s) => s.match(/\d+|\D+/g) ?? [];
  const ac = toChunks(a);
  const bc = toChunks(b);
  const len = Math.max(ac.length, bc.length);
  for (let i = 0; i < len; i++) {
    const x = ac[i] ?? '';
    const y = bc[i] ?? '';
    if (x === y) continue;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
      continue;
    }
    return x < y ? -1 : 1;
  }
  return 0;
}

export async function loadInvariantsFromDir(dirUrl = INVARIANTS_DIR_URL) {
  const dirPath = fileURLToPath(dirUrl);
  const files = readdirSync(dirPath).filter((f) => f.endsWith('.mjs')).sort();
  const byId = new Map();
  for (const file of files) {
    const stem = file.slice(0, -'.mjs'.length);
    const mod = await import(new URL(file, dirUrl).href);
    if (!mod.invariant || typeof mod.invariant !== 'object') {
      throw new Error(`invariants.d/${file} must export \`invariant\` as an object.`);
    }
    const inv = mod.invariant;
    if (inv.id !== stem) {
      throw new Error(`invariants.d/${file}: invariant.id ('${inv.id}') does not match its filename stem ('${stem}').`);
    }
    if (byId.has(inv.id)) {
      throw new Error(`invariants.d: duplicate invariant id '${inv.id}' (${byId.get(inv.id).__file} and ${file}).`);
    }
    if ('enforcedBy' in inv && !Array.isArray(inv.enforcedBy)) {
      throw new Error(`invariants.d/${file}: enforcedBy must be an array when present.`);
    }
    byId.set(inv.id, { inv, __file: file });
  }
  return [...byId.keys()]
    .sort(compareInvariantIds)
    .map((id) => byId.get(id).inv);
}

export const INVARIANTS = await loadInvariantsFromDir();

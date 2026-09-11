# Brief chain build plan (W9 of the 2026-09-04 complete-system build plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every intelligence item, existing and new, carries the full brief-derived data set (brief, sections, claim ledger, timeline, forward events, obligations, entity references, Who pays, requirement trajectory, penalties, key data, why it matters) produced through the one canonical pipeline and connected by the flywheel, with no per-item manual step.

**Architecture:** Nothing new is invented. The canonical pipeline (`canonical-pipeline.ts`: generate, register, section, ground, grow) gains one injection seam for session-authored synthesis, mirroring the injected-ledger seam `groundBrief` already has (RD-47, executor parity). The mint chokepoint (`mint-item.ts`) gains the two writes it lacks (entity references, format_type) so every new item is connected at birth. A committed artifact contract (`record-briefs-NNN.json`, copied from `ledger-verdicts`) lets a Claude Code session lane author briefs from stored source text and a GitHub Actions workflow store them where the secrets are. The corpus catch-up (1,102 stubs, 351 mistyped EU Decisions, 128 NULL `format_type`) runs through those same paths, never a parallel one.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Supabase Postgres, node `--test`, GitHub Actions `workflow_dispatch`, the repo's discipline engine (fitness functions F1 to F43, rendering guard, harness-run artifacts).

**Spec:** `docs/plans/complete-system-build-plan-2026-09-04.md` section 0 (definition of done) and section 1 (the loop); `docs/specs/08-flywheel-design.md`; `docs/ops/runbooks/date-chain-2026-09-11.md`; the operator rulings quoted in section 0 below. This plan is workstream **W9** of the 2026-09-04 plan and is tracked on `docs/PROGRAM-BOARD.md`, the only tracker.

## 0. The ruling this plan executes, and the measured state it starts from

Operator, 2026-09-09, verbatim: "the fix is making sure a full brief, analysis of the data and all information is pulled and then put through the flywheel to make sure we are connecting data points across the site ... briefs need to exist for all items as well." 2026-09-11: "i want all items built and not pushed and merged completed if they fit the build"; "we need to understand what we are writing before we write it and see how it fits into existing code and systems"; "is the system fixed so this gap in data and analysis is now wired for every new addition to the system?"

Answer to the last question, measured 2026-09-11 [CONFIRMED]: **no.** A new item today is minted at `item_grade='record'` (`.github/workflows/population-turn.yml:528`, `run-mint-batch.mjs --grade record`) with a stub `full_brief`; nothing upgrades it to a brief; nothing writes its `entity_refs` or `instrument_entity_id` at mint (only the hand-dispatched `backfill-entities.mjs` does); nothing stamps `format_type` at mint (only `canonical-pipeline.ts:844` does, inside generation); the fields Who pays, requirement trajectory, penalties, `why_matters` and `key_data` are not in the generation contract at all. What IS wired at mint: connection discovery (`mint-item.ts:282-314`), forward-event extraction and `compliance_deadline` sync (`:316-362`), and the population flywheel's eleven steps (`scripts/turns/run-population-flywheel.mjs:45-88`: discovery, corpus export, forward events, analyze, obligations, tags, ratification, outcomes).

Live corpus, 2026-09-11 [CONFIRMED, SQL against `kwrsbpiseruzbfwjpvsp`]:

| Measure | Value |
|---|---|
| Live items | 1,518: 417 `brief`, 1,101 `record` |
| Record items with any of summary / why_matters / key_data / severity / modes / entry_into_force / sources_used | 0 |
| Record items with stored source text (`agent_run_searches.result_content`, exactly one row each) | 1,101 (avg 64,409 chars, min 1,337, max 2,590,651) |
| Record claims | 8,484: 3,284 FACT, 5,200 GAP (61 %) |
| `item_timelines` | 1,229 rows / 152 items (harvest applied today, +21 items; 0 record items) |
| `item_forward_events` | 1,209 rows / 365 items (applied today) |
| `entity_refs` on live record items | 1,101 (applied today, run 34635876636) |
| `intelligence_items.compliance_deadline` | 87 |
| `format_type` NULL on live briefs | 128 |
| Record `initiative` rows that are EU Decisions (CELEX type letter D) | 351 of 369 (343 titled only "EUR-Lex — <CELEX>") |
| `trajectory_points` non-null, corpus-wide | 0 (CHECK in migration 107 allows it only when `signal_band='price'`) |
| `cost_mechanism`, `penalty_range`, `enforcement_body` columns | do not exist (read by the UI, discarded by `apply-staged-update.ts:242-247`) |

Master CI state [CONFIRMED]: the Discipline engine on master commit `5e891abd` fails the rendering guard with 120 layout-guard L9 findings, all `input.cl-facet-check` (filter-rail checkbox, 266x24 at 1440 and 910x24 at 1024) on `/regulations`, `/operations`, `/market`, `/research`, `/watchlist`. The identical tree passed as PR #621 (run 34614334442, attempt 1) and passes again on re-run (attempt 2, rendering guard green). The 622-finding baseline (`layout-guard/baseline.json`, expiry 2026-10-15) covers neither. The cause of the PR-vs-push difference is not yet established; task 0.1 establishes it.

## Global Constraints

Copied from `CLAUDE.md` standing rules and the discipline registry; every task's requirements include this section.

- No LLM and no metered API call in any runtime, classification or population path; session lanes and the browser do model work (rule 16 / 17 of the 2026-09-04 plan section 4; ADR-023).
- No schedules or crons; every runtime by explicit `workflow_dispatch` (rule 16). `scrape_cadence` stays `off`.
- Nothing runs alone (rule 17): a mint or brief write is done only when the flywheel connected it and the harness recorded the outcome.
- A figure with a source is published with that source's rating; the source is found and rated, never the figure refused (rule 18).
- Facts live in Supabase; never hand-edit published rows; data changes go through migrations or guarded scripts (`scripts/lib/db.mjs`) (rule 1, rule 3 two-track: DDL applied before dependent code merges).
- Single write sites hold: `synthesiseAndWriteBrief` is the one brief write (`canonical-pipeline.ts:734`); `mint-item.ts` is the one INSERT (F13); `groundBrief` is the one grounding entry (F21); no second Anthropic path (F15).
- Every finding carries `[CONFIRMED]` / `[HYPOTHESIS]` / `[REFUTED]` (rule 14). A proof executes or it is not a proof (rule 15). A flag is work (rule 13).
- Agent git operations only in the agent's worktree, never the main checkout `C:\Users\jason\dotfiles` (RD-19); never `--no-verify`; stage explicit paths.
- Any `.tsx`/`.css` change reads `docs/design/ux-laws.md` and `docs/design/design-principles.md` first and carries a `### UX compliance` block in its session-log addendum (RD-60; CI memory gate).
- No em dashes, en dashes or the section-sign glyph in new prose. Every plan-level dollar framing is out of scope: build work is free by standing ruling.
- Gates per lane (all, exit codes read): `npx tsc --noEmit`; `node .discipline/fitness/runner.mjs` (0 violations); `bash .discipline/run-test-suite.sh` (0 fail); `node --test` on touched tests; `node .discipline/rendering/run-rendering-guard.mjs` when anything renders; `npm run audit:design`; `npx next build`; `node .discipline/runner.mjs --mode=ci --range=origin/master..HEAD`.
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. PR body ends with the Claude Code attribution line. The coordinator merges on green CI; lanes never merge.
- Migration numbering: next free on master is **316** (`315_workspace_due_next.sql` is the latest); **240** and **241** are free and reserved by task 5.3 for PR #410 / #370.
- Next ADR number: **028**.

## Worktree state left by the halted 2026-09-11 lanes (disposition in task 5.1)

| Worktree | Branch | State | Disposition |
|---|---|---|---|
| `.worktrees/wt-searchkeys-0911` | `lane/searchkeys-2026-09-11` | 6 uncommitted files (CommandBar.tsx, ListRow.tsx, new `commandBarKeyboard.ts` + test, tech-debt-log) | keep; task 4.1 resumes from it after reading every diff |
| `.worktrees/wt-landdocs-0911` | `lane/landdocs-2026-09-11` | 6 uncommitted files (ledger SKILL.md, INDEX, runbook, session-log, two handoffs) | keep; task 4.2 resumes from it |
| `.worktrees/wt-brieffields-0911` | `lane/brieffields-2026-09-11` | clean | remove (task 2 starts fresh) |
| `.worktrees/wt-finishmig-0911` | `lane/finishmig-2026-09-11` | 1 local commit, cherry-pick conflict in progress (session-log, portal-harvest.ts), migration 241 staged | abort the cherry-pick, reset to origin/master; task 5.3 restarts from a clean base |
| `.worktrees/wt-finishcode-0911` | `lane/finishcode-2026-09-11` | 8 untracked `scripts/remediation/*` copied from PR #391 | discard the copies; task 5.4 restarts |
| `.worktrees/wt-eudecision-0911` | `lane/eudecision-2026-09-11` | 2 uncommitted files (export-census-rows.mjs + test) | keep; task 1.3 resumes from it after reading the diff |
| `.worktrees/wt-facetfix-0911` | `lane/facetfix-2026-09-11` | clean | remove; task 0.1 starts fresh |
| `.worktrees/wt-datechain-0911` | `plan/brief-chain-2026-09-11` | this plan | lands via PR with the INDEX line and board row |

---

## Part 0: master green first (nothing merges on a red master)

### Task 0.1: Establish why the layout guard passes on PR runs and fails on master, then fix the checkbox

**Files:**
- Read: `fsi-app/.discipline/rendering/layout-guard/run-layout-guard.mjs`, `generate-manifests.mjs`, `collect.mjs`, `routes.mjs`, `baseline.mjs:65-90`, `manifests.json`, `results.json`; `.github/workflows/discipline.yml` (rendering-guard job).
- Modify: the component that renders `cl-facet-check` (find with `grep -rn "cl-facet-check" fsi-app/src`), plus `fsi-app/.discipline/rendering/smoke/` fixtures if they mount it.
- Test: `fsi-app/.discipline/rendering/layout-guard/layout-guard.test.mjs` (extend), the rendering guard itself.

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a green Discipline engine on master; a written `[CONFIRMED]` mechanism for the PR-vs-push difference in the session-log addendum.

- [ ] **Step 1: Reproduce both verdicts locally on the same tree**

Run from `fsi-app/` on a fresh worktree at `origin/master`:
```bash
npm ci
node .discipline/rendering/layout-guard/run-layout-guard.mjs 2>&1 | tail -20
```
Expected: either 0 findings (matching the PR run) or 120 `cl-facet-check` findings (matching the master run). Record which.

- [ ] **Step 2: Diff the two CI jobs' inputs, not their outputs**

Fetch both job logs and compare everything before the measurement line:
```bash
gh api repos/Dwarves77/dotfiles/actions/jobs/103312372742/logs > /tmp/pr.log     # PR #621 attempt 1, pass
gh api repos/Dwarves77/dotfiles/actions/jobs/103383607922/logs > /tmp/master.log # master 5e891abd, fail
diff <(sed 's/^[^ ]* //' /tmp/pr.log | grep -vE "^\s*$" | head -400) <(sed 's/^[^ ]* //' /tmp/master.log | grep -vE "^\s*$" | head -400)
```
Look specifically for: `manifests.json` / `results.json` regeneration lines, a `git diff`-driven "only changed routes" scope (a PR run that measures only the routes the PR touched would report 0 findings vacuously), fixture data reads, and the checkout ref (`refs/pull/621/merge` vs `master`). Write the finding as `[CONFIRMED]` with the log line that proves it, or `[HYPOTHESIS]` if the logs do not settle it. A scope difference between events is itself a defect (a guard must give one verdict per tree); if that is the cause, make the push and pull_request scopes identical in `discipline.yml` or `run-layout-guard.mjs` in this task.

- [ ] **Step 3: Write the failing layout-guard test for the checkbox hit target**

In `layout-guard.test.mjs`, add a case that renders the facet-rail manifest for `/regulations` at 1440 and asserts no L9 finding names `cl-facet-check`:
```js
test("L9: facet checkboxes meet the hit-target floor at 1440", async () => {
  const findings = await runLayoutGuardFor({ route: "/regulations", width: 1440 });
  const facet = findings.filter((f) => f.rule === "L9" && f.element.includes("cl-facet-check"));
  assert.deepEqual(facet, [], `facet checkbox findings: ${JSON.stringify(facet)}`);
});
```
(`runLayoutGuardFor` is the per-route entry `run-layout-guard.mjs` already exposes for `--only`; if it is not exported, export it from that file in this step.)

- [ ] **Step 4: Run it to confirm it fails with the 266x24 finding**

Run: `node --test fsi-app/.discipline/rendering/layout-guard/layout-guard.test.mjs`
Expected: FAIL naming `input.cl-facet-check[] - 266x24px`.

- [ ] **Step 5: Fix the component**

The checkbox is stretched to the row width with a 24px height. Law 2 (`docs/design/ux-laws.md`) needs 44px, or 24px with 8px clearance, and L9's floor is short side >= 28. Wrap the input in the row `<label>` so the label is the hit target, keep the visual box at its designed size, and give the label `min-height: 44px; display: flex; align-items: center; gap: 8px;` using existing tokens. Keep `id`/`htmlFor` association and keyboard focus on the input. Do not touch `baseline.json` or `BASELINE_EXPIRY_DATE`.

- [ ] **Step 6: Run the test and the full rendering guard**

Run: `node --test fsi-app/.discipline/rendering/layout-guard/layout-guard.test.mjs && node .discipline/rendering/run-rendering-guard.mjs`
Expected: PASS; the `~ input[cl-facet-check] 1150x32px` smoke warnings on `operations-ledger` and `market-rows` are gone too.

- [ ] **Step 7: Gates, session log, commit, PR**

Run all gates in Global Constraints. Append `FACETFIX (2026-09-11)` to `docs/ops/session-log.md` with the step-2 mechanism and a `### UX compliance` block. Commit:
```bash
git add fsi-app/src/components/<facet file>.tsx fsi-app/.discipline/rendering/layout-guard/layout-guard.test.mjs docs/ops/session-log.md
git commit -m "fix(filters): facet checkbox meets the law-2 hit target; layout guard gives one verdict per tree"
```
Open the PR; the coordinator merges on green. Master is green before any other PR in this plan merges.

### Task 0.2: Land the propagation run records (#622, #623) with the proposer pass

**Files:**
- Modify: `fsi-app/scripts/harness-runs/propagation/LAST-PROPOSER-PASS.md` (on each PR branch, or on one branch that carries both artifacts).
- Read: `fsi-app/scripts/harness-runs/PROPOSER-RUNBOOK.md`, `CONVENTION.md`.

**Interfaces:**
- Produces: `propagation-run-007.json` and `-008.json` on master (the entity-backfill dry and apply records), F28 green.

- [ ] **Step 1: Read the two run artifacts and the prior proposer pass**

`cat fsi-app/scripts/harness-runs/propagation/propagation-run-00{7,8}.json fsi-app/scripts/harness-runs/propagation/LAST-PROPOSER-PASS.md` on branch `propagation/34635876636` after `git fetch origin propagation/34635876636 && git checkout -b lane/proprec-2026-09-11 FETCH_HEAD`; also cherry-pick `38a59f24` (run 007) onto it so one PR carries both, then close #622.

- [ ] **Step 2: Write the proposer pass**

Following `PROPOSER-RUNBOOK.md`'s format, add an entry naming `propagation-run-008` (and 007) with what the run did (entity backfill apply: entities +855, identifiers +837, refs +1,693; drain 500 events, 0 recomputed) and the proposal for the next batch: none until W9 tasks 1.1 and 3.x land, because the next entity write happens at mint, not by backfill.

- [ ] **Step 3: Run F28 locally**

Run: `node fsi-app/.discipline/fitness/runner.mjs --only F28`
Expected: PASS.

- [ ] **Step 4: Commit, push, PR; close #622 as superseded**

```bash
git add fsi-app/scripts/harness-runs/propagation/
git commit -m "harness-runs: propagation runs 007 (dry) and 008 (apply) with the proposer pass"
```

---

## Part 1: every new item is connected at birth (the permanent wiring)

### Task 1.1: Entity references at the mint chokepoint

**Files:**
- Modify: `fsi-app/src/lib/intake/mint-item.ts` (after the forward-events block, `:362`), `fsi-app/src/lib/intake/apply-staged-update.ts` (the substantive `update_item` path, `:209-222`, only when `jurisdiction_iso` or `canonical_instrument_key` changed).
- Create: `fsi-app/src/lib/entities/link-item-entities.mjs` (the one reusable writer both callers import).
- Reuse (do not copy logic): `fsi-app/scripts/entities/backfill-entities.mjs` exports `planJurisdictionEntities`, `planJurisdictionRefs`, `planInstrumentEntities`, `planInstrumentFkUpdates` (`:91-157`). Move those four pure planners into `src/lib/entities/entity-plan.mjs` and have `backfill-entities.mjs` import them from there, so the mint-time writer and the backfill share one planner (one writer per dataset: the guarded write stays in the script for corpus runs, the mint calls the same planner and writes through the app client).
- Test: `fsi-app/src/lib/entities/link-item-entities.test.mjs`, `fsi-app/src/lib/intake/mint-item-entities.npmtest.mjs`.

**Interfaces:**
- Produces: `linkItemEntities(sb, { id, jurisdiction_iso, canonical_instrument_key }, opts?) -> Promise<{ refs: number; instrumentEntityId: string | null }>`; idempotent (existing refs/entities are read first, exactly as the planners already do with `existingEntityIds`/`existingRefKeys`).
- Consumed by: task 1.4 (population report gate), task 3.4 (the brief-apply driver relies on it having run at mint).

- [ ] **Step 1: Move the planners and prove `backfill-entities.mjs` still passes its own tests**

Create `src/lib/entities/entity-plan.mjs` with the four functions moved verbatim; replace their bodies in `backfill-entities.mjs` with `export { planJurisdictionEntities, planJurisdictionRefs, planInstrumentEntities, planInstrumentFkUpdates } from "../../src/lib/entities/entity-plan.mjs";`.
Run: `node --test fsi-app/scripts/entities/backfill-entities.test.mjs` (whatever test file exists next to it; `ls fsi-app/scripts/entities/*.test.mjs`).
Expected: PASS unchanged.

- [ ] **Step 2: Write the failing test for the writer**

```js
// src/lib/entities/link-item-entities.test.mjs
import test from "node:test"; import assert from "node:assert/strict";
import { linkItemEntities } from "./link-item-entities.mjs";
import { fakeSupabase } from "../../test-support/fake-supabase.mjs"; // the injected-client fake timeline-harvest-unlock.npmtest.mjs already uses; reuse it

test("mint of a DE regulation with a CELEX key writes 1 jurisdiction ref and links the instrument entity", async () => {
  const sb = fakeSupabase({ entities: [{ entity_id: "cl:jurisdiction:DE", kind: "jurisdiction" }], entity_refs: [], entity_identifiers: [] });
  const r = await linkItemEntities(sb, { id: "11111111-1111-4111-8111-111111111111", jurisdiction_iso: ["DE"], canonical_instrument_key: "32024R1610" });
  assert.equal(r.refs, 1);
  assert.equal(sb.tables.entity_refs.length, 1);
  assert.equal(sb.tables.entity_refs[0].ref_table, "intelligence_items");
  assert.match(r.instrumentEntityId, /^cl:instrument:/);
  assert.equal(sb.updates.intelligence_items[0].instrument_entity_id, r.instrumentEntityId);
});
test("re-running on the same item writes nothing (idempotent)", async () => { /* second call, assert sb.tables.entity_refs.length still 1 */ });
```

- [ ] **Step 3: Run it to verify it fails** (`node --test src/lib/entities/link-item-entities.test.mjs`; expected: module not found).

- [ ] **Step 4: Implement `link-item-entities.mjs`**

```js
import { planJurisdictionEntities, planJurisdictionRefs, planInstrumentEntities, planInstrumentFkUpdates } from "./entity-plan.mjs";
export async function linkItemEntities(sb, item) {
  const codes = (item.jurisdiction_iso ?? []).filter(Boolean);
  const keys = item.canonical_instrument_key ? [item.canonical_instrument_key] : [];
  const { data: ents } = await sb.from("entities").select("entity_id").in("kind", ["jurisdiction", "instrument"]);
  const existing = new Set((ents ?? []).map((e) => e.entity_id));
  const { data: refs } = await sb.from("entity_refs").select("entity_id,ref_id,role").eq("ref_table", "intelligence_items").eq("ref_id", item.id);
  const existingRefKeys = new Set((refs ?? []).map((r) => `${r.entity_id}|intelligence_items|${r.ref_id}|${r.role}`));
  const jur = planJurisdictionEntities(codes, existing, new Set());
  const jurRefs = planJurisdictionRefs("intelligence_items", [item], jur.byCode, existingRefKeys);
  const ins = planInstrumentEntities(keys, existing, new Set());
  const fk = planInstrumentFkUpdates([item], ins.byKey);
  if (jur.entities.length) await sb.from("entities").upsert(jur.entities, { onConflict: "entity_id", ignoreDuplicates: true });
  if (ins.entities.length) await sb.from("entities").upsert(ins.entities, { onConflict: "entity_id", ignoreDuplicates: true });
  if (ins.identifiers.length) await sb.from("entity_identifiers").upsert(ins.identifiers, { onConflict: "entity_id,scheme,value", ignoreDuplicates: true });
  if (jurRefs.length) await sb.from("entity_refs").upsert(jurRefs.map((r) => ({ ...r, asserted_by: "src/lib/entities/link-item-entities.mjs", asserted_at: new Date().toISOString() })), { onConflict: "entity_id,ref_table,ref_id,role", ignoreDuplicates: true });
  const instrumentEntityId = fk[0]?.instrument_entity_id ?? null;
  if (instrumentEntityId) await sb.from("intelligence_items").update({ instrument_entity_id: instrumentEntityId }).eq("id", item.id);
  return { refs: jurRefs.length, instrumentEntityId };
}
```
Adjust the planner return shapes to what `entity-plan.mjs` actually returns (read them first; the names above follow `backfill-entities.mjs:91-157`). The unique constraint names come from migration 283; read it before writing `onConflict`.

- [ ] **Step 5: Run the test to verify it passes.**

- [ ] **Step 6: Call it from both writers, rule-16 posture**

In `mint-item.ts` after `:362`:
```ts
// rule 16(e) (2026-09-11, W9.1): entity references at mint. Same try/catch posture as (a)/(b): never fails a mint, defect recorded.
try {
  const r = await linkItemEntities(sb, { id: itemId, jurisdiction_iso: seed.jurisdiction_iso as string[] | undefined, canonical_instrument_key: seed.canonical_instrument_key as string | undefined });
  if (r.refs > 0 || r.instrumentEntityId) flags.push(`entities:${r.refs}${r.instrumentEntityId ? "+instrument" : ""}`);
} catch (e: unknown) {
  await recordFlywheelDefect(sb, itemId, "entities", e instanceof Error ? e.message : String(e));
  flags.push("entities-failed");
}
```
Same block in `apply-staged-update.ts` inside the substantive path when `proposed_changes` touches `jurisdiction_iso` or `canonical_instrument_key`. Extend `flywheel-defect.ts`'s step vocabulary with `"entities"` (read its CHECK/enum first).

- [ ] **Step 7: Mint-time proof test**

`mint-item-entities.npmtest.mjs`: with the injected fake client, mint a seed with `jurisdiction_iso: ["FR"]` and assert `entity_refs` received one row and `flags` includes `entities:1`. Run `node --test`; PASS.

- [ ] **Step 8: Gates, commit**

```bash
git add fsi-app/src/lib/entities/entity-plan.mjs fsi-app/src/lib/entities/link-item-entities.mjs fsi-app/src/lib/entities/link-item-entities.test.mjs fsi-app/scripts/entities/backfill-entities.mjs fsi-app/src/lib/intake/mint-item.ts fsi-app/src/lib/intake/apply-staged-update.ts fsi-app/src/lib/intake/mint-item-entities.npmtest.mjs fsi-app/src/lib/intake/flywheel-defect.ts
git commit -m "feat(flywheel): entity references written at mint and on substantive update (rule 16e); one planner shared with the backfill"
```

### Task 1.2: `format_type` stamped at mint

**Files:**
- Modify: `fsi-app/src/lib/intake/mint-item.ts:148` (next to the grade stamp).
- Reuse: `specForItemType` (`canonical-pipeline.ts:775` imports it; find its home with `grep -rn "export function specForItemType" fsi-app/src/lib/agent`).
- Test: `fsi-app/src/lib/intake/mint-item-grade.npmtest.mjs` (extend).

**Interfaces:**
- Produces: every minted row has `format_type = specForItemType(item_type).formatType`; the value is identical to what `synthesiseAndWriteBrief` forces later (`:844`), so generation never changes it.

- [ ] **Step 1: Failing test**: mint a `regulation` seed with no `format_type`; assert the inserted row has `format_type: "regulatory_fact_document"`; mint an `initiative`; assert `market_signal_brief`.
- [ ] **Step 2: Run, expect FAIL** (`format_type` undefined).
- [ ] **Step 3: Implement**: after `:148`, `if (seed.format_type == null) { const spec = specForItemType(itemType ?? ""); if (spec) seed.format_type = spec.formatType; }`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** (`git add` the two files; message `feat(mint): stamp format_type from item_type at mint, the same derivation generation forces`).

### Task 1.3: CELEX Decisions mint as regulations with their real titles

**Files:**
- Modify: `fsi-app/scripts/mint/export-census-rows.mjs:253-257` (`CELEX_SECTOR_LETTER_MAP`), `:945-955` (title fallback), `:1414-1418` (DB-cache capture shape).
- Reuse: `extractOjActTitle` (`:515`), `bodyLeadTitle` (`:525`), both text-only and already in the file.
- Test: `fsi-app/scripts/mint/export-census-rows.test.mjs` (the halted EUDECISION worktree holds a started diff of both files; read it in full first and keep what is correct).

**Interfaces:**
- Produces: `classifyItemTypeFromCelexKey("32003D0278") -> { itemType: "regulation", hold: null }`; a capture with `html: null` still yields the act's official title when `result_content` opens with it.

- [ ] **Step 1: Failing tests**
```js
test("CELEX D (Decision) maps to regulation in sectors 2, 3 and 4", () => {
  for (const k of ["22003D0015", "32003D0278", "42019D0001"]) assert.deepEqual(classifyItemTypeFromCelexKey(k), { itemType: "regulation", hold: null });
});
test("an html-less DB-cached capture still gets the act title from its text", () => {
  const row = buildTitleForRow({ capture: { text: "COMMISSION DECISION (EU) 2025/1055 of 19 May 2025 on the criteria for ...", html: null }, source: { name: "EUR-Lex" }, identifier: "32025D1055" });
  assert.equal(row.title, "COMMISSION DECISION (EU) 2025/1055 of 19 May 2025 on the criteria for ...");
});
```
(`buildTitleForRow` is the name to give the title-resolution branch at `:945-955` when extracting it into a pure function; today it is inline.)
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**: map `D: "regulation"` in sectors 2, 3, 4 (update the header comment that explains the earlier `initiative` choice and why it was wrong: a Decision is a binding act, Regulations surface); in the title branch, when `capture.html` is null try `extractOjActTitle(capture.text) ?? bodyLeadTitle(capture.text)` before the `${source.name} — ${identifier}` fallback.
- [ ] **Step 4: Run, expect PASS**; run the whole `export-census-rows.test.mjs`.
- [ ] **Step 5: Commit.**

### Task 1.4: The population report guards the birth wiring

**Files:**
- Modify: `fsi-app/scripts/verify/population-report.mjs` (STORES, `:62-75`), `fsi-app/scripts/verify/population-report.test.mjs`.

**Interfaces:**
- Produces: three new STORES entries, each red-by-attack: live items with zero `entity_refs`; live items with NULL `format_type`; live `initiative` rows whose `canonical_instrument_key` matches `^[234]\d{4}D`.

- [ ] **Step 1: Failing tests**: feed each entry a fixture at zero coverage and assert `classify()` returns a non-`FILLED` state (the pattern the existing four entries use, `population-report.test.mjs`).
- [ ] **Step 2: Implement the entries** with `totalQuery`/`filledQuery` overrides exactly as the brief-coverage entry does.
- [ ] **Step 3: Run tests; commit.**

### Task 1.5: ADR-028: record grade is a transit state, not a terminal one

**Files:**
- Create: `docs/decisions/ADR-028-record-grade-is-transit.md` (frontmatter per ADR-009: id, title, status, date, scope, supersedes, related).
- Modify: `docs/INDEX.md` (one line), `docs/plans/complete-system-build-plan-2026-09-04.md` (add W9 with a pointer to this plan; amend W2's done criterion: "every record item has >= 3 grounded FACTs or an honest GAP per slot" becomes "... and is upgraded to a brief by W9's runtime before it counts as done").

- [ ] **Step 1: Write the ADR** quoting the 2026-09-09 ruling verbatim, stating: a `record` item is admitted to the surfaces (unchanged, 2026-09-02 ruling) but is not done until the brief runtime (Part 3) has upgraded it; the upgrade is mandatory and automatic for every new item (queued at mint, task 3.5); the grade is a cache of that state.
- [ ] **Step 2: INDEX line; W9 pointer; commit** with the plan doc itself.

---

## Part 2: the brief contract carries every field the surfaces read

### Task 2.1: Migration 316: the four missing columns and the RPC exposure

**Files:**
- Create: `fsi-app/supabase/migrations/316_regulation_exposure_fields.sql`.
- Modify: `docs/inventories/migrations.md`.
- Read first: migrations 107 (`trajectory_points` CHECK, `:52`), 108/110 (how a new column reached the customer RPCs), 283 (entity tables), the current definition of every RPC that feeds the regulation detail and list reads (`grep -rn "get_workspace_intelligence_dashboard\|get_regulation\|rpc(\"" fsi-app/src/lib/supabase-server.ts | head`), so the migration extends every one of them.

**Interfaces:**
- Produces: `intelligence_items.cost_mechanism text`, `penalty_range text`, `enforcement_body text`, `requirement_trajectory jsonb` with `CHECK (requirement_trajectory IS NULL OR (jsonb_typeof(requirement_trajectory->'steps') = 'array'))`; each customer RPC returns the four columns.
- Shape of `requirement_trajectory`: `{ "steps": [{ "date": "2025" | "2026-09-30" | "2027", "value": "40%", "label": "of verified emissions" }], "note": "CH4 and N2O in scope from 2026" }`. This is deliberately not `trajectory_points` (a numeric price series with its own CHECK and its own renderer, `TrajectoryBars.tsx`).

- [ ] **Step 1: Write the migration** with the repo's md5-guarded pre-check and post-check blocks (copy the pattern from 315).
- [ ] **Step 2: Apply on a Supabase branch or dry-parse locally** (`psql --set ON_ERROR_STOP=1 -f` against a branch if available; else the coordinator applies live before merge per rule 3). Record the post-check output in the PR body.
- [ ] **Step 3: Inventory row; commit.**

### Task 2.2: Contract, parser and the single write site

**Files:**
- Modify: `fsi-app/src/lib/agent/system-prompt.ts:282-330` (field emission list), `fsi-app/src/lib/agent/parse-output.ts:556-645` (readers), `fsi-app/src/lib/agent/canonical-pipeline.ts:869-881` (the update), `fsi-app/src/lib/intake/apply-staged-update.ts:242-247` (stop discarding).
- Test: `fsi-app/src/lib/agent/parse-output.test.mjs` (extend), `fsi-app/src/lib/agent/canonical-pipeline.write-fields.npmtest.mjs` (new; injected fake client, asserts the update payload).

**Interfaces:**
- Produces in `AgentMetadata`: `cost_mechanism: string | null`, `penalty_range: string | null`, `enforcement_body: string | null`, `requirement_trajectory: RequirementTrajectoryJSON | null`, `why_matters: string | null`, `key_data: string[]`; all optional at the parser (absence is an honest answer, the same rule `what_is_it` follows at `parse-output.ts:620-626`).
- Prompt rules (regulatory_fact_document only for the first four): `cost_mechanism`: one sentence, who is obligated and how the cost reaches a forwarder's invoice (surcharge, levy, allowance cost, penalty, pass-through), only when the source states the mechanism; `requirement_trajectory`: the whole per-year series the qualification-capture rule already demands in S8, as inline JSON, null when the instrument has no phase-in; `penalty_range` and `enforcement_body`: verbatim-grounded, from the S3/S8 penalty_summary material; `why_matters` and `key_data` for every format.

- [ ] **Step 1: Failing parser tests** for a valid `requirement_trajectory`, an invalid one (`steps` not an array -> `AgentOutputParseError`), and null.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement readers** next to `trajectoryPoints` (`:560-600`) with the same validation shape; add the six keys to the return object (`:635-645`).
- [ ] **Step 4: Failing write test**: with the fake client, call the synthesis write path with a parsed metadata carrying the six fields and assert the `intelligence_items.update` payload includes them (`why_matters`/`key_data` with COALESCE semantics like `what_is_it`: only a non-null emission updates).
- [ ] **Step 5: Implement the write** at `:869-881` (extend the one `update({...})`; no second write).
- [ ] **Step 6: Prompt text** at `:282-330`; run any golden that snapshots the prompt (`grep -rln "Database field emission" fsi-app/src fsi-app/.discipline`).
- [ ] **Step 7: `apply-staged-update.ts:242-247`**: remove the discard; pass `cost_mechanism`, `penalty_range`, `enforcement_body`, `requirement_trajectory` through when present.
- [ ] **Step 8: Gates; commit.**

### Task 2.3: Resource mapping, RPC reads, and the four detail surfaces

**Files:**
- Modify: `fsi-app/src/types/resource.ts:221-224` (add `requirementTrajectory?: RequirementTrajectoryJSON`), `fsi-app/src/lib/supabase-server.ts:1745-1787` and `:3803-3865` (both mappers; delete the "NOT in the schema" comment at `:3863-3865` because it is no longer true), `fsi-app/src/lib/list-pagination.ts:82` if it enumerates fields, `fsi-app/src/components/regulations/RegulationDetailSurface.tsx:261-268` and `:356-377`, `OperationsDetailSurface.tsx:302`, `MarketSignalDetailSurface.tsx:410`, `ResearchFindingDetailSurface.tsx:260`.
- Create: `fsi-app/src/components/detail/RequirementTrajectory.tsx` (one renderer, four callers).
- Test: `fsi-app/.discipline/rendering/smoke/smoke-fixtures.mjs` + `detail-surfaces-smoke.mjs` (new fixture cases: all four fields present; all absent).
- Read first: `docs/design/handoff-2026-09-06/Caros Ledge UI System.dc.html` regulation Exposure card, `docs/design/ux-laws.md`, `design-principles.md`.

**Interfaces:**
- Consumes: the six columns from 2.1/2.2.
- Produces: Trajectory cell reads `requirementTrajectory` for regulation-family items, rendered as `40% (2025) → 70% (Sep 30 2026) → 100% (2027)` plus the note, exactly the mock's string; keeps `conversionTrigger` for market signals (`system-prompt.ts:306`). Who pays reads `costMechanism`. `PenaltyFacts` renders when any of the three is present.

- [ ] **Step 1: Failing smoke fixture**: a regulation Resource with the four fields set renders the Exposure panel with the mock's exact Who pays and Trajectory strings and a Penalties section; with none set renders the two Absence reasons and no Penalties section.
- [ ] **Step 2: Run the rendering guard; expect the new fixtures FAIL.**
- [ ] **Step 3: Implement** the mapper lines, the type, `RequirementTrajectory.tsx`, and the four call sites (same component, no copy).
- [ ] **Step 4: Rendering guard PASS; F43 (no default-open) and F35 stay green.**
- [ ] **Step 5: Gates; session-log addendum with `### UX compliance`; commit; PR** ("feat(briefs): Who pays, requirement trajectory, penalties, why_matters, key_data through the one pipeline"). Migration 316 is applied by the coordinator before merge.

### Task 2.4: `format_type` catch-up for the 128 live briefs

**Files:**
- Create: `fsi-app/scripts/maintenance/backfill-format-type.mjs` (dry default, `--execute` via `guardedUpdate` from `scripts/lib/db.mjs`, `--limit`, `--after-id`).
- Modify: `.github/workflows/maintenance.yml` (one new `command` value, the `mode dry|apply` pattern at `:598`).
- Test: `backfill-format-type.test.mjs` (pure mapper: every `item_type` in the vocabulary maps to exactly the value `specForItemType` returns; unknown type -> skipped and reported, never guessed).

- [ ] Steps: failing test, implement (reuse `specForItemType`; no second mapping table), pass, wire the workflow command, commit. The coordinator dispatches dry then apply; the population report entry from 1.4 goes green.

---

## Part 3: the brief runtime (session lane authors, Actions stores, the pipeline judges)

Retrieval first: no existing path takes session-authored synthesis text. `groundBrief(itemId, caller, { injectedLedger })` (`canonical-pipeline.ts:1283-1310`) takes an injected claim ledger; `ledger-consume.yml` takes a `verdicts_file`; `population-turn.yml` takes a `rows_file`; `synthesiseAndWriteBrief` (`:734`) has no injection parameter and unconditionally calls `generateBriefText`. That is the one gap. Everything downstream of the write (section, ground with the injected ledger, grow, timeline harvest, forward events, compliance sync, discovery, obligations, tags) exists and is reused unchanged.

### Task 3.1: Export the stored source text for a batch of stub items

**Files:**
- Modify: `fsi-app/scripts/turns/export-corpus-for-extraction.mjs` (`--ids` path, `:128-158`): add `--with-pool-text` that includes each item's `agent_run_searches.result_content` and `result_url`; add `--char-budget N` (default 3,000,000) that splits the output into `--out` numbered parts so a session lane never receives more than N characters per file (the corpus spread is 1,337 to 2,590,651 chars per item).
- Modify: `.github/workflows/population-turn.yml` or a new small `brief-export.yml` (workflow_dispatch: `ids` or `grade=record --limit N --after-id`; uploads the parts as a branch `brief-export/<run_id>` + PR, the same transport `ledger-consume.yml`'s `export_candidates` uses).
- Test: `export-corpus-for-extraction.test.mjs` (chunking by char budget; an item larger than the budget goes alone in its own part with `oversize: true`).

**Interfaces:**
- Produces per part: `{ "part": 3, "items": [{ "id", "title", "item_type", "format_type", "jurisdiction_iso", "canonical_instrument_key", "source_id", "source_url", "required_slots": ["effective_date", ...], "claims": [...], "sections": [...], "pool": [{ "url", "text" }] }] }`.

- [ ] Steps: failing chunking test; implement over the existing `buildCorpusItems` helper (add `pool` to its return when the flag is set); pass; wire the workflow; commit.

### Task 3.2: The `record-briefs` artifact contract

**Files:**
- Create: `fsi-app/scripts/turns/record-briefs/README.md` (the `ledger-verdicts/README.md` shape: mechanism, how a lane produces a batch, schema), `fsi-app/scripts/turns/record-briefs/schema.mjs` (validator, pure), `record-briefs.test.mjs`.

**Interfaces:**
- Produces `validateRecordBriefsFile(json) -> { ok: true, entries } | { ok: false, errors: string[] }` with entry shape:
```json
{ "item_id": "uuid", "source_pool_hash": "sha256 of the pool text the lane read",
  "body": "<the full markdown brief under the item's format_type, section list per system-prompt.ts>",
  "metadata": { "severity": "...", "priority": "...", "urgency_tier": "...", "format_type": "...", "topic_tags": [], "signal_band": null, "theme": null, "what_is_it": "...", "why_matters": "...", "key_data": [], "cost_mechanism": null, "requirement_trajectory": null, "penalty_range": null, "enforcement_body": null, "operational_scenario_tags": [], "compliance_object_tags": [], "related_items": [], "intersection_summary": null, "sources_used": [], "regeneration_skill_version": "2026-09-11" },
  "claims": [{ "slot_key": "effective_date", "claim_kind": "FACT", "claim_text": "...", "source_span": "<verbatim substring of the pool text>", "source_url": "..." }] }
```
- The validator reuses `parse-output.ts`'s metadata validation (import it; do not re-implement vocabularies) and `record-facts.mjs`'s `assertVerbatim` for every FACT span.

- [ ] Steps: failing tests (valid entry; a FACT span not in the pool text -> error naming the item; a metadata vocabulary miss -> error); implement; pass; README; commit.

### Task 3.3: The injected-synthesis seam in the one write site

**Files:**
- Modify: `fsi-app/src/lib/agent/canonical-pipeline.ts` (`synthesiseAndWriteBrief` `:734`, `generateBriefFromStored`, and the exported entry the driver calls).
- Test: `fsi-app/src/lib/agent/canonical-pipeline.injected-synthesis.npmtest.mjs` (fake client).

**Interfaces:**
- Produces: `generateBriefFromInjected(itemId, caller, { body, metadata, sourcePoolHash }) -> Promise<StepResult>`; internally `synthesiseAndWriteBrief(sb, it, fetched, corroborators, { injected })` skips `generateBriefText` when `injected` is present and runs everything after it unchanged: `parsed = parseAgentOutput(injected.body + frontmatter)` (so the same parser validates lane output), `fmtSpec` forcing (`:844`), vocabulary mapping, the single `update`, `item_cross_references`, then returns. It refuses when `sourcePoolHash` does not match the hash of the item's current stored pool (the lane read stale text) and when the item is not `item_grade='record'` unless `--allow-brief-overwrite` is passed by the driver (existing briefs are re-generated only by explicit order; RD-36 dominance guard still protects the ledger downstream).
- RD-47 posture: the seam is read at exactly one point (skip the model call); the judgment core is untouched. Add the seam to `executor-parity.golden.mjs`'s allowlisted skip-points.

- [ ] **Step 1: Failing test**: inject a body + metadata for a record item; assert `intelligence_items.update` was called with `full_brief`, the six new fields, `format_type` forced from `item_type`, and that `generateBriefText` (mocked) was never called; assert a hash mismatch returns `{ ok: false, detail: /stale pool/ }`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the optional fifth parameter and the exported entry; thread the item read exactly as `generateBriefFromStored` does.
- [ ] **Step 4: Run tests; run `executor-parity.golden.mjs`; both PASS.**
- [ ] **Step 5: Commit.**

### Task 3.4: The driver and workflow: `brief-apply`

**Files:**
- Create: `fsi-app/scripts/turns/apply-record-briefs.mjs` (dry default; `--briefs <file>`; `--execute`; `--limit`; `--after-id`; writes `scripts/harness-runs/brief-apply/brief-apply-run-NNN.json` through `writeRunArtifact`; family registered in `scripts/harness-runs/CONVENTION.md` with `PENDING-RUN.md` until the first run).
- Create: `.github/workflows/brief-apply.yml` (workflow_dispatch only; inputs `mode dry|apply`, `briefs_file`, `limit`, `after_id`; secrets the other workflows already use).
- Test: `apply-record-briefs.test.mjs` (plan builder over a validated file: order, skip-on-stale-hash, per-item outcome vocabulary).

**Interfaces (per item, in order, each its own try/catch, outcome recorded):**
1. `validateRecordBriefsFile` (3.2).
2. `generateBriefFromInjected` (3.3) -> writes `full_brief` + metadata; `item_grade` becomes `'brief'` in the same update (the grade is a cache of this state, ADR-028).
3. `sectionBrief(itemId)` (existing) -> sections; `harvestItemTimeline` fires inside it (already unlocked, PR #618).
4. `groundBrief(itemId, "brief-apply", { injectedLedger: entry.claims })` (existing seam) -> claim ledger judged by the unchanged gates, `validate_item_provenance` via the trigger; the item's `provenance_status` is read back and reported; a quarantine is reported, never hidden.
5. `growSources(itemId)` (existing).
6. Flywheel: `readAndExtractForwardEvents` + `syncComplianceDeadlineForItem` + `runConnectionDiscovery` + `linkItemEntities` (1.1) exactly as `apply-staged-update.ts`'s substantive path calls them; then, for the batch, the unscoped steps (`analyze-corpus.mjs`, `derive-obligations.mjs`, `tag-proposals.mjs --arg "ids:..."`, `tag-ratification.mjs --arg auto`) by invoking `run-population-flywheel.mjs`'s exported plan builder with the batch ids rather than a mint-run artifact (read `buildFlywheelPlan` first; add an `ids` entry point if it only takes an artifact).
7. `population-report.mjs` last, always.

- [ ] **Step 1: Failing plan-builder test**; **Step 2: implement**; **Step 3: pass**; **Step 4: workflow YAML** (copy `date-chain.yml`'s structure: `--execute` only on `apply`, report always last, artifact upload); **Step 5: `PENDING-RUN.md` + CONVENTION row** (F28 green); **Step 6: gates; commit; PR.**

### Task 3.5: Every new item is queued for a brief automatically

**Files:**
- Modify: `fsi-app/scripts/turns/run-population-flywheel.mjs` (step 12: after `record-last-turn`, run `export-corpus-for-extraction.mjs --ids <minted ids> --with-pool-text --char-budget` and commit the parts under `scripts/turns/brief-export/pending/` on the run's own artifact branch, exactly as the mint-run artifact is committed today), `docs/runbooks/MINT-RUNBOOK.md` section 8 (the step list this file mirrors).
- Modify: `fsi-app/scripts/verify/population-report.mjs`: entry "briefs pending" = live record items with no `brief-apply` outcome; red when > 0 for longer than one turn (the same transit-only posture RD-20 gives `staged_updates`).

**Interfaces:**
- Produces: a population turn ends with the batch's source text exported for the next session lane; the report shows the queue; a session lane's job is to drain it (3.2 -> 3.4). No human decides per item.

- [ ] Steps: failing plan test (a minted batch produces an export step); implement; runbook step; population-report entry with its attack test; commit.

---

## Part 4: the two halted UI/docs lanes, finished from their worktrees

### Task 4.1: Search box: Escape, click-outside, arrow keys, item type (from `wt-searchkeys-0911`)

**Files:** `fsi-app/src/components/ui/CommandBar.tsx`, `ListRow.tsx`, new `commandBarKeyboard.ts` + `.npmtest.mjs`, `docs/tech-debt-log.md` (already started, uncommitted).

- [ ] **Step 1: Read every uncommitted diff in full** (`git -C .worktrees/wt-searchkeys-0911 diff`); keep only what matches this spec: WAI-ARIA combobox (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; options `role="option"` with ids), Escape closes and keeps the text, pointer-down outside both the bar and the portaled listbox closes, ArrowUp/Down clamp (not wrap), Enter opens the active option, item type shown in the narrow rows without re-breaking the `@container` title fix.
- [ ] **Step 2: Run its unit test; if missing cases, add them (clamp at both ends; outside-click decision with the two refs).**
- [ ] **Step 3: Gates including rendering guard and `audit:design`; session-log addendum with `### UX compliance`; close the SEARCHCLIP tech-debt entry; commit; PR.**

### Task 4.2: Land the 2026-08-17 ledger v2 + handoff and the corrected 2026-09-11 handoff (from `wt-landdocs-0911`)

**Files:** `.claude/skills/ledger/SKILL.md` (B9, B10, failure-log entry), `docs/ops/handoff-2026-08-17.md`, `docs/ops/HANDOFF-2026-09-11.md` (with the CORRECTIONS block: run 34612367135 was apply; t71x became PR #621; harvest scope 21 not 893; entity gap was timing), `docs/ops/runbooks/date-chain-2026-09-11.md` (Status 2026-09-11 note), `docs/INDEX.md`, `docs/ops/session-log.md` (late-landed 2026-08-17 entry).

- [ ] Steps: read every diff in full; confirm none of the SKILL.md text already exists on master (`git grep -n "B9\." origin/master -- .claude/skills/ledger/SKILL.md`); run `node scripts/verify/audit-finding-status.mjs`; discipline runner; commit; PR.

### Task 4.3: The Intelligence Assistant (Ask mode) is ON in production, by ruling

Operator, 2026-09-09, verbatim: "actually turn the AI on, we just wont use it"; "you shut it off you can turn it on". 2026-09-11: "is fixing the search and ai panel in this work tree, it should be". Three earlier lanes refused the flip citing PR #478 / Addendum 32 / RD-31; the ADR below is what resolves that.

**Facts [CONFIRMED, master 5e891abd]:** `fsi-app/src/app/api/ask/route.ts:28` reads `const ASSISTANT_ENABLED = process.env.ASSISTANT_ENABLED === "true"` and refuses at `:153` when false; `fsi-app/src/app/api/workspace/bootstrap/route.ts:83` surfaces the same flag to the client, which `CommandBar.tsx` reads (`assistantEnabled === true`) to enable Ask mode; `fsi-app/.discipline/assistant-spend-gate.test.mjs:35-60` REQUIRES exactly that strict comparison and that gate ordering, so any "default on" code change fails a gate by design. `/api/ask` is a sanctioned, metered `claude-sonnet-4-6` caller (`fsi-app/.claude/CLAUDE.md`, permitted-calls table), rate-limited 60/min/user.

**Files:**
- Create: `docs/decisions/ADR-029-assistant-enabled-in-production.md` (frontmatter per ADR-009).
- Modify: `docs/INDEX.md` (ADR line); the in-repo boundary manifest that lists env-governed behaviour (find it: grep docs and fsi-app/docs for "boundary manifest" or "ASSISTANT_ENABLED"), so the env var has an in-repo source of truth.
- No code change to `route.ts` or the gate test: the fail-closed design stands; the flip is configuration.

**Interfaces:**
- Produces: `ASSISTANT_ENABLED=true` in the Vercel `carosledge` project, Production environment (set by the coordinator; the lane writes the ADR and the manifest row and reports the exact command); a redeploy of master so the server reads it; `GET /api/workspace/bootstrap` returns `assistantEnabled: true` on carosledge.com; Ask mode answers a real question.

- [ ] **Step 1: Write ADR-029** quoting the rulings verbatim, stating: the assistant is ON in production; the strict `=== "true"` fail-closed gate is unchanged; spend is the sanctioned `/api/ask` path already attributed by `spend-client.ts` (cite the line); the env var is the single control and is recorded in the boundary manifest; Preview and Development stay OFF unless set.
- [ ] **Step 2: Manifest row + INDEX line.**
- [ ] **Step 3: Report the exact flip command** for the coordinator: `vercel env add ASSISTANT_ENABLED production` (value `true`) from the linked checkout, then a redeploy of the current production deployment. The lane holds no Vercel credentials and does not attempt the flip.
- [ ] **Step 4: Verification the coordinator runs after the flip:** `curl -s https://carosledge.com/api/version` shows the redeployed sha; the operator opens the site, switches the bar to Ask, asks "what is PPWR" and gets an answer; `/api/health/spend` shows the ask row attributed. Any Ask-panel UI defect found in that check becomes a scoped follow-up task in this Part (4.4), never a silent note.
- [ ] **Step 5: Commit** (`docs: ADR-029 assistant enabled in production; boundary manifest row`).

---

## Part 5: what fits the build lands, what does not is closed

### Task 5.1: Worktree cleanup per the table above

- [ ] `wt-finishmig-0911`: `git cherry-pick --abort && git reset -q --hard origin/master`. `wt-finishcode-0911`: `git clean -fdq fsi-app/scripts/remediation`. `wt-brieffields-0911`, `wt-facetfix-0911`: `git worktree remove`. Keep searchkeys, landdocs, eudecision until their tasks land, then remove. Never run these in the main checkout.

### Task 5.2: Close what is already on master or superseded

- [ ] **#448** (F25 CLI-invocation): [REFUTED 2026-09-11] the earlier "already landed" claim: only `RETIRED 2026-08-11` is on master; `CLI_PATH_RE`/`buildCliInvocations` are not. [CONFIRMED] master's F25 handles CLI invocation through `findDispatchRoots` (W7.1) instead, so the PR is SUPERSEDED; closed 2026-09-11 with that comment. Residual (the rate-limiter test tolerance in `batch-primitives.test.mjs`) is reviewed under task 5.4.
- [ ] **`digests/33940609195`**: superseded by the flat `docs/ratifications/2026-09/*.ruling.json` on master; delete the remote branch.
- [ ] **#622**: closed by task 0.2 (folded into #623's branch).

### Task 5.3: Land #410 (Layer C insert gate, migration 240) and #370 (census-exclude RPC, renumbered 241)

**Files:** cherry-pick the two branches onto a fresh `lane/finishmig-2026-09-11b` from `origin/master`; renumber #370's `223_*.sql` to `241_next_uncensused_portal_candidates.sql` and every reference; both migrations get the md5 pre/post-check blocks.

- [ ] **Step 1 (the proof that matters):** read `fsi-app/src/lib/agent/audit-gate-core.mjs` and migration 240 and answer, with file:line, whether the INSERT gate blocks any of the three live insert paths: record mint (`run-mint-batch.mjs` -> `mint-item.ts`), the canonical generate path, `applyStagedUpdate` `new_item`. Run `scripts/verify/layer-c-insert-gate-proof.mjs` only if it is rollback-safe (read it first). If the gate would refuse a legitimate current insert, STOP the item and report; rule 18 and rule 17 outrank the gate.
- [ ] **Step 2:** confirm the RPC objects of 241 do not already exist (`select proname from pg_proc where proname like '%census%'`).
- [ ] **Step 3:** gates; session-log; commit; PR "Supersedes #410 and #370". The coordinator applies 240 and 241 before merge, then closes the two old PRs.

### Task 5.4: Land the residuals of #391, #341, #288 and the `seed/attach-2026-09-06` worklists

- [ ] **#391**: the `normPair` year-like fix + `pairKeysFor` + tests only; of its 14 `scripts/remediation/*` one-offs, include a script only if F25 finds a live caller or the script's header names a re-run purpose; list what was dropped.
- [ ] **#341**: only `scripts/lib/db.mjs` `guardedDelete({ matchColumn })` + `db.test.mjs` + the two doc entries; never replay migrations 209-223.
- [ ] **#288**: keep the 2026-07-12 ruling text; replace its numbers with `select archive_reason, count(*) from intelligence_items where is_archived group by 1 order by 2 desc` as of the landing date, labeled `[CONFIRMED]`.
- [ ] **seed branch**: land `attach-found-sources.seed.json` and `provenance-heal-34041907817.summary.json` under `fsi-app/scripts/_worklists/` (siblings already live there; referenced by `extract-worklist-seed.test.mjs`).
- [ ] **#454**: regenerate fresh (`git add --renormalize .` on current master, `slot-forcing.mjs` stays binary per its note) rather than applying the stale patch; separate small PR.
- [ ] Gates; one PR for the four residuals; close the old PRs after merge.

### Task 5.5: EU Decisions: retype and retitle the 351 live rows without dropping `verified`

**Files:**
- Create: `fsi-app/scripts/maintenance/retype-eu-decisions.mjs` (dry default; `--execute` through `scripts/lib/db.mjs`; `--limit`, `--after-id`); wire as a `maintenance.yml` command.
- Reuse: `record-facts.mjs` `extractSlotFact` (`:450`) for `primary_deadline`, `jurisdictional_scope`, `penalty_summary`; `buildRecordSlotClaim` (`:838`, export it); the title branch from task 1.3.
- Test: `retype-eu-decisions.test.mjs` (order of writes; an item whose title extraction is not a verbatim substring keeps its title and is listed).

**Why the order matters [CONFIRMED]:** `set_provenance_status_trg` re-runs `validate_item_provenance` on any UPDATE and checks criterion 5 against `item_type_required_slots` for the NEW type; `regulation` requires `effective_date`, `primary_deadline`, `jurisdictional_scope`, `penalty_summary`; all 351 carry `effective_date`, none carry the other three. A bare retype quarantines all 351.

- [ ] Per item: (1) build FACT-or-GAP claims for the three slots from the stored pool text and insert them on the `record_facts` section; (2) update `item_type='regulation'`, `format_type='regulatory_fact_document'`, and the title when extraction is verbatim; (3) read back `provenance_status` and report any that did not stay `verified`; (4) queue the item for the flywheel (`run-population-flywheel.mjs` ids entry from 3.4 step 6). Dry-run output per item: CELEX, old/new title, slots FACT vs GAP, predicted provenance.
- [ ] Also report (no change) the 18 non-CELEX `initiative` records and the 6 `market_signal` records so the coordinator can see what they are.
- [ ] Gates; commit; PR. The coordinator dispatches dry, reads the report, then apply.

---

## Part 6: the catch-up runs, then the standing measurement

### Task 6.1: Pilot: 10 stubs through the whole chain

- [ ] Dispatch `brief-export` for 10 record items chosen to span the spread (2 EU Decisions after 5.5, 3 UK SIs, 2 US Federal Register, 3 with the largest pools).
- [ ] A session lane authors `record-briefs-001.json` from the export, under the system prompt's section list and the qualification-capture rule; every FACT span verbatim.
- [ ] `brief-apply` dry, read the report; apply; then `population-report`.
- [ ] Sample-audit the 10 against a known-good verified brief (the prompt-audit-before-scaled-runs rule): sections present, S8 carries the per-year series, Who pays and Trajectory rendered on the item page, timeline rows present, forward events present, `provenance_status` read back. Fix the contract or the prompt (the source, never the output) before batch 2.

### Task 6.2: Batches to zero

- [ ] Char-budgeted batches (about 3 MB per file, roughly 40 to 60 items) until the population report's "brief coverage" reads 1,518 of 1,518 and "briefs pending" reads 0. Each batch: export -> lane -> dry -> apply -> report -> spot-check 3 items on the site. The 417 existing briefs get their four new fields the same way, with a `fields_only: true` entry type the driver honours by updating only the new columns (COALESCE), never `full_brief`.

### Task 6.3: Re-measure and close on the board

- [ ] `node scripts/verify/population-report.mjs`: every entry FILLED. The table in section 0 of this plan re-run and diffed. Board row for W9 updated with the run ids. Session-log closing addendum. INDEX lines for the new README and runbook sections.

---

## Sequence and dependencies

| Order | Tasks | Depends on |
|---|---|---|
| 1 | 0.1 master green, 0.2 propagation records | none |
| 2 | 1.1, 1.2, 1.3, 1.4, 1.5 (one lane, one PR) | 0.1 merged |
| 3 | 2.1 (DDL applied), 2.2, 2.3, 2.4 (one lane, one PR) | 0.1 merged; independent of Part 1 |
| 4 | 3.1, 3.2, 3.3, 3.4, 3.5 (one lane, one PR) | 1.1 (entity link), 2.2 (parser fields) merged |
| 5 | 4.1, 4.2, 5.1 to 5.5 | 0.1 merged; independent of Parts 1 to 3 |
| 6 | 6.1 pilot | 3.x and 5.5 merged, 2.1 applied |
| 7 | 6.2 batches, 6.3 close | 6.1 audited |

Lanes are Sonnet in disjoint worktrees; the coordinator (this session, Fable) reviews every diff against this plan before merge, applies DDL, dispatches runtimes, and keeps memory.

## Self-review against the spec

- Spec coverage: definition of done section 0: reachable (workflows and chokepoints named per task), run (harness-run family `brief-apply`, run ids in 6.3), populated (population-report entries 1.4, 3.5), visible (2.3 fixtures + 6.1 site check), gated (F28 row, population-report attack tests, executor-parity golden), documented (README 3.2, MINT-RUNBOOK step 12, ADR-028). Operator ruling "briefs need to exist for all items": 3.x + 6.x. "Wired for every new addition": 1.1, 1.2, 1.3, 3.5. "Understand before writing": every task opens with the read of the seam it changes.
- Placeholder scan: no TBD; each code step names its file and line range; where a name is introduced (`linkItemEntities`, `generateBriefFromInjected`, `validateRecordBriefsFile`, `RequirementTrajectory.tsx`, `buildTitleForRow`) the same name is used in every later task.
- Type consistency: `RequirementTrajectoryJSON` is defined in 2.2 and consumed in 2.3 and 3.2; `linkItemEntities` signature in 1.1 is what 3.4 step 6 calls.

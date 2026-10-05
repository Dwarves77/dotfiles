#!/usr/bin/env node
// SHARED-WRITER: integrity_flags
// apply-question-answers.mjs: the apply half of the question-answers batch pattern (lane L4-B, 2026-10-05,
// ADR-044) and the FIRST writer of inference_records (through register_inference_record, via the first-write
// function in src/lib/propagation/methods/infer-from-question.ts).
//
// Takes one named, committed batch (scripts/turns/question-answers/batches/question-answers-NNN.json, contract
// in scripts/turns/question-answers/README.md), validates EVERY entry against the live database with the pure
// validator (scripts/turns/question-answers/schema.mjs: the question is open (or answered against a held pool
// that has since changed), pool_hash matches the live held pool, every span is verbatim in the cited item's pool
// text, every claim id belongs to the cited item, no cited item archived, unverified or Community-only,
// ceilings, the CONFIRMED quotation rule). An entry that fails is refused whole, never partially applied, and
// its reasons are recorded as residue; a refused entry never blocks the valid ones (no human gate).
//
// WHAT A VALID ENTRY DOES (with --execute):
//   answered              writes ONE inference (origin derived, trigger_question_ref = the question's
//                         subject_ref, method infer-from-question@v1), then closes the question flag through
//                         the guarded writer: resolution_note names the inference id, and the flag's
//                         recommended_actions gains an answered_from_holdings element carrying the pool_hash the
//                         answer was written against (pool-hash drift is the invalidation signal: the export
//                         lists the question again when the held pool differs). A RE-ANSWER (the pool moved)
//                         writes the new inference with supersedes = the prior inference id and re-closes the
//                         flag. Any open holdings-need target for the question is closed (it is answered).
//   unanswerable_from_holdings
//                         records the outcome on the question flag (an unanswerable_from_holdings element with
//                         the pool_hash and the plain-words need; the flag stays open and the export skips it
//                         until the held pool changes) and raises ONE open holdings-need target for the question
//                         (flag namespace holdings-need:, one open row per question subject_ref, the need and its
//                         item, surface and product question in structured fields), which the research walker
//                         reads as a search input (scripts/research/research-walker.mjs).
// IDEMPOTENT: a second apply of the same entry writes nothing; an inference written but its flag not yet closed,
// after a crash, only closes the flag.
//
// RULE 17: the run artifact states inferences written, questions closed, outcomes recorded, targets raised and
// targets closed, so nothing is left for a coordinator to connect by hand.
//
// DRY BY DEFAULT: without --execute it validates, prints the plan and writes nothing (it still writes its
// harness-run artifact). --fixture <corpus.json> runs the whole step over an in-memory corpus with no database;
// --execute then writes into memory only and no artifact is written.
//
// FREE: no model call, no network. Usage:
//   node scripts/turns/apply-question-answers.mjs --answers <batch.json> [--execute] [--fixture <corpus.json>]
// Exit 0 done (refused entries are residue, not a failure), 1 bad args / invalid file / a write that did not
// read back, 2 no database credentials.

import { parseArgs as nodeParseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { validateQuestionAnswersFile, QUESTION_ANSWERS_SCHEMA_VERSION } from "./question-answers/schema.mjs";
import {
  loadOpenQuestionFlags, loadAnsweredQuestionFlags, loadOpenNeedTargets, loadQuestionMaterial, loadInferencesByRef,
  currentInference, parseQuestionRef, buildQuestionContext, recordedOutcome, recordedAnswer, withAnsweredOutcome,
  holdingsNeedRow, needAction, needOfFlag, UNANSWERABLE_ACTION, FLAG_COLUMNS,
} from "./question-answers/data.mjs";
import { emitQuestionAnswersArtifact } from "./question-answers/artifact.mjs";
import { fixtureDeps } from "./question-answers/fixture-deps.mjs";
import { registerFirstInference } from "../../src/lib/propagation/methods/infer-from-question.ts";

export const CITE = {
  skill: "learning-loop-design-2026-09-25",
  reason: "question-answers apply (ADR-044): close an answered question flag naming its inference, or record on the question flag that holdings cannot answer it and raise its holdings-need target (guarded path, rule 015).",
};
export const RESOLVED_BY = "apply-question-answers";
const CHUNK = 25;
const LIVE_STATUSES = ["open", "in_review"];

/** Pure CLI parse. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({ args: argv, options: { answers: { type: "string" }, execute: { type: "boolean" }, fixture: { type: "string" } }, strict: true }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!values.answers) return { ok: false, error: "--answers <batch.json> is required (one named batch file per run)" };
  return { ok: true, answers: values.answers, execute: values.execute === true, fixture: values.fixture ?? null };
}

/** The resolution note of an answered question: names the inference. Pure. */
export function buildResolutionNote(inferenceId, entry, batch) {
  return `answered by inference ${inferenceId} (batch ${batch}; status ${entry.status_token}; pool_hash ${entry.pool_hash})`;
}

/** The recommended_actions array after recording an unanswerable outcome: any earlier outcome or answered
 *  element is replaced. Pure. */
export function withUnanswerableOutcome(actions, entry, batch, nowIso) {
  const kept = (Array.isArray(actions) ? actions : []).filter((a) => !(a && (a.action === UNANSWERABLE_ACTION || a.action === "answered_from_holdings")));
  return [...kept, { action: UNANSWERABLE_ACTION, rationale: entry.missing, pool_hash: entry.pool_hash, batch, recorded_at: nowIso }];
}

/**
 * Validate a parsed batch against the live database and (with execute) write the valid entries.
 * @param {{json:object, execute:boolean, deps:{readAll:Function, readAllByIds:Function, guardedUpdateByIds?:Function, guardedInsert?:Function, rpcClient?:Function}, now?:()=>string}} o
 */
export async function applyQuestionAnswers({ json, execute, deps, now = () => new Date().toISOString() }) {
  const result = {
    schema_version: QUESTION_ANSWERS_SCHEMA_VERSION, batch: json?.batch ?? null, ok: true, fileErrors: [],
    valid: [], refused: [], alreadyApplied: [], written: [], readBackFailures: [], writeFailures: [],
    report: { inferences_written: 0, questions_closed: 0, outcomes_recorded: 0, search_targets_raised: 0, search_targets_refreshed: 0, search_targets_closed: 0, unanswerable_needs: [] },
  };
  const entries = Array.isArray(json?.entries) ? json.entries : [];
  const refs = [...new Set(entries.map((e) => (e && typeof e.subject_ref === "string" ? e.subject_ref : null)).filter(Boolean))];

  // The question flags the batch can name: open ones, and resolved ones carrying an answered close-out
  // (a re-answer when their held pool has moved). Open wins when both exist.
  const flagByRef = new Map();
  for (const f of await loadOpenQuestionFlags(deps)) if (refs.includes(f.subject_ref) && !flagByRef.has(f.subject_ref)) flagByRef.set(f.subject_ref, { flag: f, state: "open" });
  for (const f of await loadAnsweredQuestionFlags(deps)) if (refs.includes(f.subject_ref) && !flagByRef.has(f.subject_ref)) flagByRef.set(f.subject_ref, { flag: f, state: "answered" });
  const inferences = await loadInferencesByRef(deps, refs);
  const needByRef = new Map();
  for (const f of await loadOpenNeedTargets(deps)) if (refs.includes(f.subject_ref) && !needByRef.has(f.subject_ref)) needByRef.set(f.subject_ref, f);

  // Question contexts for the named, parseable flags (read in chunks: held pools are stored whole).
  const ctxByRef = new Map();
  const namedRefs = [...flagByRef.keys()].filter((r) => parseQuestionRef(r));
  for (let i = 0; i < namedRefs.length; i += CHUNK) {
    const slice = namedRefs.slice(i, i + CHUNK);
    const material = await loadQuestionMaterial(deps, slice.map((r) => parseQuestionRef(r).itemId));
    for (const ref of slice) ctxByRef.set(ref, await buildQuestionContext(flagByRef.get(ref).flag, parseQuestionRef(ref), material));
  }
  const questions = new Map();
  for (const ref of refs) {
    const ctx = ctxByRef.get(ref);
    if (!ctx) continue;
    const { flag, state } = flagByRef.get(ref);
    // An answered question may be answered again only when the held pool differs from the one it was answered against.
    const open = state === "open" || recordedAnswer(flag).pool_hash !== ctx.pool_hash;
    questions.set(ref, { open, answered: state === "answered", questionText: ctx.questionText, itemUnusable: ctx.itemUnusable, pool_hash: ctx.pool_hash, members: ctx.members, unusable: ctx.unusable });
  }

  const verdict = validateQuestionAnswersFile(json, { questions });
  result.ok = verdict.ok;
  result.fileErrors = verdict.fileErrors;
  if (!verdict.ok) return result;

  // An entry whose work is already done is "already applied", not a refusal (a second apply is a no-op).
  const doneAlready = (entry) => {
    if (!entry || typeof entry.subject_ref !== "string") return false;
    const named = flagByRef.get(entry.subject_ref);
    if (entry.outcome === "unanswerable_from_holdings") {
      const o = named && named.state === "open" ? recordedOutcome(named.flag) : null;
      return !!o && o.pool_hash === entry.pool_hash && needByRef.has(entry.subject_ref);
    }
    if (entry.outcome === "answered" && named && named.state === "answered") {
      return recordedAnswer(named.flag).pool_hash === entry.pool_hash && (inferences.get(entry.subject_ref) ?? []).some((r) => r.claim_text === entry.answer);
    }
    return false;
  };
  for (const r of verdict.refused) {
    if (doneAlready(json.entries[r.index])) result.alreadyApplied.push({ index: r.index, subject_ref: r.subject_ref, why: "already applied" });
    else result.refused.push(r);
  }
  for (const e of verdict.valid) {
    if (doneAlready(e)) result.alreadyApplied.push({ index: json.entries.indexOf(e), subject_ref: e.subject_ref, why: "already applied" });
    else result.valid.push(e);
  }
  if (!result.valid.length) return result;

  const sb = execute ? deps.rpcClient() : null;
  for (const entry of result.valid) {
    const ctx = ctxByRef.get(entry.subject_ref);
    const flag = ctx.flag;
    const parsed = ctx.parsed;
    if (!execute) {
      result.written.push({ subject_ref: entry.subject_ref, outcome: entry.outcome, mode: "dry", inference_id: null });
      continue;
    }
    try {
      if (entry.outcome === "answered") {
        const existing = currentInference(inferences.get(entry.subject_ref));
        let inferenceId;
        let wrote = false;
        if (existing && existing.claim_text === entry.answer) {
          inferenceId = existing.inference_id; // crash recovery or an unchanged answer: no second inference
        } else {
          inferenceId = await registerFirstInference(sb, {
            subjectId: ctx.item?.instrument_entity_id ?? null,
            claimText: entry.answer, statusToken: entry.status_token, confidence: entry.confidence,
            citedItemIds: entry.cited_item_ids, triggerQuestionRef: entry.subject_ref, batch: json.batch,
            supersedes: existing?.inference_id ?? null,
          });
          wrote = true;
          result.report.inferences_written += 1;
        }
        const closed = await deps.guardedUpdateByIds(
          "integrity_flags", [flag.id],
          {
            status: "resolved", resolved_at: now(), resolved_by: RESOLVED_BY, resolution_note: buildResolutionNote(inferenceId, entry, json.batch),
            recommended_actions: withAnsweredOutcome(flag.recommended_actions, { inferenceId, poolHash: entry.pool_hash, batch: json.batch, nowIso: now() }),
          },
          { cite: CITE, applyMatch: (q) => q.in("status", [...LIVE_STATUSES, "resolved"]) },
        );
        result.report.questions_closed += closed.updated;
        const target = needByRef.get(entry.subject_ref);
        if (target) {
          const t = await deps.guardedUpdateByIds(
            "integrity_flags", [target.id],
            { status: "resolved", resolved_at: now(), resolved_by: RESOLVED_BY, resolution_note: `the question was answered by inference ${inferenceId} (batch ${json.batch})` },
            { cite: CITE, applyMatch: (q) => q.in("status", LIVE_STATUSES) },
          );
          result.report.search_targets_closed += t.updated;
        }
        result.written.push({ subject_ref: entry.subject_ref, outcome: "answered", mode: wrote ? "inference_and_close" : "close_only", inference_id: inferenceId, flag_id: flag.id, target_id: target?.id ?? null });
      } else {
        await deps.guardedUpdateByIds(
          "integrity_flags", [flag.id],
          { recommended_actions: withUnanswerableOutcome(flag.recommended_actions, entry, json.batch, now()) },
          { cite: CITE, applyMatch: (q) => q.in("status", LIVE_STATUSES) },
        );
        result.report.outcomes_recorded += 1;
        const existingTarget = needByRef.get(entry.subject_ref);
        let targetMode;
        if (existingTarget) {
          // One open target per question: a fresh need replaces the stale one in place.
          const row = holdingsNeedRow(entry, parsed, json.batch, now());
          await deps.guardedUpdateByIds(
            "integrity_flags", [existingTarget.id],
            { description: row.description, recommended_actions: [needAction(entry, parsed, json.batch, now())] },
            { cite: CITE, applyMatch: (q) => q.in("status", LIVE_STATUSES) },
          );
          result.report.search_targets_refreshed += 1;
          targetMode = "target_refreshed";
        } else {
          await deps.guardedInsert("integrity_flags", holdingsNeedRow(entry, parsed, json.batch, now()), { cite: CITE, select: "id" });
          result.report.search_targets_raised += 1;
          targetMode = "target_raised";
        }
        result.report.unanswerable_needs.push({ subject_ref: entry.subject_ref, missing: entry.missing });
        result.written.push({ subject_ref: entry.subject_ref, outcome: entry.outcome, mode: `outcome_recorded_${targetMode}`, inference_id: null, flag_id: flag.id });
      }
    } catch (err) {
      result.writeFailures.push({ subject_ref: entry.subject_ref, error: String(err?.message ?? err) });
    }
  }

  if (execute && result.written.length) {
    const flagIds = result.written.map((w) => w.flag_id);
    const backFlags = new Map((await deps.readAllByIds("integrity_flags", `${FLAG_COLUMNS}, resolution_note`, flagIds)).map((r) => [r.id, r]));
    const infIds = result.written.map((w) => w.inference_id).filter(Boolean);
    const backInf = new Map((infIds.length ? await deps.readAllByIds("inference_records", "inference_id, trigger_question_ref, claim_text", infIds, { idColumn: "inference_id" }) : []).map((r) => [r.inference_id, r]));
    const backNeeds = new Map((await loadOpenNeedTargets(deps)).map((r) => [r.subject_ref, r]));
    const closedTargetIds = result.written.map((w) => w.target_id).filter(Boolean);
    const backClosed = new Map((closedTargetIds.length ? await deps.readAllByIds("integrity_flags", FLAG_COLUMNS, closedTargetIds) : []).map((r) => [r.id, r]));
    for (const w of result.written) {
      const f = backFlags.get(w.flag_id);
      const entry = result.valid.find((e) => e.subject_ref === w.subject_ref);
      let ok;
      if (w.outcome === "answered") {
        const inf = backInf.get(w.inference_id);
        const answeredAs = f ? recordedAnswer(f) : null;
        ok = !!f && f.status === "resolved" && String(f.resolution_note ?? "").includes(w.inference_id) && !!inf && inf.trigger_question_ref === w.subject_ref
          && !!answeredAs && answeredAs.pool_hash === entry.pool_hash && answeredAs.inference_id === w.inference_id
          && (!w.target_id || backClosed.get(w.target_id)?.status === "resolved");
      } else {
        const o = f ? recordedOutcome(f) : null;
        const need = needOfFlag(backNeeds.get(w.subject_ref));
        ok = !!f && f.status !== "resolved" && !!o && o.pool_hash === entry.pool_hash && !!need && need.need === entry.missing;
      }
      if (!ok) result.readBackFailures.push(w.subject_ref);
    }
  }
  return result;
}

/** The harness-run artifact input for one apply run. Pure. */
export function applyArtifactInput({ parsed, r, answersPath, startedAt }) {
  const readBackBad = new Set(r.readBackFailures);
  const failed = new Map(r.writeFailures.map((f) => [f.subject_ref, f.error]));
  const writtenBy = new Map(r.written.map((w) => [w.subject_ref, w]));
  const perItem = [
    ...r.valid.map((e) => {
      const w = writtenBy.get(e.subject_ref);
      const tail = e.outcome === "answered" ? (w?.inference_id ? `inference ${w.inference_id}` : "answer") : `needs: ${e.missing}`;
      let outcome = parsed.execute ? `applied_${e.outcome}` : `valid_dry_${e.outcome}`;
      let error = null;
      if (failed.has(e.subject_ref)) { outcome = "write_failed"; error = failed.get(e.subject_ref); }
      else if (readBackBad.has(e.subject_ref)) { outcome = "written_readback_failed"; error = "the stored question flag, inference or target did not match what was written"; }
      return { id: e.subject_ref, outcome, verdict: tail, evidence_refs: [answersPath], error };
    }),
    ...r.alreadyApplied.map((a) => ({ id: a.subject_ref, outcome: "already_applied", verdict: a.why, evidence_refs: [answersPath], error: null })),
    ...r.refused.map((f) => ({ id: f.subject_ref ?? `entry-${f.index}`, outcome: "refused", verdict: f.errors[0] ?? "refused", evidence_refs: [answersPath], error: f.errors.join(" | ") })),
  ];
  const live = (n) => (parsed.execute ? n : 0);
  return {
    action: "apply",
    startedAt,
    config: { mode: parsed.execute ? "apply" : "dry", batch: r.batch, answers_file: parsed.answers },
    inputsRef: [parsed.answers],
    perItem: perItem.length ? perItem : [{ id: r.batch ?? "batch", outcome: "no_entries", verdict: r.fileErrors.join(" | ") || "no valid entries", evidence_refs: [answersPath], error: r.fileErrors[0] ?? null }],
    metrics: {
      entries_total: r.valid.length + r.refused.length + r.alreadyApplied.length,
      valid: r.valid.length, refused: r.refused.length, already_applied: r.alreadyApplied.length,
      inferences_written: live(r.report.inferences_written),
      questions_closed: live(r.report.questions_closed),
      outcomes_recorded: live(r.report.outcomes_recorded),
      search_targets_raised: live(r.report.search_targets_raised),
      search_targets_refreshed: live(r.report.search_targets_refreshed),
      search_targets_closed: live(r.report.search_targets_closed),
      write_failures: r.writeFailures.length, read_back_failures: r.readBackFailures.length,
    },
    defectsFound: [
      ...r.fileErrors.map((e) => ({ description: `batch file refused: ${e}`, root_cause: "structural problem in the committed batch file", fix_ref: null })),
      ...r.refused.map((f) => ({ description: `entry ${f.index} (question ${f.subject_ref ?? "?"}) refused: ${f.errors.length} reason(s)`, root_cause: f.errors[0] ?? "", fix_ref: null })),
      ...r.writeFailures.map((f) => ({ description: `write for question ${f.subject_ref} failed`, root_cause: f.error, fix_ref: null })),
    ],
    fullTraceRefs: [answersPath],
    proposerNotes: "Auto-emitted by apply-question-answers.mjs. Refused entries are residue with their reasons in per_item. Each unanswerable entry raised (or refreshed) one holdings-need target, which the research walker reads as a search input.",
  };
}

if (isMainModule(import.meta.url)) await main();

async function main() {
  loadLocalEnvFile();
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`apply-question-answers: ${parsed.error}\nusage: node scripts/turns/apply-question-answers.mjs --answers <batch.json> [--execute]`);
    process.exit(1);
  }
  if (!parsed.fixture && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("apply-question-answers: no database credentials, cannot run here (exit 2).");
    process.exit(2);
  }
  const answersPath = resolve(parsed.answers);
  let json;
  try {
    json = JSON.parse(readFileSync(answersPath, "utf8"));
  } catch (err) {
    console.error(`apply-question-answers: cannot read or parse ${answersPath}: ${err.message}`);
    process.exit(1);
  }
  const startedAt = new Date().toISOString();
  let deps;
  if (parsed.fixture) {
    deps = fixtureDeps(JSON.parse(readFileSync(resolve(parsed.fixture), "utf8")));
  } else {
    const db = await import("../lib/db.mjs");
    deps = {
      readAll: db.readAll, readAllByIds: db.readAllByIds, guardedUpdateByIds: db.guardedUpdateByIds, guardedInsert: db.guardedInsert,
      // register_inference_record is a governed, atomic SQL function (migration 339), the same precedent
      // run-propagation-drain.mjs sets for its own RPC writes: a raw client is the supported way to call it.
      rpcClient: () => null,
    };
    if (parsed.execute) {
      const { createClient } = await import("@supabase/supabase-js");
      const sbClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      deps.rpcClient = () => sbClient;
    }
  }
  const r = await applyQuestionAnswers({ json, execute: parsed.execute, deps });

  if (!r.ok) for (const e of r.fileErrors) console.error(`apply-question-answers: ${e}`);
  console.log(`apply-question-answers: batch ${r.batch ?? "(unnamed)"}: ${r.valid.length} valid, ${r.refused.length} refused, ${r.alreadyApplied.length} already applied${parsed.execute ? "" : " (DRY RUN, nothing written)"}.`);
  for (const f of r.refused) for (const e of f.errors) console.log(`  REFUSED ${e}`);
  for (const w of r.written) console.log(`  ${w.mode === "dry" ? "WOULD APPLY" : `APPLIED (${w.mode})`} ${w.outcome} ${w.subject_ref}${w.inference_id ? ` -> inference ${w.inference_id}` : ""}`);
  for (const f of r.writeFailures) console.error(`apply-question-answers: write FAILED for ${f.subject_ref}: ${f.error}`);
  if (r.readBackFailures.length) console.error(`apply-question-answers: read-back FAILED for ${r.readBackFailures.join(", ")}`);
  if (parsed.execute) console.log(`apply-question-answers: inferences written ${r.report.inferences_written}, questions closed ${r.report.questions_closed}, unanswerable outcomes recorded ${r.report.outcomes_recorded}, search targets raised ${r.report.search_targets_raised} (refreshed ${r.report.search_targets_refreshed}, closed ${r.report.search_targets_closed})`);

  const failed = !r.ok || r.readBackFailures.length > 0 || r.writeFailures.length > 0;
  if (parsed.fixture) {
    console.log("apply-question-answers: --fixture run, no harness-run artifact written.");
    process.exit(failed ? 1 : 0);
  }
  const artifactPath = emitQuestionAnswersArtifact(applyArtifactInput({ parsed, r, answersPath, startedAt }));
  console.log(`apply-question-answers: wrote ${artifactPath}`);
  process.exit(failed ? 1 : 0);
}

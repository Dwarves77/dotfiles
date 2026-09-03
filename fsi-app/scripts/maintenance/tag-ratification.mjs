// tag-ratification.mjs — MAINT dispatch step: applies operator-ratified TAG proposals, and (added
// 2026-09-03, operator ruling — see apply-tags.mjs's header for the full reasoning) auto-adopts
// high-confidence ones that were never ratified.
//
// UPSTREAM: ALL THE LOGIC ALREADY EXISTS IN apply-tags.mjs. scripts/connections/propose-tags.mjs
// reflects derive-tags.mjs candidates as integrity_flags rows (TAG_NAMESPACE, "flywheel-tag:") for
// review; scripts/connections/apply-tags.mjs carries BOTH apply halves — the original ratify path
// (evaluateApplication/applyTags: status='resolved' + `ratify:tags` marker required) and the
// 2026-09-03 auto-adoption path (evaluateAutoAdoption/partitionByConfidence/autoAdoptTags: status='open'
// + confidence >= AUTO_ADOPT_THRESHOLD, no marker required). This step does not rebuild either — it is
// the coordinator-dispatch runtime for both, same posture as every other MAINT step.
//
// WHAT IT DOES, per `arg`.
//   arg = "" (id path, UNCHANGED from before this ruling):
//     Dry: reads every RESOLVED integrity_flags row in TAG_NAMESPACE, runs apply-tags.mjs's own
//     evaluateApplication() over each (PURE, imported unmodified), and lists which are actually
//     ratify-and-apply-ready (carry the ratify:tags marker + a parseable non-empty proposals list) vs.
//     resolved-but-not-ratified-for-tags (e.g. resolved for an unrelated reason). Writes nothing.
//     Apply: `arg` is REQUIRED — a comma-separated list of integrity_flags ids to apply this run (never
//     "apply everything ratified" from a single dispatch; the coordinator names exactly which proposals
//     land). Each id runs through apply-tags.mjs's applyTags({execute:true}) — merge-only tag write,
//     cited, snapshotted.
//   arg = "auto" (new): adopts every OPEN TAG_NAMESPACE flag's high-confidence proposal subset, no id
//     list needed — this is the one dispatch shape where "apply everything [eligible]" is intentional,
//     because eligibility is derive-tags.mjs's own deterministic evidence, not an operator's per-flag
//     judgment call. Dry: lists every open flag with at least one proposal >= AUTO_ADOPT_THRESHOLD (and
//     how many fall below it, i.e. would remain as residue on an open flag). Apply: runs each through
//     apply-tags.mjs's autoAdoptTags({execute:true}) — writes only the eligible subset (merge-only),
//     resolves the flag ONLY when nothing below-threshold remains on it. IDEMPOTENT: a flag already
//     fully resolved (by this path or by ratify:tags) is skipped by evaluateAutoAdoption's own
//     status==='open' requirement; a flag left open with residue recomputes the same split next run and
//     writes a no-op merge (buildMergePatch's existing alreadyPresent handling) — safe to re-dispatch.
//   Neither path re-runs connection discovery (apply-tags.mjs's own optional step 6): this wrapper
//   orchestrates the guarded write only; the note in each summary carries the documented fallback
//   command apply-tags.mjs itself prints for a skipped discovery re-run.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyTags, evaluateApplication,
  evaluateAutoAdoption, partitionByConfidence, autoAdoptTags, AUTO_ADOPT_THRESHOLD,
} from "../connections/apply-tags.mjs";
import { TAG_NAMESPACE } from "../../src/lib/connections/flag-namespaces.mjs";
import { runCli } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "flywheel-build-plan-2026-08-10",
  reason:
    "MAINT tag-ratification dispatch (Lane MAINT, 2026-09-02; auto-adoption arm added 2026-09-03 per " +
    "operator ruling): applies an operator-ratified (resolution_note contains 'ratify:tags') OR a " +
    "high-confidence auto-adopted derive-tags.mjs proposal through scripts/connections/apply-tags.mjs's " +
    "own guarded applyTags()/autoAdoptTags() — orchestration only, no logic reimplemented.",
});

const FLAG_COLUMNS = "id, subject_ref, created_by, status, resolved_by, resolution_note, description";
const AUTO_ARG = "auto";

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{
 *   listResolvedCandidates: () => Promise<object[]>,
 *   listOpenCandidates?: () => Promise<object[]>,
 *   readFlag: (id:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   readItem: (id:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   updateItem: (id:string, patch:object) => Promise<{updated:number, snapshot:string|null}>,
 *   resolveFlag?: (id:string, note:string) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps - listOpenCandidates/resolveFlag are required only for arg="auto"; the id path (below) never
 *   touches them, so existing callers passing only the original four deps keep working unchanged.
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const isAuto = String(arg || "").trim().toLowerCase() === AUTO_ARG;

  if (isAuto) return runAutoAdopt(apply, deps);

  const summary = { step: "tag-ratification", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const candidates = await deps.listResolvedCandidates();
  const evaluated = candidates.map((f) => ({ flag: f, decision: evaluateApplication(f) }));
  const ratifiable = evaluated.filter((e) => e.decision.ok);
  const notRatifiable = evaluated.filter((e) => !e.decision.ok);

  summary.counts = {
    resolved_candidates: candidates.length,
    ratifiable: ratifiable.map((e) => ({
      flag_id: e.flag.id,
      item_id: e.decision.itemId,
      proposal_count: e.decision.proposals.length,
    })),
    not_ratifiable_count: notRatifiable.length,
    not_ratifiable_reasons: notRatifiable.map((e) => ({ flag_id: e.flag.id, error: e.decision.error })),
  };

  if (!apply) return summary;

  const ids = String(arg || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    summary.note = "REFUSED — apply requires arg = comma-separated integrity_flags id(s) to apply. Got none.";
    summary.exitCode = 1;
    return summary;
  }

  let applied = 0;
  const results = [];
  for (const id of ids) {
    const r = await applyTags(deps, id, { execute: true });
    results.push({ flag_id: id, status: r.status, item_id: r.itemId ?? null, error: r.error ?? null });
    if (r.status === "applied") applied += 1;
  }
  summary.applied = applied;
  summary.counts.apply_results = results;
  summary.note =
    `Applied ${applied}/${ids.length} requested flag(s). Discovery NOT re-run by this step (orchestration ` +
    "only, per this file's header) — fallback: node scripts/connections/discover-for-items.mjs " +
    `--ids ${[...new Set(results.filter((r) => r.status === "applied").map((r) => r.item_id))].join(",") || "<item id(s)>"} --execute.`;

  const readBack = {};
  for (const itemId of new Set(results.filter((r) => r.status === "applied").map((r) => r.item_id))) {
    const { data } = await deps.readItem(itemId);
    readBack[itemId] = data
      ? {
          operational_scenario_tags: data.operational_scenario_tags,
          compliance_object_tags: data.compliance_object_tags,
          topic_tags: data.topic_tags,
        }
      : null;
  }
  summary.read_back = readBack;

  return summary;
}

/**
 * The `arg="auto"` orchestration (2026-09-03 ruling): every OPEN TAG_NAMESPACE flag, evaluated for
 * auto-adoption eligibility via apply-tags.mjs's own evaluateAutoAdoption/partitionByConfidence (PURE,
 * imported unmodified), then — in apply mode — run through autoAdoptTags({execute:true}) one at a time.
 * No id list is required: eligibility is derive-tags.mjs's deterministic confidence evidence, not an
 * operator's per-flag judgment call, so "apply every eligible flag" is the intentional shape here
 * (unlike the id path above, which always names exact flags).
 * @param {boolean} apply
 * @param {{listOpenCandidates: Function, readFlag: Function, readItem: Function, updateItem: Function, resolveFlag: Function}} deps
 * @returns {Promise<object>} the same summary shape main() returns
 */
async function runAutoAdopt(apply, deps) {
  const summary = { step: "tag-ratification", mode: apply ? "apply" : "dry", counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const openFlags = await deps.listOpenCandidates();
  const evaluated = openFlags.map((f) => {
    const decision = evaluateAutoAdoption(f);
    if (!decision.ok) return { flag: f, decision, partition: null };
    return { flag: f, decision, partition: partitionByConfidence(decision.proposals) };
  });
  const eligible = evaluated.filter((e) => e.decision.ok && e.partition.eligible.length > 0);
  const belowThreshold = evaluated.filter((e) => e.decision.ok && e.partition.eligible.length === 0);
  const notAdoptable = evaluated.filter((e) => !e.decision.ok);

  summary.counts = {
    open_candidates: openFlags.length,
    threshold: AUTO_ADOPT_THRESHOLD,
    eligible: eligible.map((e) => ({
      flag_id: e.flag.id,
      item_id: e.decision.itemId,
      eligible_count: e.partition.eligible.length,
      residue_count: e.partition.residue.length,
    })),
    below_threshold_count: belowThreshold.length,
    not_adoptable_count: notAdoptable.length,
  };

  if (!apply) return summary;

  let applied = 0;
  const results = [];
  for (const { flag } of eligible) {
    const r = await autoAdoptTags(deps, flag.id, { execute: true });
    results.push({ flag_id: flag.id, status: r.status, item_id: r.itemId ?? null });
    if (r.status === "auto_adopted" || r.status === "auto_adopted_partial") applied += 1;
  }
  summary.applied = applied;
  summary.counts.apply_results = results;
  const touchedItemIds = [...new Set(results.filter((r) => r.status === "auto_adopted" || r.status === "auto_adopted_partial").map((r) => r.item_id))];
  summary.note =
    `Auto-adopted ${applied}/${eligible.length} eligible flag(s) at/above threshold "${AUTO_ADOPT_THRESHOLD}" ` +
    `(${belowThreshold.length} open flag(s) below threshold left untouched). Discovery NOT re-run by this ` +
    "step (orchestration only, per this file's header) — fallback: node scripts/connections/" +
    `discover-for-items.mjs --ids ${touchedItemIds.join(",") || "<item id(s)>"} --execute.`;

  const readBack = {};
  for (const itemId of touchedItemIds) {
    const { data } = await deps.readItem(itemId);
    readBack[itemId] = data
      ? {
          operational_scenario_tags: data.operational_scenario_tags,
          compliance_object_tags: data.compliance_object_tags,
          topic_tags: data.topic_tags,
        }
      : null;
  }
  summary.read_back = readBack;

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "tag-ratification",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readClient, guardedUpdate } = await import("../lib/db.mjs");
      const sb = readClient();
      return {
        listResolvedCandidates: async () => {
          const rows = [];
          for (let from = 0; ; from += 1000) {
            const { data, error } = await sb
              .from("integrity_flags")
              .select(FLAG_COLUMNS)
              .eq("status", "resolved")
              .like("created_by", `${TAG_NAMESPACE}%`)
              .order("id")
              .range(from, from + 999);
            if (error) throw new Error(`tag-ratification: candidate read failed: ${error.message}`);
            rows.push(...(data ?? []));
            if (!data || data.length < 1000) break;
          }
          return rows;
        },
        listOpenCandidates: async () => {
          const rows = [];
          for (let from = 0; ; from += 1000) {
            const { data, error } = await sb
              .from("integrity_flags")
              .select(FLAG_COLUMNS)
              .eq("status", "open")
              .like("created_by", `${TAG_NAMESPACE}%`)
              .order("id")
              .range(from, from + 999);
            if (error) throw new Error(`tag-ratification: open-candidate read failed: ${error.message}`);
            rows.push(...(data ?? []));
            if (!data || data.length < 1000) break;
          }
          return rows;
        },
        readFlag: (id) => sb.from("integrity_flags").select("*").eq("id", id).maybeSingle(),
        readItem: (id) =>
          sb
            .from("intelligence_items")
            .select("id, operational_scenario_tags, compliance_object_tags, topic_tags")
            .eq("id", id)
            .maybeSingle(),
        updateItem: async (id, patch) => {
          const res = await guardedUpdate("intelligence_items", (qb) => qb.eq("id", id), patch, { cite: CITE });
          return { updated: res.updated, snapshot: res.snapshot };
        },
        resolveFlag: async (id, note) => {
          const res = await guardedUpdate(
            "integrity_flags",
            (qb) => qb.eq("id", id),
            { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "apply-tags.mjs", resolution_note: note },
            { cite: CITE },
          );
          return { updated: res.updated, snapshot: res.snapshot };
        },
      };
    },
  });
}

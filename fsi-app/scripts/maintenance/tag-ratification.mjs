// tag-ratification.mjs — MAINT dispatch step: applies operator-ratified TAG proposals.
//
// UPSTREAM: BOTH HALVES ALREADY EXIST. scripts/connections/propose-tags.mjs reflects derive-tags.mjs
// candidates as integrity_flags rows (TAG_NAMESPACE, "flywheel-tag:") for an operator to review;
// scripts/connections/apply-tags.mjs is ALREADY the apply half — it requires the flag to be
// status='resolved' with resolution_note carrying the `ratify:tags` marker (evaluateApplication),
// then merges the proposed tags onto the target item through guardedUpdate (rule 015) via its
// exported, DB-injected applyTags() core. This step does not rebuild that logic (the brief's
// "if the existing code has no apply half, build the thinnest one" does not apply here — there is
// one); it is the missing coordinator-dispatch runtime for it, same posture as every other MAINT step.
//
// WHAT IT DOES.
//   Dry: reads every RESOLVED integrity_flags row in TAG_NAMESPACE, runs apply-tags.mjs's own
//   evaluateApplication() over each (PURE, imported unmodified), and lists which are actually
//   ratify-and-apply-ready (carry the ratify:tags marker + a parseable non-empty proposals list) vs.
//   resolved-but-not-ratified-for-tags (e.g. resolved for an unrelated reason). Writes nothing.
//   Apply: `arg` is REQUIRED — a comma-separated list of integrity_flags ids to apply this run (never
//   "apply everything ratified" from a single dispatch; the coordinator names exactly which proposals
//   land). Each id runs through apply-tags.mjs's applyTags({execute:true}) — merge-only tag write,
//   cited, snapshotted. DOES NOT re-run connection discovery (apply-tags.mjs's own optional step 6):
//   this wrapper orchestrates the guarded write only; the note below carries the documented fallback
//   command apply-tags.mjs itself prints for a skipped discovery re-run.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyTags, evaluateApplication } from "../connections/apply-tags.mjs";
import { TAG_NAMESPACE } from "../../src/lib/connections/flag-namespaces.mjs";
import { runCli } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "flywheel-build-plan-2026-08-10",
  reason:
    "MAINT tag-ratification dispatch (Lane MAINT, 2026-09-02): applies an operator-ratified " +
    "(resolution_note contains 'ratify:tags') derive-tags.mjs proposal through scripts/connections/" +
    "apply-tags.mjs's own guarded applyTags() — orchestration only, no logic reimplemented.",
});

const FLAG_COLUMNS = "id, subject_ref, created_by, status, resolved_by, resolution_note, description";

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{
 *   listResolvedCandidates: () => Promise<object[]>,
 *   readFlag: (id:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   readItem: (id:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   updateItem: (id:string, patch:object) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
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
      };
    },
  });
}

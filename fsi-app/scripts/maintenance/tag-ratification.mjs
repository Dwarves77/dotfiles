// SHARED-WRITER: intelligence_items, integrity_flags
// tag-ratification.mjs - MAINT dispatch step: decides every open flywheel-tag proposal by rule
// (operator ruling 2026-09-03, see apply-tags.mjs's header for the full reasoning). There is one
// behaviour and no `arg`: the legacy operator path (ratify:tags marker, comma-separated id list) was
// deleted by lane G6-GATES, 2026-10-05, because nothing in the data machine waits on a typed token or a
// human resolution. A stray `arg` is ignored.
//
// UPSTREAM: ALL THE LOGIC ALREADY EXISTS IN apply-tags.mjs. scripts/connections/propose-tags.mjs
// reflects derive-tags.mjs candidates as integrity_flags rows (TAG_NAMESPACE, "flywheel-tag:");
// apply-tags.mjs carries the auto-adoption path (evaluateAutoAdoption/autoAdoptTags: status='open',
// every proposal decided). This step does not rebuild it, it is the dispatch runtime for it.
//
// WHAT IT DOES. Dry: lists every open TAG_NAMESPACE flag, runs each through autoAdoptTags in dry mode
// and reports adopt/decline counts with a 20-row sample per outcome, plus the zero-proposal re-derive
// buckets. Apply: runs each through autoAdoptTags({execute:true}), which writes the adopted subset
// (merge-only), and resolves the flag. Eligibility is derive-tags.mjs's own deterministic evidence.
// IDEMPOTENT: an already-resolved flag is skipped by evaluateAutoAdoption's status==='open'
// requirement. Connection discovery is not re-run here (orchestration only); the note in each summary
// carries the documented fallback command.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateAutoAdoption, autoAdoptTags, AUTO_ADOPT_THRESHOLD, isZeroProposalFlag,
} from "../connections/apply-tags.mjs";
import { TAG_NAMESPACE } from "../../src/lib/connections/flag-namespaces.mjs";
import { runCli } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "flywheel-build-plan-2026-08-10",
  reason:
    "MAINT tag-ratification dispatch (Lane MAINT, 2026-09-02; auto-adoption per 2026-09-03 operator " +
    "ruling, the only path since 2026-10-05): decides every open derive-tags.mjs proposal through " +
    "scripts/connections/apply-tags.mjs's own guarded autoAdoptTags(), orchestration only, no logic " +
    "reimplemented.",
});

const FLAG_COLUMNS = "id, subject_ref, created_by, status, resolved_by, resolution_note, description";

/**
 * @param {{ mode?: "dry"|"apply" }} opts - a stray `arg` is ignored (the retired id path is gone)
 * @param {{
 *   listOpenCandidates: () => Promise<object[]>,
 *   readFlag: (id:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   readItem: (id:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   updateItem: (id:string, patch:object) => Promise<{updated:number, snapshot:string|null}>,
 *   resolveFlag: (id:string, note:string) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  return runAutoAdopt(mode === "apply", deps);
}

/**
 * The auto orchestration (2026-09-03 ruling): every OPEN TAG_NAMESPACE flag, evaluated for
 * auto-adoption eligibility via apply-tags.mjs's own evaluateAutoAdoption/partitionByConfidence (PURE,
 * imported unmodified), then — in apply mode — run through autoAdoptTags({execute:true}) one at a time.
 * No id list is required: eligibility is derive-tags.mjs's deterministic confidence evidence, not an
 * operator's per-flag judgment call, so "apply every eligible flag" is the intentional shape.
 * @param {boolean} apply
 * @param {{listOpenCandidates: Function, readFlag: Function, readItem: Function, updateItem: Function, resolveFlag: Function}} deps
 * @returns {Promise<object>} the same summary shape main() returns
 */
async function runAutoAdopt(apply, deps) {
  const summary = { step: "tag-ratification", mode: apply ? "apply" : "dry", counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  // Task 7.2 / ADR-030 rider (2026-09-12): every flywheel-tag proposal is DECIDED (adopt or decline),
  // never left as "below threshold" residue on an open flag -- see apply-tags.mjs's decideTagProposal.
  // D15 (2026-09-12, defect-fix-plan): a ZERO-proposal flag is decided too, never skipped -- routed
  // through the SAME autoAdoptTags() (it internally re-derives via reDeriveZeroProposalTags), so
  // "not adoptable" is limited to a genuinely malformed/foreign-namespace row.
  const openFlags = await deps.listOpenCandidates();
  const evaluated = openFlags.map((f) => ({ flag: f, decision: evaluateAutoAdoption(f), zeroProposal: isZeroProposalFlag(f) }));
  const decidable = evaluated.filter((e) => e.decision.ok);
  const zeroProposal = evaluated.filter((e) => !e.decision.ok && e.zeroProposal);
  const notAdoptable = evaluated.filter((e) => !e.decision.ok && !e.zeroProposal);

  summary.counts = {
    open_candidates: openFlags.length,
    threshold: AUTO_ADOPT_THRESHOLD,
    decidable_count: decidable.length,
    zero_proposal_count: zeroProposal.length,
    not_adoptable_count: notAdoptable.length,
  };

  // Dry output (spec: "adopt/decline counts and a 20-row sample per outcome") -- run every decidable
  // flag through autoAdoptTags in dry mode (execute:false -- reads only, no write) to surface the
  // per-proposal decision the coordinator reads before apply.
  const allDecisions = [];
  for (const { flag } of decidable) {
    const r = await autoAdoptTags(deps, flag.id, { execute: false, threshold: AUTO_ADOPT_THRESHOLD });
    if (Array.isArray(r.decisions)) {
      for (const d of r.decisions) allDecisions.push({ flag_id: flag.id, item_id: r.itemId, ...d });
    }
  }
  const adoptedSample = allDecisions.filter((d) => d.decision === "adopt");
  const declinedSample = allDecisions.filter((d) => d.decision === "decline");
  summary.counts.adopt_count = adoptedSample.length;
  summary.counts.decline_count = declinedSample.length;
  summary.counts.adopted_sample = adoptedSample.slice(0, 20);
  summary.counts.declined_sample = declinedSample.slice(0, 20);

  // D15 part 1 dry output (spec: "per outcome, re-derived-and-adopted, re-derived-and-declined, and
  // no-derivable-tags counts with a 20-row sample each").
  const rederivePreview = [];
  for (const { flag } of zeroProposal) {
    const r = await autoAdoptTags(deps, flag.id, { execute: false });
    rederivePreview.push({ flag_id: flag.id, item_id: r.itemId ?? null, outcome: r.outcome ?? "no_derivable" });
  }
  const rederivedAdopted = rederivePreview.filter((r) => r.outcome === "adopted");
  const rederivedDeclined = rederivePreview.filter((r) => r.outcome === "declined");
  const noDerivable = rederivePreview.filter((r) => r.outcome === "no_derivable");
  summary.counts.re_derived_and_adopted_count = rederivedAdopted.length;
  summary.counts.re_derived_and_declined_count = rederivedDeclined.length;
  summary.counts.no_derivable_tags_count = noDerivable.length;
  summary.counts.re_derived_and_adopted_sample = rederivedAdopted.slice(0, 20);
  summary.counts.re_derived_and_declined_sample = rederivedDeclined.slice(0, 20);
  summary.counts.no_derivable_tags_sample = noDerivable.slice(0, 20);

  if (!apply) return summary;

  let applied = 0;
  const results = [];
  for (const { flag } of decidable) {
    const r = await autoAdoptTags(deps, flag.id, { execute: true, threshold: AUTO_ADOPT_THRESHOLD });
    results.push({
      flag_id: flag.id, status: r.status, item_id: r.itemId ?? null,
      adopted: r.decisions?.filter((d) => d.decision === "adopt").length ?? 0,
      declined: r.decisions?.filter((d) => d.decision === "decline").length ?? 0,
    });
    if (r.status === "decided" || r.status === "decided_no_change") applied += 1;
  }

  // D15 part 1 apply: re-derive + decide + resolve every zero-proposal flag, same loop shape.
  const rederiveResults = [];
  for (const { flag } of zeroProposal) {
    const r = await autoAdoptTags(deps, flag.id, { execute: true });
    rederiveResults.push({ flag_id: flag.id, status: r.status, item_id: r.itemId ?? null, outcome: r.outcome ?? null });
    if (r.status === "re_derived_adopted" || r.status === "re_derived_no_change") applied += 1;
  }

  summary.applied = applied;
  summary.counts.apply_results = results;
  summary.counts.rederive_apply_results = rederiveResults;
  const touchedItemIds = [
    ...new Set([
      ...results.filter((r) => r.status === "decided").map((r) => r.item_id),
      ...rederiveResults.filter((r) => r.status === "re_derived_adopted").map((r) => r.item_id),
    ]),
  ];
  summary.note =
    `Decided ${applied}/${decidable.length + zeroProposal.length} open flag(s) at threshold "${AUTO_ADOPT_THRESHOLD}" ` +
    `(${zeroProposal.length} of them zero-proposal, re-derived per D15); every flag closed (no residue stays ` +
    "open, task 7.2 / D15). Discovery NOT re-run by this step (orchestration only, per this file's header); " +
    `fallback: node scripts/connections/discover-for-items.mjs --ids ${touchedItemIds.join(",") || "<item id(s)>"} --execute.`;

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
        // Widened 2026-09-12 (task 7.2): the auto path re-checks a medium-confidence proposal's keyword
        // evidence against the item's own title/what_is_it/summary/full_brief (apply-tags.mjs's
        // decideTagProposal), not just its tag arrays.
        // Widened again 2026-09-12 (D15 part 1): canonical_instrument_key added so a zero-proposal flag's
        // re-derivation (reDeriveZeroProposalTags) sees the same "high"-confidence identity field
        // deriveTags() reads.
        readItem: (id) =>
          sb
            .from("intelligence_items")
            .select("id, operational_scenario_tags, compliance_object_tags, topic_tags, title, canonical_instrument_key, what_is_it, summary, full_brief")
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

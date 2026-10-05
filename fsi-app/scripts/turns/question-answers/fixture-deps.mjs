// fixture-deps.mjs: the in-memory database the question export and apply run over with --fixture <corpus.json>
// (lane L4-B). Built on the theme-briefs fixture database (reads, guardedInsert, guardedUpdate over a plain
// { tables: { name: [rows] } } object), adding the two shapes the answer apply step needs that it does not
// have: guardedUpdateByIds (the id-list guarded update the flag close and outcome record use) and an `rpc`
// that behaves like register_inference_record (migration 339): one inference_records row, refusing what the
// table's CHECKs refuse (status token, confidence range, empty cited_item_ids, origin class).
//
// It does NOT model RLS, triggers, snapshots or derivation_edges. The tests use it too, so what the CLIs do
// under --fixture is what the tests prove.

import { fixtureDeps as baseFixtureDeps } from "../theme-briefs/fixture-deps.mjs";

const STATUS = ["CONFIRMED", "HYPOTHESIS", "REFUTED"];
const ORIGINS = ["derived", "modelled"];

/**
 * @param {{tables:Record<string,object[]>, missing_columns?:Record<string,string[]>}} corpus
 */
export function fixtureDeps(corpus) {
  const base = baseFixtureDeps(corpus);
  let seq = 0;

  async function guardedUpdateByIds(table, ids, patch, { applyMatch = null, idColumn = "id" } = {}) {
    const list = [...new Set(ids ?? [])];
    if (!list.length) return { updated: 0, rows: [], snapshots: [], chunks: 0, halvings: 0, snapshot: null };
    const r = await base.guardedUpdate(table, (q) => { q.in(idColumn, list); if (applyMatch) applyMatch(q); }, patch);
    return { ...r, snapshots: [r.snapshot], chunks: 1, halvings: 0 };
  }

  /** The Supabase rpc surface registerInferenceRecord needs. */
  const client = {
    async rpc(fn, args) {
      if (fn !== "register_inference_record") return { data: null, error: { message: `fixture rpc: unknown function ${fn}` } };
      if (!STATUS.includes(args.p_status_token)) return { data: null, error: { message: "check constraint inference_records_status_token_check" } };
      if (!(args.p_confidence >= 0 && args.p_confidence <= 1)) return { data: null, error: { message: "check constraint confidence" } };
      if (!Array.isArray(args.p_cited_item_ids) || args.p_cited_item_ids.length === 0) return { data: null, error: { message: "check constraint cited_item_ids cardinality" } };
      if (!ORIGINS.includes(args.p_origin_class)) return { data: null, error: { message: "check constraint origin_class" } };
      seq += 1;
      const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
      const rows = base.tables.inference_records ?? (base.tables.inference_records = []);
      rows.push({
        inference_id: id, subject_id: args.p_subject_id ?? null, claim_text: args.p_claim_text, status_token: args.p_status_token,
        confidence: args.p_confidence, cited_item_ids: args.p_cited_item_ids, origin_class: args.p_origin_class,
        supersedes: args.p_supersedes ?? null, trigger_question_ref: args.p_trigger_question_ref ?? null,
        method_id: args.p_method_id, method_version: args.p_method_version, computed_by: args.p_computed_by,
        computed_at: new Date(Date.UTC(2026, 9, 5, 0, 0, seq)).toISOString(),
      });
      return { data: id, error: null };
    },
  };

  return { ...base, guardedUpdateByIds, rpcClient: () => client };
}

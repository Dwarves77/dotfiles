// logic.mjs , the testable core of the admin item-corrections API (lane G7-CORR, 2026-10-06). A route.ts may
// export only handlers (F34), so the orchestration lives here: portable (node: builtins and relative imports
// only), the Supabase client injected, no auth (the route's requireAdminRoute gate runs first).
//
// API CONTRACT (for lane G7-UI). All three routes are platform-admin only (requireAdminRoute: 401 no token,
// 429 rate limited, 403 not a platform admin) and carry the rate-limit headers.
//
//   GET  /api/admin/items/{itemId}/corrections
//     200 { item_id, counts: { active, revoked, orphaned }, corrections: [ {
//             id, item_id, target_kind, target_ref, op, value, machine_value, reason,
//             created_by, created_at, revoked_at, revoked_by, revoked_reason,
//             active: boolean,                  // revoked_at is null
//             superseded: boolean,              // active but not the latest active for its target
//             orphaned: boolean,                // an ACTIVE fact correction that matches no current claim of the
//                                               // item (by claim id, original machine text or corrected text);
//                                               // a regeneration changed or removed the claim. Never re-matched
//                                               // automatically; the screen shows it for a human to revoke or redo
//             latest_machine_value: any|null,   // what a writer last tried to store where this correction overrode it
//             machine_observed_count: number,   // how many times, 0 when never observed
//             machine_observed_at: string|null
//           } ] }                                // newest first
//     400 { error, code: "item_id_invalid" }   404 { error, code: "item_not_found" }
//
//   POST /api/admin/items/{itemId}/corrections
//     body { target_kind: "fact"|"tag"|"connection"|"section_text"|"full_brief",
//            target_ref: string,                // fact: claim id; tag: "<column>:<tag>"; connection: other item id;
//                                               // section_text: section_key; full_brief: "full_brief"
//            op: "suppress"|"add"|"remove"|"replace",   // allowed ops per kind: fact suppress|replace, tag add|remove, connection add|remove, section_text and full_brief replace
//            value?: object,                    // replace: full_brief {text}, section_text {content_md},
//                                               // fact {source_span, search_result_id, claim_text?, source_id?};
//                                               // connection add {relationship?}
//            reason: string }                   // mandatory, non-empty after trim
//     created_by is NEVER read from the body; it is the session user.
//     201 { id, item_id, applied: true }
//     400 { error, code }  code in reason_required, target_kind_invalid, op_invalid, target_ref_required,
//                          target_ref_invalid, value_invalid, fact_needs_span, item_id_invalid, invalid_json
//     404 { error, code }  code in item_not_found, claim_not_found, section_not_found
//     422 { error, code }  the database refused: fact_span_not_verbatim, fact_failed_validation, tag_ref_invalid,
//                          connection_ref_invalid, fact_not_a_fact_claim, value_invalid ...
//     500 { error, code: "database_error" }
//
//   POST /api/admin/items/{itemId}/corrections/{correctionId}/revoke
//     body { reason?: string }
//     200 { id, item_id, revoked: true }
//     400 { error, code: "item_id_invalid" | "correction_id_invalid" }   409 { error, code: "correction_not_active" }
//     Revoking RESTORES the machine value in the same transaction (see the migration header): the latest value a
//     writer tried to store, else the value captured at correction time, written through the normal row write.
//     A revoked connection tombstone does not re-create the edge; the next discovery pass may.
//   Fact `add` is NOT offered (a claim belongs to a section; add a fact by replacing the section text).
//   Suppress hides the claim from customers everywhere it renders (rating chip, section text, full brief, the
//   Assistant) at read time; stored text is never touched.
import { findOrphanedFactCorrections, latestPerTarget, validateCorrectionInput } from "../item-corrections.mjs";
import { fetchAllByIdChunks } from "../../db/paginate.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reply = (status, body) => ({ status, body });
const fail = (status, code, error) => reply(status, { error, code });

/** Map a database exception (the RAISE text starts with a correction_* code) to an HTTP status and code. */
export function mapDbError(error) {
  const message = String(error?.message ?? "");
  const m = /^correction_([a-z_]+)/.exec(message);
  if (!m) return fail(500, "database_error", message || "database error");
  const code = m[1];
  const detail = message.replace(/^correction_[a-z_]+:\s*/, "");
  if (code === "item_not_found" || code === "claim_not_found" || code === "section_not_found") return fail(404, code, detail);
  if (code === "not_active") return fail(409, "correction_not_active", detail);
  if (code === "reason_required" || code === "actor_required") return fail(400, code, detail);
  return fail(422, code, detail);
}

/** GET: every correction of one item with its machine value and active state. */
export async function listCorrections(sb, itemId) {
  if (!UUID_RE.test(String(itemId))) return fail(400, "item_id_invalid", "item id must be a uuid");
  const { data: item, error: itemErr } = await sb.from("intelligence_items").select("id").eq("id", itemId).maybeSingle();
  if (itemErr) return fail(500, "database_error", itemErr.message);
  if (!item) return fail(404, "item_not_found", `no item ${itemId}`);

  const { data: rows, error } = await sb.from("item_corrections").select("*").eq("item_id", itemId);
  if (error) return fail(500, "database_error", error.message);
  const corrections = rows ?? [];

  const evidenceById = new Map();
  if (corrections.length) {
    try {
      const ev = await fetchAllByIdChunks(corrections.map((c) => c.id), async (slice) => {
        // fitness-allow: F39 (slice is one fetchAllByIdChunks chunk, bounded by its own chunk size)
        const { data, error: evErr } = await sb.from("item_correction_evidence").select("*").in("correction_id", slice);
        if (evErr) throw new Error(evErr.message);
        return data ?? [];
      });
      for (const e of ev) evidenceById.set(e.correction_id, e);
    } catch (e) {
      return fail(500, "database_error", e instanceof Error ? e.message : String(e));
    }
  }

  // Current claims of the item, to find active fact corrections that match no claim any more (orphaned).
  const { data: claimRows, error: claimErr } = await sb.from("section_claim_provenance").select("id, claim_text").eq("intelligence_item_id", itemId);
  if (claimErr) return fail(500, "database_error", claimErr.message);
  const orphanIds = new Set(findOrphanedFactCorrections(corrections, claimRows ?? []).map((c) => c.id));

  const latestIds = new Set([...latestPerTarget(corrections).values()].map((r) => r.id));
  const shaped = corrections
    .map((c) => {
      const active = c.revoked_at === null || c.revoked_at === undefined;
      const e = evidenceById.get(c.id);
      return {
        ...c,
        active,
        superseded: active && !latestIds.has(c.id),
        orphaned: orphanIds.has(c.id),
        latest_machine_value: e ? e.latest_machine_value ?? null : null,
        machine_observed_count: e ? e.observed_count ?? 0 : 0,
        machine_observed_at: e ? e.observed_at ?? null : null,
      };
    })
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  const active = shaped.filter((c) => c.active).length;
  return reply(200, {
    item_id: itemId,
    counts: { active, revoked: shaped.length - active, orphaned: orphanIds.size },
    corrections: shaped,
  });
}

/** POST create. `userId` is the authenticated session user; the body's created_by (if any) is ignored. */
export async function createCorrection(sb, { itemId, userId, body }) {
  if (!UUID_RE.test(String(itemId))) return fail(400, "item_id_invalid", "item id must be a uuid");
  const v = validateCorrectionInput(body);
  if (!v.ok) return fail(400, v.code, v.error);
  const { input } = v;
  const { data, error } = await sb.rpc("create_item_correction", {
    p_item_id: itemId,
    p_target_kind: input.target_kind,
    p_target_ref: input.target_ref,
    p_op: input.op,
    p_value: input.value,
    p_reason: input.reason,
    p_created_by: userId,
  });
  if (error) return mapDbError(error);
  return reply(201, { id: data, item_id: itemId, applied: true });
}

/** POST revoke. */
export async function revokeCorrection(sb, { itemId, correctionId, userId, body }) {
  if (!UUID_RE.test(String(itemId))) return fail(400, "item_id_invalid", "item id must be a uuid");
  if (!UUID_RE.test(String(correctionId))) return fail(400, "correction_id_invalid", "correction id must be a uuid");
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const { error } = await sb.rpc("revoke_item_correction", {
    p_item_id: itemId,
    p_correction_id: correctionId,
    p_revoked_by: userId,
    p_reason: reason || null,
  });
  if (error) return mapDbError(error);
  return reply(200, { id: correctionId, item_id: itemId, revoked: true });
}


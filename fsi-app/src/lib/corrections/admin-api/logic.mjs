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


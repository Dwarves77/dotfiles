/** hold-queue.mjs — the Phase E hold-resolution queue interface (E3 increment 1; migration 207).
 *  holds-are-conveyor-not-parking (RD-42): a held entity is a ROW with a state + per-mechanism attempt log;
 *  the loop enqueues on entry, records each rung's outcome, exits on resolution, escalates at an evidenced
 *  dead end. enqueue is idempotent (one ACTIVE row per entity+class); recordAttempt auto-escalates on the same
 *  mechanism failing twice (cycle safety, no infinite seek loops). Thin wrappers over the SQL functions.
 */
export const HOLD_CLASSES = ['mint_gate_conflate', 's_numeric_soft', 'floor', 'hold_to_find', 'quarantine_next_action'];

/** Enqueue a held entity (idempotent). Returns the queue row id. */
export async function enqueue(sb, { entityType, entityRef, holdClass, nextAction = null }) {
  const { data, error } = await sb.rpc('hrq_enqueue', { p_entity_type: entityType, p_entity_ref: entityRef, p_hold_class: holdClass, p_next_action: nextAction });
  if (error) throw new Error(`hrq_enqueue: ${error.message}`);
  return data;
}

/** Record a resolution-rung attempt; returns 'recorded' or 'escalated' (auto cycle-safety escalation). */
export async function recordAttempt(sb, id, mechanism, outcome) {
  const { data, error } = await sb.rpc('hrq_record_attempt', { p_id: id, p_mechanism: mechanism, p_outcome: outcome });
  if (error) throw new Error(`hrq_record_attempt: ${error.message}`);
  return data;
}

/** Exit the hold (resolved). */
export async function exit(sb, id, reason = null) {
  const { error } = await sb.rpc('hrq_exit', { p_id: id, p_reason: reason });
  if (error) throw new Error(`hrq_exit: ${error.message}`);
}

/** Escalate to operator (evidenced dead end). */
export async function escalate(sb, id, reason) {
  const { error } = await sb.rpc('hrq_escalate', { p_id: id, p_reason: reason });
  if (error) throw new Error(`hrq_escalate: ${error.message}`);
}

/** The active work list (queued/seeking/grounding), oldest first. */
export async function listActive(sb, { limit = 100 } = {}) {
  const { data, error } = await sb.from('hold_resolution_queue').select('*').in('state', ['queued', 'seeking', 'grounding']).order('created_at', { ascending: true }).limit(limit);
  if (error) throw new Error(`listActive: ${error.message}`);
  return data || [];
}

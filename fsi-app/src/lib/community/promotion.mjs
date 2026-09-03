// promotion.mjs — the five-gate promotion state machine, transitions logged (spec 05 §4, required
// component 6). PURE. No database — `promotionState` replays an authoritative, already-logged transition
// list; `buildTransition` validates and constructs the NEXT transition a caller wants to log (the actual
// INSERT into `community_promotion_transitions`, migration 295, is the caller's job — this module never
// writes).
//
// FIVE STATES (spec 05 §4): community -> community-corroborated -> under-review -> verified, with
// `retired` reachable from any non-terminal state (a tombstone, never a deletion — spec 05 §4 gate 5).
// States are PUBLICLY VISIBLE by design ("a trust-builder rather than an embarrassment", spec 05 §4 gate
// 3) — nothing here hides a state, it only governs which NEXT state is legal.
//
// origin_class RELATIONSHIP (spec 00 §3.6's 7-value vocabulary is protected — Addendum 26, "NO widening
// of the origin_class... vocabulary" — and does not carry `under-review`/`retired`). promotion_state and
// origin_class are deliberately TWO different columns: promotion_state is this thread's own workflow
// state (5 values, this module's vocabulary); origin_class is the shared cross-surface provenance label
// (7 values, src/lib/contracts/vocabularies.mjs ORIGIN_CLASS) applied to the CONTENT this thread produces.
// `originClassFor(state)` below is the ONE place that maps one onto the other, and it is a partial map on
// purpose: `under-review` and `retired` do not change origin_class (the content keeps whatever
// classification it last earned — going under review does not un-corroborate it, and retiring it leaves
// the tombstone's origin_class exactly where it was, alongside the correction).

/** Legal next states from each current state. `retired` is terminal (no outbound edges) — once
 * tombstoned, a thread's promotion history is closed; a NEW thread supersedes it if the topic continues. */
const TRANSITIONS = Object.freeze({
  community: Object.freeze(["community-corroborated", "retired"]),
  "community-corroborated": Object.freeze(["under-review", "retired"]),
  "under-review": Object.freeze(["community-corroborated", "verified", "retired"]),
  verified: Object.freeze(["retired"]),
  retired: Object.freeze([]),
});

export const PROMOTION_STATES = Object.freeze(Object.keys(TRANSITIONS));

/** Partial map, promotion_state -> origin_class (spec 00 §3.6's 7-value vocabulary). Absent key means
 * "no change" — see file header. */
const ORIGIN_CLASS_FOR_STATE = Object.freeze({
  community: "community",
  "community-corroborated": "community-corroborated",
  verified: "verified",
});

/**
 * @param {string} state - a promotion_state value
 * @returns {string|null} the origin_class this state maps to, or null when this state does not itself
 *   change origin_class (under-review, retired — see file header).
 */
export function originClassFor(state) {
  return ORIGIN_CLASS_FOR_STATE[state] ?? null;
}

/**
 * Replays a thread's logged transitions to the current state. Does not trust a stored "current state"
 * column over the log — the log is authoritative, matching spec 05 §4 gate 3's "transitions logged"
 * requirement (a state with no transition behind it did not legitimately happen).
 *
 * @param {{ transitions?: Array<{ from: string, to: string, actor?: string, reason?: string, occurredAt?: string }> }} thread
 * @returns {{ state: string, transitions: Array<object>, valid: boolean, invalidReason: string|null }}
 */
export function promotionState(thread) {
  const transitions = Array.isArray(thread?.transitions) ? thread.transitions : [];
  let state = "community";
  let valid = true;
  let invalidReason = null;

  for (const [i, t] of transitions.entries()) {
    if (t.from !== state) {
      valid = false;
      invalidReason = `transition ${i} claims from="${t.from}" but the thread was in "${state}"`;
      break;
    }
    const legal = TRANSITIONS[state] ?? [];
    if (!legal.includes(t.to)) {
      valid = false;
      invalidReason = `transition ${i}: "${state}" -> "${t.to}" is not a legal move`;
      break;
    }
    state = t.to;
  }

  return { state, transitions, valid, invalidReason };
}

/**
 * Validate and construct the NEXT transition (does not mutate `thread`, does not write anywhere — the
 * caller logs the returned transition). Enforces acceptance criterion 2 (spec 05 §6): a jump to
 * `verified` is refused without an editor actor AND a primary-source provenance chain.
 *
 * @param {{ transitions?: Array<object> }} thread
 * @param {string} toState
 * @param {{ actor: { userId: string, role?: string }, reason: string, provChain?: string|null, corroboration?: {consistent: boolean}, now?: Date }} opts
 * @returns {{ ok: true, transition: object } | { ok: false, error: string }}
 */
export function buildTransition(thread, toState, opts) {
  const { actor, reason, provChain = null, corroboration = null, now = new Date() } = opts ?? {};
  if (!actor || !actor.userId) {
    return { ok: false, error: "a transition requires an authenticated actor" };
  }
  if (!reason || !String(reason).trim()) {
    return { ok: false, error: "a transition requires a logged reason" };
  }
  if (!PROMOTION_STATES.includes(toState)) {
    return { ok: false, error: `"${toState}" is not a promotion state` };
  }

  const current = promotionState(thread);
  if (!current.valid) {
    return { ok: false, error: `thread's existing transition log is invalid: ${current.invalidReason}` };
  }

  const legal = TRANSITIONS[current.state] ?? [];
  if (!legal.includes(toState)) {
    return { ok: false, error: `"${current.state}" -> "${toState}" is not a legal move` };
  }

  // Gate 2 (community -> community-corroborated): only legitimate once corroborationCount says the
  // thread is actually consistent (spec 05 §4 gate 2). A caller attempting this transition without
  // supplying the corroboration evidence, or with a thread that has not met it, is refused.
  if (current.state === "community" && toState === "community-corroborated") {
    if (!corroboration || corroboration.consistent !== true) {
      return { ok: false, error: "community-corroborated requires corroborationCount(thread).consistent === true" };
    }
  }

  // Acceptance criterion 2 (spec 05 §6): no path to `verified` without an editor action AND a
  // primary-source PROV chain.
  if (toState === "verified") {
    if (actor.role !== "editor") {
      return { ok: false, error: "verified requires an editor actor" };
    }
    if (!provChain || !String(provChain).trim()) {
      return { ok: false, error: "verified requires a primary-source provenance chain reference" };
    }
  }

  const transition = {
    from: current.state,
    to: toState,
    actorUserId: actor.userId,
    actorRole: actor.role ?? null,
    reason: String(reason).trim(),
    provChain: toState === "verified" ? String(provChain).trim() : null,
    occurredAt: now.toISOString(),
  };

  return { ok: true, transition };
}

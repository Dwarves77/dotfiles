import type { MethodFn, MethodContext, MethodResult } from "./index.ts";
import type { Lifecycle } from "../types.ts";

export const METHOD_ID = "signpost_watch";
export const METHOD_VERSION = "1.0.0";

// ── Predicate evaluation (pure) ───────────────────────────────────────────────────────────────────────

/** The three predicate shapes signposts.predicate's `predicate_is_evaluable` CHECK admits (migration 346,
 *  spec 08 section 1.2's own comment). */
type SignpostPredicate = (
  | { op: "date_passed"; field: string }
  | { op: "threshold"; metric: string; gte: number }
  | { op: "count_gte"; relation: string; n: number }
) & {
  /** Optional expectation date (ISO date). A signpost that has not fired by the end of this day is scored
   *  refuted by src/lib/learning/prediction-scoring.mjs (lane L4-D). Any other key is carried, not read. */
  by?: string;
};

/** The signpost's own row, as `ctx.priorValue` carries it (this lane's own convention -- see header). */
interface SignpostRow {
  entityId: string;
  assessmentId: string;
  watches: string;
  predicate: SignpostPredicate;
  direction: "confirms" | "refutes" | "delays";
  firedAt: string | null;
}

/**
 * Evaluate one signpost's predicate against the resolved watched-entity row. PURE -- no I/O, no clock
 * read beyond the `now` the caller supplies (mirrors every other pure function in this engine:
 * effective-confidence.mjs, admissible-for.ts).
 * @param {SignpostPredicate} predicate
 * @param {Record<string, unknown> | null} watchedRow -- the resolved attribute row for `signposts.watches`,
 *   or null if unresolvable (mirrors drain.ts's own ResolvedMethodInput.row contract).
 * @param {Date} now
 * @returns {{fired: boolean; reason: string}}
 */
export function evaluateSignpostPredicate(
  predicate: SignpostPredicate,
  watchedRow: Record<string, unknown> | null,
  now: Date,
): { fired: boolean; reason: string } {
  if (!watchedRow) {
    return { fired: false, reason: "watched entity's attribute row could not be resolved" };
  }
  switch (predicate.op) {
    case "date_passed": {
      const raw = watchedRow[predicate.field];
      if (typeof raw !== "string" && !(raw instanceof Date)) {
        return { fired: false, reason: `field "${predicate.field}" is not a date on the watched row` };
      }
      const fieldDate = raw instanceof Date ? raw : new Date(raw);
      if (Number.isNaN(fieldDate.getTime())) {
        return { fired: false, reason: `field "${predicate.field}" did not parse as a date` };
      }
      return fieldDate.getTime() <= now.getTime()
        ? { fired: true, reason: `${predicate.field} (${fieldDate.toISOString()}) has passed` }
        : { fired: false, reason: `${predicate.field} (${fieldDate.toISOString()}) has not passed yet` };
    }
    case "threshold": {
      const raw = watchedRow[predicate.metric];
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return { fired: false, reason: `metric "${predicate.metric}" is not a finite number on the watched row` };
      }
      return raw >= predicate.gte
        ? { fired: true, reason: `${predicate.metric}=${raw} >= ${predicate.gte}` }
        : { fired: false, reason: `${predicate.metric}=${raw} < ${predicate.gte}` };
    }
    case "count_gte": {
      // The generic contract: a resolved row carries a count under `<relation>_count` (e.g. a
      // `implements_count` column/alias the caller's own query shaped). Named, not fabricated -- a
      // relation this method cannot find a count for refuses rather than guessing.
      const key = `${predicate.relation}_count`;
      const raw = watchedRow[key];
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return { fired: false, reason: `"${key}" is not a finite number on the watched row` };
      }
      return raw >= predicate.n
        ? { fired: true, reason: `${key}=${raw} >= ${predicate.n}` }
        : { fired: false, reason: `${key}=${raw} < ${predicate.n}` };
    }
    default: {
      // Exhaustiveness guard -- predicate_is_evaluable's CHECK only enforces `predicate ? 'op'` at the DB
      // layer (an arbitrary op string is legal SQL), so an unrecognised op is an ordinary, expected
      // refusal here, never a thrown error (spec section 2.2 Part 3's "no method registered yet"-shaped
      // outcome for a self-refusing method).
      return { fired: false, reason: `unrecognised predicate op "${(predicate as { op: string }).op}"` };
    }
  }
}

/**
 * Spec 08 section 3.1's lifecycle table, read for the ONE row it names a signpost as the trigger:
 * "any -> falsified ... or a signpost fires `refutes`". The other two directions are this lane's own
 * named extension of that table (documented, not silently assumed -- CLAUDE.md rule 14):
 *   - `confirms` is the signpost-equivalent of "a corroborating origin" (the table's own emerging ->
 *     strengthening and strengthening -> corroborated rows) -- it advances ONE step along that chain.
 *     It NEVER auto-promotes to `verified`: spec 08's table reserves that transition for "editor traces
 *     to primary source AND attaches a PROV chain", an action this autonomous watcher cannot perform
 *     without becoming exactly the editorial-approval gate the no-editorial-queue doctrine forbids.
 *   - `delays` has no literal row in spec 08's table, but the table's own ASCII diagram draws `stalled`
 *     as a branch off any main-chain state (the same shape as its `falsified`/`obsolete` branches) with
 *     no named trigger -- `delays` fills exactly that gap. [RULED 2026-10-02, coordinator, under
 *     ADR-039] this mapping is ratified, not left as an unverified extension.
 *   - `falsified`/`obsolete`/`superseded` are terminal for THIS function: once there, a further signpost
 *     firing is still recorded (fired_at, propagation_events) but does not move lifecycle_state again --
 *     spec 08's table gives no path back out of any of the three, and this watcher must never invent one.
 * PURE.
 * @param {Lifecycle} current
 * @param {"confirms" | "refutes" | "delays"} direction
 * @returns {Lifecycle}
 */
export function nextLifecycleState(current: Lifecycle, direction: "confirms" | "refutes" | "delays"): Lifecycle {
  if (current === "falsified" || current === "superseded" || current === "obsolete") return current; // terminal, checked first
  if (direction === "refutes") return "falsified"; // spec 08 S3.1: "any -> falsified ... a signpost fires `refutes`"
  if (direction === "delays") return "stalled"; // named extension, see header
  // direction === "confirms": advance one step, never past "corroborated" (verified needs an editor+PROV).
  if (current === "emerging") return "strengthening";
  if (current === "strengthening") return "corroborated";
  return current; // corroborated, verified, stalled: a confirming signpost does not move these further.
}

/** `computeSignpostWatch` -- the registered `MethodFn`. See this file's header, half 1. `ctx.priorValue`
 *  is the signpost's own current row (this lane's convention, since signposts are never drain.ts's
 *  `derived_values`/`inference_records` stale-row shape); `ctx.inputs` carries the resolved watched-entity
 *  attribute row at `inputs[0].row`, same `ResolvedMethodInput` contract every other method in this
 *  directory already uses. */
export const computeSignpostWatch: MethodFn = (ctx: MethodContext): MethodResult => {
  const signpost = ctx.priorValue as SignpostRow | null;
  if (!signpost) return { ok: false, reason: "no signpost row supplied as priorValue" };

  const watchedRow = (ctx.inputs.find((i) => i.table !== "signposts")?.row ?? null) as Record<string, unknown> | null;
  const { fired, reason } = evaluateSignpostPredicate(signpost.predicate, watchedRow, ctx.now);

  if (!fired) {
    return { ok: false, reason };
  }

  // A fired signpost is represented through the SAME MethodResult shape every other method in this
  // registry returns, so a future drain-dispatch extension (not this lane's job) has a real, typed
  // result to write. `lifecycle` here describes the SIGNPOST's own resolved state (verified: the
  // predicate check ran against a real resolved row), never the assessment's lifecycle_state -- that
  // transition is `fireSignpost`'s job (half 2), executed with a real `sb` client, never inferred from a
  // pure MethodResult.
  return {
    ok: true,
    value: 1, // fired = 1, matching this registry's numeric-result convention; never consumed as a unit
    unit: null,
    derivation: "observed",
    originClass: "derived",
    lifecycle: watchedRow ? "verified" : "corroborated",
    admissibility: "analysis_ok",
    confidence: 1,
    halfLifeDays: null,
  };
};

// ── fireSignpost -- the sb-driven write path (half 2, see header) ───────────────────────────────────────

/** The narrow client surface `fireSignpost` needs -- a strict subset of `DrainClient`
 *  (`src/lib/propagation/drain.ts`), so the SAME fake-client test doubles that module's own tests use
 *  satisfy this one too, with zero npm dependency. */
export interface SignpostFireClient {
  from(table: string): {
    update(values: Record<string, unknown>): { eq(col: string, value: unknown): Promise<{ data: unknown; error: { message: string } | null }> };
    insert(values: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
    select(cols: string, opts?: { count?: "exact"; head?: boolean }): {
      eq(col: string, value: unknown): Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

interface FireSignpostResult {
  fired: true;
  signpostEntityId: string;
  propagationEventWritten: boolean;
  previousLifecycleState: Lifecycle;
  newLifecycleState: Lifecycle;
}

/**
 * Fire a signpost that `computeSignpostWatch` (or an equivalent caller-side check) has already determined
 * should fire. Three sequential, named steps through `sb` -- NOT one atomic transaction (no RPC function
 * was in this migration's authorized write set; see migration 346's header for why). Idempotent on step 1
 * (`fired_at` is set only if currently null -- a second call against an already-fired signpost still
 * performs steps 2/3, since a re-evaluation after the watched entity changes again is a new event, not a
 * duplicate of the first).
 *
 * ZERO EDITORIAL-APPROVAL AFFORDANCE: this function takes no "approve"/"reject"/"pending" parameter and
 * exposes no gate between a true predicate verdict and the write -- the caller supplies the verdict
 * (`computeSignpostWatch`'s own `ok: true`), and firing proceeds unconditionally (doctrine
 * research-is-horizon-scan).
 *
 * @param {SignpostFireClient} sb
 * @param {object} args
 * @param {SignpostRow} args.signpost
 * @param {Lifecycle} args.currentLifecycleState -- the parent research_assessments row's current
 *   lifecycle_state, read by the caller before invoking this function (this function does not read it
 *   itself, to keep its own contract narrow and testable with a minimal fake client).
 * @param {Date} args.now
 * @returns {Promise<FireSignpostResult>}
 */
export async function fireSignpost(
  sb: SignpostFireClient,
  args: { signpost: SignpostRow; currentLifecycleState: Lifecycle; now: Date; reason?: string },
): Promise<FireSignpostResult> {
  const { signpost, currentLifecycleState, now } = args;
  const nowIso = now.toISOString();

  // Step 1: stamp the signpost's own fired_at (idempotent -- only if not already fired).
  if (!signpost.firedAt) {
    const { error } = await sb.from("signposts").update({ fired_at: nowIso }).eq("entity_id", signpost.entityId);
    if (error) throw new Error(`fireSignpost: stamping signposts.fired_at failed: ${error.message}`);
  }

  // Step 2: write a propagation_events row -- REUSE of the existing outbox table (migration 284), not a
  // second drain. A later drain.ts run picks this event up and walks the invalidation DAG from it.
  // Lane L4-D fixed two defects against migration 284's DDL (this insert would have failed at the database):
  //   - `change_kind` is NOT NULL with no default. The value that moved is the signpost's own `fired_at`
  //     (NULL to a timestamp), so the kind is "update" (the CHECK admits insert, update, delete, supersede),
  //     and `old_row` / `new_row` state which value changed and why (direction, predicate, the evaluator's reason).
  //   - `entity_id` is `text REFERENCES entities(entity_id)`. It used to be the assessment's uuid, which is
  //     not an entity. It is now the WATCHED entity, so the drain and the questions-on-change step can group
  //     this event with every other change to that entity. The signpost itself is `row_pk`.
  const { error: eventErr } = await sb.from("propagation_events").insert({
    table_name: "signposts",
    row_pk: signpost.entityId,
    entity_id: signpost.watches,
    change_kind: "update",
    old_row: { fired_at: signpost.firedAt ?? null },
    new_row: {
      fired_at: signpost.firedAt ?? nowIso,
      direction: signpost.direction,
      predicate: signpost.predicate,
      reason: args.reason ?? null,
    },
    occurred_at: nowIso,
  });
  const propagationEventWritten = !eventErr;
  if (eventErr) {
    throw new Error(`fireSignpost: writing propagation_events failed: ${eventErr.message}`);
  }

  // Step 3: transition the parent assessment's lifecycle_state, in the SAME pass (CLAUDE.md rule 17 --
  // "a watcher that fires and leaves the assessment's state untouched is exactly the defect rule 17
  // names"). See nextLifecycleState()'s own header for the transition table.
  const newLifecycleState = nextLifecycleState(currentLifecycleState, signpost.direction);
  const { error: assessmentErr } = await sb
    .from("research_assessments")
    .update({ lifecycle_state: newLifecycleState })
    .eq("id", signpost.assessmentId);
  if (assessmentErr) {
    throw new Error(`fireSignpost: updating research_assessments.lifecycle_state failed: ${assessmentErr.message}`);
  }

  return {
    fired: true,
    signpostEntityId: signpost.entityId,
    propagationEventWritten,
    previousLifecycleState: currentLifecycleState,
    newLifecycleState,
  };
}

// Pure decision for the manual fetch-now route — the FORM-1 (a fetch that FAILED TO ANSWER is
// INCONCLUSIVE, not "inaccessible") and FORM-3 (an error/bot-block BODY is not content) bug-class
// fixes, EXTRACTED so they fixture-test WITHOUT a DB or HTTP (the composition that the retired
// prod-touching sentinel harnesses used to assert against the live DB).
//
// last_checked is ALWAYS recorded by the caller; this returns only the EXTRA stamp + the kind +
// the HTTP status. No Date, no I/O — deterministic and pure.
import { classifyReachability, REACH } from "./reachability.mjs";
import { isErrorBody } from "./entity-gate.mjs";

export function decideFetchOutcome({ content, error } = {}) {
  if (error) {
    const status =
      typeof error?.status === "number" ? error.status
      : Number(String(error?.message || "").match(/\b(\d{3})\b/)?.[1]) || undefined;
    // `errored` is for a NETWORK error with no status (timeout/abort/dns) -> INCONCLUSIVE. When a
    // status IS present (e.g. a thrown 404), the STATUS drives — a 404 is definitive-dead even as
    // a throw, a 429/5xx is inconclusive even as a throw.
    if (classifyReachability({ status, errored: status === undefined }) === REACH.DEAD) {
      return { kind: "dead", httpStatus: 502, stamp: { inaccessible: true } };
    }
    return { kind: "inconclusive", httpStatus: 503, stamp: {} };
  }
  if (isErrorBody(content)) {
    return { kind: "inconclusive", httpStatus: 503, reason: "error-body", stamp: {} };
  }
  return { kind: "ok", httpStatus: 200, stamp: { accessible: true } };
}

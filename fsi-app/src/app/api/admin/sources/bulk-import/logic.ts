// Pure decision logic for POST /api/admin/sources/bulk-import, split out of route.ts (BUILDGATE,
// 2026-09-02, F34's named residual / build-graph proof). Next 16's route-type validator rejects a
// route.ts that exports anything besides route handlers/config fields, so the pure functions move
// to this sibling module and route.ts imports them. Behaviour is unchanged; only the file they
// live in moved.

import { classifyReachability, REACH } from "@/lib/sources/reachability.mjs";

// #6 CONSUMER DECISION — a head result -> the import's branch. THE BUG (pre-fix): a
// non-answer (headCheck status:'error' on a timeout, or a 429/5xx number) -> "reject", so a
// Browserless rate-limit/timeout dropped a real candidate before verifyCandidate was ever
// reached. FIX (SSOT classification): INCONCLUSIVE (non-answer) -> "queue-provisional" (NOT
// reject); only a definitive DEAD (404/410) -> "reject"; REACHABLE -> "proceed" (run the
// pipeline). The actual stored insert is delegated to verifyCandidate downstream (already
// stored-verified for non-answer -> tier M -> provisional).
export function headReachabilityDecision(
  head: { status: number | "error" }
): "reject" | "queue-provisional" | "proceed" {
  const o = classifyReachability(
    head.status === "error" ? { status: null, errored: true } : { status: head.status, errored: false }
  );
  if (o === REACH.DEAD) return "reject";              // definitive 404/410 = genuine negative
  if (o === REACH.INCONCLUSIVE) return "queue-provisional"; // non-answer -> queue, NOT reject
  return "proceed";                                   // reachable -> run the verifyCandidate pipeline
}

// PRE-FIX decision, retained ONLY as the mutation-check baseline.
export function headReachabilityDecision_LEGACY_BUGGY(
  head: { status: number | "error" }
): "reject" | "queue-provisional" | "proceed" {
  if (head.status === "error") return "reject";       // BUG: timeout/non-answer -> reject
  if (typeof head.status === "number" && head.status >= 400) return "reject"; // BUG: 429/5xx -> reject
  return "proceed";
}

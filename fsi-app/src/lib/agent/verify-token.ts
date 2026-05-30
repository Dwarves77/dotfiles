// Sprint 4 Block 1 task 1.12 — the deterministic createHook/resumeHook token
// for the per-claim human-verification gate.
//
// The workflow body (createHook, src/workflows/generate-brief.ts) and the admin
// tick handler (resumeHook, src/app/api/admin/verify-claim/route.ts) MUST use a
// BYTE-IDENTICAL token or the tick silently never reaches the suspended hook.
// A single shared builder guarantees they match — do not inline the template on
// either side. (Operator-flagged as the most likely silent failure of the
// verification layer; this util removes the mismatch risk.)
export function verifyHookToken(itemId: string, claimId: string): string {
  return `verify-${itemId}-${claimId}`;
}

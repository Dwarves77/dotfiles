import type { CrossRef, Dispute, VerificationResult } from "@/types/resource";

// ── Cross-Reference Lookup ──
export function getXrefs(
  resourceId: string,
  xrefPairs: [string, string][]
): { refs: string[]; refBy: string[] } {
  const refs = xrefPairs.filter(([s]) => s === resourceId).map(([, t]) => t);
  const refBy = xrefPairs.filter(([, t]) => t === resourceId).map(([s]) => s);
  return { refs, refBy };
}

// ── Verification Status ──
export function getVerification(
  resourceId: string,
  xrefPairs: [string, string][],
  disputes: Record<string, { active: boolean; note: string; sources: string[] }>
): VerificationResult {
  const { refs, refBy } = getXrefs(resourceId, xrefPairs);
  const totalLinks = refs.length + refBy.length;
  const isDisputed = disputes[resourceId]?.active;

  if (isDisputed) {
    return { xrefCount: totalLinks, disputeCount: 1, label: "Disputed", color: "#FF9500" };
  }
  if (totalLinks >= 3) {
    return { xrefCount: totalLinks, disputeCount: 0, label: "Verified", color: "#34C759" };
  }
  if (totalLinks >= 1) {
    return { xrefCount: totalLinks, disputeCount: 0, label: "Partial", color: "#94a3b8" };
  }
  return { xrefCount: 0, disputeCount: 0, label: "Unverified", color: "#475569" };
}

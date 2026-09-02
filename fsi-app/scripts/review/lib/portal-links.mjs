// portal-links.mjs — queue 3: `portal_link_candidates` rows with status='candidate' (1,457 live,
// docs/ops/session-log.md:8006), ruled link/drop (Lane R1, 2026-09-02).
//
// GROUPING: portal host (the REGISTERED source the link was found on, `sources.url` via `source_id` —
// not the candidate link's own host, which migration 162's own extractor already constrains to be the
// SAME host as the portal: "Same-host only: cross-host links are new-SOURCE leads, not this portal's
// instruments", src/lib/sources/portal-links.mjs) x link pattern (which legal-instrument signal token
// matched — the same token classes src/lib/sources/portal-links.mjs's INSTRUMENT_RE already required to
// exist before a row was ever inserted here; that function is not exported, so this module classifies
// WHICH class matched using its own pure regexes rather than importing internals it cannot reach).
//
// "link"/"drop" here means the QUEUE PRE-FILTER only, and does NOT reuse this table's own 'promoted'
// status. `status='promoted'` has an established, narrower meaning elsewhere in this repo:
// `src/lib/intake/portal-harvest.ts`'s `stamp()` sets it ONLY on an actual mint (comment on that file's
// own `LedgerDisposition` type: `"promoted" // apply: minted (item_id stamped; grounding verdict in
// reason)`), and `scripts/turns/run-ledger-consume.mjs`'s `PROMOTED_LIKE_DISPOSITIONS` treats a
// 'promoted' row as ALREADY DONE — its classify pipeline never revisits it. Writing 'promoted' here
// with `item_id` still null (this digest never mints anything) would forge that "already minted" signal
// and permanently hide these rows from the real consume step (migration 162: "the consume step
// (classify -> stage) rides the loop flip"; that step is `run-ledger-consume.mjs`/`consumePortalCandidates`,
// not this digest). So:
//   drop -> status='rejected' (migration 220's disposition_reason/dispositioned_at stamped) — the
//           existing, already-used meaning ("not an instrument on this portal", same value
//           portal-harvest.ts's own stamp() writes on a negative verdict) — and this REMOVES the row
//           from the classify pipeline's cost (a real, useful mutation for a queue where every
//           classify call spends).
//   link -> NO mutation. The row stays 'candidate', exactly where the real consume step already looks
//           for it; the operator's affirmative ruling is recorded in the committed ruling JSON (the
//           audit trail), not by inventing a DB state this table doesn't have. `item_id` is never set
//           here (no intelligence_item is minted by this digest).

import { partitionBy, buildGroup, sortGroups, latestIso } from "./digest-core.mjs";

export const QUEUE_ID = "portal-links";
export const QUEUE_LABEL = "Portal link candidates (portal_link_candidates.status = 'candidate')";
export const TABLE = "portal_link_candidates";
export const SELECT_COLUMNS = "id,source_id,url,anchor_text,status,first_seen_at,last_seen_at,dispositioned_at";
export const ALLOWED_DECISIONS = ["link", "drop", "skip"];

export function matchQueue(qb) {
  return qb.eq("status", "candidate");
}

// Same token classes as src/lib/sources/portal-links.mjs's INSTRUMENT_RE, split into the four sub-signals
// so a group can be told APART by which one fired, not just that one of them did.
const GAZETTE_RE = /\b(oj|eli|celex|federal[-_]?register|official[-_]?journal)\b/i;
const LEGISLATION_RE = /\b(regulations?|directive|legislation|laws?|acts?|statute|decree|ordinance|rulemaking|rules?|standards?)\b/i;
const GUIDANCE_RE = /\b(guidance|circular|notice|consultation|docket|bill|amendment)\b/i;
const COMPLIANCE_RE = /\b(compliance|enforcement)\b/i;

/** Pure: which instrument-signal class matched this candidate's URL path or anchor text. */
export function linkPatternOf(url, anchorText) {
  const text = `${url || ""} ${anchorText || ""}`;
  if (GAZETTE_RE.test(text)) return "gazette_path";
  if (LEGISLATION_RE.test(text)) return "legislation_path";
  if (GUIDANCE_RE.test(text)) return "guidance_path";
  if (COMPLIANCE_RE.test(text)) return "compliance_path";
  return "other"; // defensive: every row inserted by portal-links.mjs already matched one of the above
}

/** Deterministic rule: the canonical-law / gazette signal -> link; no recognizable signal -> drop; the
 *  procedural-adjacent signals (guidance/compliance) -> uncertain (plausible, not a strong instrument tell). */
export function recommendLinkDecision(pattern) {
  if (pattern === "gazette_path" || pattern === "legislation_path") return "link";
  if (pattern === "other") return "drop";
  return "uncertain";
}

/**
 * @param {any[]} rows
 * @param {Map<string,string>} sourceHostById — source_id -> host, built by the caller from a `sources` read.
 */
export function groupRows(rows, sourceHostById) {
  const groups = [];
  const keyOf = (r) => `${sourceHostById.get(r.source_id) || "(unregistered-source)"}::${linkPatternOf(r.url, r.anchor_text)}`;
  const byKey = partitionBy(rows, keyOf);
  for (const [key, groupRowsList] of byKey) {
    const pattern = key.split("::")[1];
    groups.push(
      buildGroup({
        key,
        rows: groupRowsList,
        idOf: (r) => r.id,
        recommendedDecision: recommendLinkDecision(pattern),
        exampleOf: (r) => ({ id: r.id, title: r.anchor_text || "(no anchor text)", url: r.url }),
        evidence: { link_pattern: pattern },
      })
    );
  }
  return sortGroups(groups);
}

export function patchForDecision(decision, { reason, now } = {}) {
  if (decision === "drop") {
    const dispositioned_at = now ?? new Date().toISOString();
    return { status: "rejected", disposition_reason: reason ?? null, dispositioned_at };
  }
  return null; // "link" (no DB mutation — see module header) and "skip"
}

export function freshestTimestamp(rows) {
  return latestIso(rows.flatMap((r) => [r.last_seen_at, r.first_seen_at, r.dispositioned_at]));
}

// D3 (c) — exclusion-surface x unreliable-method cross-product.  THE hard requirement.
//
// The defect (findings doc S0/c): no check that verifies what IS catches what is
// MISSING. The ~420 wrongly-EXCLUDED sources were invisible to every registry audit
// because rejected candidates aren't IN the registry — they're in a rejection log no
// audit walked. Operator suspicion ("why so many dead links in a young registry?")
// was the ONLY thing that surfaced them.
//
// The fix is NOT "go count the 420." It is a CROSS-PRODUCT of two registries:
//   exclusion-surface registry  — every store that records what was kept OUT
//   unreliable-method registry  — methods PROVEN untrustworthy this session
// D3 audits each exclusion surface, classifies each excluded group's METHOD, and
// flags any group whose method is in the unreliable registry. The 420 FALLS OUT
// because source_verifications is a registered exclusion surface and reachability-
// via-plain-fetch is a registered unreliable method. A FUTURE exclusion surface
// excluded by a FUTURE unreliable method is caught with NO new code — only a registry
// entry. The engine never references "420" or "reachability" as special; both are
// data (a live count, a methodMap entry).
//
// Symmetry that makes "surfaced the 420" mean something: a group whose method is NOT
// in the unreliable registry (a duplicate dedup, an unparseable parse-rejection, a
// manual suspension) is left ALONE. Flagging everything would be decorative.

import { emptyCoverage } from "./surface-registry.mjs";

// ── exclusion-surface registry (live schema; design's 'inaccessible' is 'suspended') ──
// excludedWhere = the keep-out predicate; methodColumn = the per-row method signal;
// methodMap = signal -> method id. Unmapped signals are NOT trusted (see mapMethod).
export const EXCLUSION_SURFACES = Object.freeze([
  {
    id: "source_verifications", table: "public.source_verifications",
    excludedWhere: "action_taken = 'rejected'", methodColumn: "rejection_reason",
    methodMap: {
      reachability: "plain-fetch-reachability",   // <- the unreliable one
      duplicate: "dedup",
      domain_unknown: "domain-allowlist",
      ai_relevance_low: "ai-relevance-score",
      not_freight_relevant: "ai-relevance-score",
      language_non_english: "language-filter",
      ai_call_failed: "ai-call-transient",
    },
  },
  {
    id: "ingest_rejections", table: "public.ingest_rejections",
    excludedWhere: "triage_action IS NULL", methodColumn: "rejection_reason",
    methodMap: { unparseable: "parse-determination", below_granularity: "granularity-rule", non_geographic: "geo-classifier", institutional: "type-classifier" },
  },
  {
    id: "sources_suspended", table: "public.sources",
    excludedWhere: "status = 'suspended'", methodColumn: "status",
    methodMap: { suspended: "manual-suspension" },
  },
]);

// ── unreliable-method registry (methods PROVEN untrustworthy this session) ──
export const UNRELIABLE_METHODS = Object.freeze([
  { id: "plain-fetch-reachability", reason: "UA-less/plain fetch() reachability check — bot-protected real sources return 403/404/thin to it while resolving via browserlessRender (findings S1, ~10 sites)" },
  { id: "dead-jq-hook", reason: "the jq verification hook proven inert this session (loaded, never fired)" },
]);

export function unreliableIds() { return new Set(UNRELIABLE_METHODS.map((m) => m.id)); }

// signal -> method id. An UNMAPPED signal becomes "unmapped:<sig>", which is in
// NEITHER registry — so it is neither flagged nor cleared; it demands an explicit
// reliability decision. (Silent-trust of an unknown method is the disease.)
export function mapMethod(surface, rawSignal) {
  return surface.methodMap[rawSignal] ?? `unmapped:${rawSignal ?? "null"}`;
}

// PURE cross-product over pre-grouped rows: [{surface, method, rawSignal, count}].
// flagged = method in the unreliable registry; clean = everything else.
export function crossProduct(groups) {
  const unreliable = unreliableIds();
  const flagged = [], clean = [];
  for (const g of groups) (unreliable.has(g.method) ? flagged : clean).push(g);
  return { flagged, clean };
}

// Human-readable derivation for a flagged group — the conclusion D3 arrives at
// WITHOUT being told to look (used by the L3 acceptance and by integrity_flags).
export function describe(group) {
  const m = UNRELIABLE_METHODS.find((x) => x.id === group.method);
  return `${group.count} candidate(s) excluded from ${group.surface} via ${group.method} ` +
    `(${m ? m.reason : "unreliable method"}) -> likely real, wrongly excluded; recover-candidate.`;
}

// LIVE audit (read-only): query each exclusion surface, group by method signal,
// classify, cross-product. `client` is a connected pg Client.
export async function auditExclusions(client) {
  const cov = emptyCoverage("exclusion-surface x unreliable-method cross-product");
  const groups = [];
  for (const s of EXCLUSION_SURFACES) {
    let rows;
    try {
      rows = (await client.query(
        `SELECT ${s.methodColumn} AS sig, count(*)::int AS n FROM ${s.table} WHERE ${s.excludedWhere} GROUP BY 1`
      )).rows;
    } catch (e) { cov.cannot_see.push({ surface: s.id, reason: e.message }); continue; }
    for (const r of rows) groups.push({ surface: s.id, method: mapMethod(s, r.sig), rawSignal: r.sig, count: r.n });
    cov.walked.push({ surface: s.id, methodColumn: s.methodColumn, groups: rows.length });
  }
  const { flagged, clean } = crossProduct(groups);
  cov.assumptions_unverified.push(
    "unmapped:<sig> method signals are NEITHER flagged nor cleared — a new signal needs an explicit methodMap entry + a reliability decision before it is trusted.",
    "unreliable-method registry is point-in-time: e.g. ai-call-transient (an evaluation-method failure, not a source defect) is a CANDIDATE for registration, not yet confirmed."
  );
  return { coverage: cov, groups, flagged, clean };
}

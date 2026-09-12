// promote-provisional.ts: the shared "provisional_sources row -> active sources row" builder.
// Extracted (task 7.5, brief-chain build plan Part 7, 2026-09-12) out of
// /api/admin/sources/promote/route.ts's approve arm so a SECOND caller
// (scripts/maintenance/resolve-provisional-sources.mjs, the automatic class-table resolver) can
// promote a row through the IDENTICAL shape, never a second, independently-drifting copy of the
// `newSource` object literal or the canonical-URL dedup check. The route now calls this module
// instead of inlining the object; behavior is unchanged (same fields, same values, same order of
// operations), verified by src/lib/sources/promote-provisional.test.mjs.
//
// This module NEVER decides a tier: SC-13 (source-credibility-model skill Section 3) requires the
// tier to be either an operator's explicit choice (the route, assignedTier from the request body) or
// a deterministic class-table resolution (the maintenance script, classTierForHost /
// decidePoolHostRegistration). Both callers pass an already-decided `tier` in; this module only
// shapes the resulting row and finds an existing canonical-URL match.
//
// PROVISIONAL_SOURCES status vocabulary (defect fix D2, docs/plans/defect-fix-plan-2026-09-12.md,
// 2026-09-12). `provisional_sources_status_check` (migration 004, widened by migration 317, applied
// live by the coordinator before this code merges per standing rule 3) allows exactly
// 'pending_review', 'confirmed', 'rejected', 'needs_more_data', 'promoted'. Before migration 317, the
// promote route's `status: "promoted"` write had never succeeded against the live constraint (D2
// evidence: 0 promoted rows, 0 rows with promoted_to_source_id). The two terminal literals both live
// callers (this route, the maintenance resolver) write are exported HERE, as the one place the
// vocabulary is spelled, so neither caller can drift from the constraint or from each other.
export const PROVISIONAL_SOURCES_STATUS_CHECK = Object.freeze([
  "pending_review",
  "confirmed",
  "rejected",
  "needs_more_data",
  "promoted",
]);
export const PROVISIONAL_SOURCES_PROMOTED_STATUS = "promoted";
export const PROVISIONAL_SOURCES_REJECTED_STATUS = "rejected";

// Explicit .ts extensions (Node's native ESM/TS loader, unlike the Next.js bundler, does not resolve
// extension-less relative specifiers), this module is imported directly by the no-npm node --test
// suite (promote-provisional.test.mjs) as well as by Next.js API routes, so the specifier must resolve
// under both.
import { canonicalizeUrl } from "./url-canonicalize.ts";
import { classifySourceRole } from "./classify-source-role.ts";

export interface ProvisionalRowInput {
  name: string;
  url: string;
  description?: string | null;
  discovered_via?: string | null;
}

export interface PromotedSourceRow {
  name: string;
  url: string;
  source_role: string | null;
  description: string;
  base_tier: number;
  effective_tier: number;
  tier_at_creation: number;
  domains: number[];
  jurisdictions: string[];
  transport_modes: string[];
  topic_tags: string[];
  access_method: string;
  status: string;
  update_frequency: string;
  intelligence_types: string[];
  vertical_tags: string[];
  notes: string;
}

export interface BuildPromotedSourceRowOpts {
  /** e.g. an operator's short user id (route path) or this step's own name (maintenance path). */
  promotedBy: string;
  /** appended to the generated `notes` field verbatim (route: reviewerNotes; maintenance: the rule that fired). */
  note?: string;
  /** injectable for deterministic tests; defaults to `new Date().toISOString()`. */
  nowIso?: string;
}

/**
 * THE shared row-shape builder for a provisional -> active promotion. `tier` is caller-decided (see
 * this file's header, never guessed here). Mirrors the route's pre-extraction object literal field
 * for field: `access_method: "scrape"`, `status: "active"`, `update_frequency: "weekly"`,
 * `intelligence_types: []` (derived by the migration-123 trigger from category, never hardcoded),
 * `domains`/`jurisdictions`/`transport_modes`/`topic_tags` empty by default (the route's own
 * `body.domains || []` etc. become the caller's job when it has that context; the maintenance
 * caller, which has no reviewer-supplied classification, leaves them empty, matching the route's own
 * fallback when a reviewer submits none).
 */
export function buildPromotedSourceRow(
  prov: ProvisionalRowInput,
  tier: number,
  opts: BuildPromotedSourceRowOpts,
): PromotedSourceRow {
  const now = opts.nowIso ?? new Date().toISOString();
  const canonUrl = canonicalizeUrl(prov.url);
  return {
    name: prov.name,
    url: canonUrl,
    source_role: classifySourceRole(prov.name, canonUrl),
    description: prov.description || "",
    base_tier: tier,
    effective_tier: tier,
    tier_at_creation: tier,
    domains: [],
    jurisdictions: [],
    transport_modes: [],
    topic_tags: [],
    access_method: "scrape",
    status: "active",
    update_frequency: "weekly",
    intelligence_types: [],
    vertical_tags: [],
    notes: `Promoted from provisional ${now.slice(0, 10)} by ${opts.promotedBy}. Discovered via ${prov.discovered_via ?? "unknown"}. ${opts.note || ""}`.trim(),
  };
}

/**
 * The Q10 dedup guard (route's own comment, verbatim): promoting the same provisional twice, or a
 * URL another path already registered, must reuse the existing row rather than mint a duplicate.
 * `hostMatches` is the caller's narrowed candidate set (the route/script both narrow by host via
 * `.ilike("url", "%host%")` before calling this, a canonical-URL COMPARE, never a raw `.eq`, per
 * the source-credibility-model skill's anti-pattern list). Pure: no I/O.
 */
export function findExistingSourceByCanonicalUrl<T extends { url: string }>(
  hostMatches: T[],
  canonUrl: string,
): T | null {
  return (hostMatches ?? []).find((s) => canonicalizeUrl(s.url) === canonUrl) ?? null;
}

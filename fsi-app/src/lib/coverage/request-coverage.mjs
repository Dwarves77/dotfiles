// SHARED-WRITER: integrity_flags
// request-coverage.mjs: the "request coverage" action's write (lane COV-1, 2026-10-08).
//
// Spec 00 section 4 gives a named coverage gap a "request coverage" action. The platform already has ONE
// channel for a concern that is not tied to a single item: a row in `integrity_flags` (migration 048) with
// category `coverage_gap`, read by the /admin Platform flags queue (fsi-app/.claude/CLAUDE.md, "Integrity flags,
// agent contract"). This module is that channel's customer-side writer. It builds the row from two validated
// strings and writes it through a service client handed in by the route; it opens no second table and no
// second queue (reuse before construction).
//
// WHAT A READER CAN SEND. A route path (the `subject_ref` the contract names for a surface subject, for example
// `/dashboard/coverage?data_class=research&geography=EU`) and a short label for what they are asking about. Nothing else
// reaches the row: the description and the recommended action are composed here, so free customer text never
// lands in the admin queue verbatim. This is a request for coverage, not customer data for analysis.
//
// DE-DUPLICATION. One OPEN flag per subject. A second request for a subject that already has an open or
// in-review `coverage_gap` flag writes nothing and answers `already: true`: the reader gets the same
// confirmation, and the queue is not flooded by repeat clicks.
//
// PLAIN ESM, relative imports only. The client is injected, so the write path is exercised by a test through a
// stub (an apply-only crash must not be reachable only live).

export const COVERAGE_REQUEST_CREATED_BY = "coverage-request-route";
export const COVERAGE_REQUEST_CATEGORY = "coverage_gap";
export const COVERAGE_REQUEST_SUBJECT_TYPE = "surface";
export const OPEN_STATUSES = Object.freeze(["open", "in_review"]);

const MAX_REF = 200;
const MAX_LABEL = 120;
// A path on this site: leading slash, then path/query/fragment characters only. No scheme, no host, no dot
// segments, no protocol-relative start.
const SUBJECT_REF_RE = /^\/(?!\/)[A-Za-z0-9/_\-.?=&%#]*$/;

/**
 * Validate the two strings a request may carry.
 * @param {unknown} body
 * @returns {{ ok: true, value: { subjectRef: string, label: string } } | { ok: false, error: string }}
 */
export function validateCoverageRequest(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON object with subjectRef and label." };
  const rawRef = typeof body.subjectRef === "string" ? body.subjectRef.trim() : "";
  const rawLabel = typeof body.label === "string" ? body.label : "";
  if (!rawRef) return { ok: false, error: "subjectRef is required: the page path the gap is on." };
  if (rawRef.length > MAX_REF || !SUBJECT_REF_RE.test(rawRef) || rawRef.includes("..")) {
    return { ok: false, error: "subjectRef must be a path on this site, for example /dashboard/coverage?data_class=research." };
  }
  // Collapse whitespace and drop control characters before measuring.
  const label = rawLabel.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!label) return { ok: false, error: "label is required: a few words naming what you are asking for." };
  if (label.length > MAX_LABEL) return { ok: false, error: `label must be ${MAX_LABEL} characters or fewer.` };
  return { ok: true, value: { subjectRef: rawRef, label } };
}

/** The integrity_flags row for a validated request. Composed here; nothing from the caller is copied raw except the two validated strings. */
export function buildCoverageGapFlag({ subjectRef, label }) {
  return {
    category: COVERAGE_REQUEST_CATEGORY,
    subject_type: COVERAGE_REQUEST_SUBJECT_TYPE,
    subject_ref: subjectRef,
    description: `Coverage requested for "${label}" at ${subjectRef}. Raised by a reader from the coverage surface of the product.`,
    recommended_actions: [
      {
        action: "Check whether a source for this gap belongs in the registry, and register it through the source registry",
        rationale: "A reader asked for coverage here from the product itself, so the gap is one a customer noticed",
      },
    ],
    status: "open",
    created_by: COVERAGE_REQUEST_CREATED_BY,
  };
}

/**
 * Record one coverage request.
 * @param {{ from: (table: string) => any }} sb a service-role Supabase client (injected)
 * @param {{ subjectRef: string, label: string }} input validated by validateCoverageRequest
 * @returns {Promise<{ ok: true, already: boolean } | { ok: false, error: string }>}
 */
export async function recordCoverageRequest(sb, input) {
  const existing = await sb
    .from("integrity_flags")
    .select("id")
    .eq("category", COVERAGE_REQUEST_CATEGORY)
    .eq("subject_type", COVERAGE_REQUEST_SUBJECT_TYPE)
    .eq("subject_ref", input.subjectRef)
    .in("status", [...OPEN_STATUSES])
    .limit(1);
  if (existing.error) return { ok: false, error: "Could not check for an existing request." };
  if (Array.isArray(existing.data) && existing.data.length > 0) return { ok: true, already: true };

  const { error } = await sb.from("integrity_flags").insert(buildCoverageGapFlag(input));
  if (error) return { ok: false, error: "Could not record the request." };
  return { ok: true, already: false };
}

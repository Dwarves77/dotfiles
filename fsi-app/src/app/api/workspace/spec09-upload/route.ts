// POST /api/workspace/spec09-upload
//
// Lane SPEC09-B, plan §W5.1 — the workspace CSV upload flow for the six spec-09 customer-data tables
// (surcharge_audits, tce_data_quality, auxiliary_energy_profiles, eudr_plot_claims, custody_chains,
// indexation_clauses). One table per request — the six tables are usually filed by different teams on
// different days (a plot claim vs. a certificate vs. an invoice line), so this route deliberately does
// not try to interleave several tables' rows into one upload the way the platform-admin bulk-import route
// does for `sources`.
//
// Body: { table: "surcharge_audits" | ... | "indexation_clauses", csv: "<raw CSV text>" }
//
// AUTH / ORG SCOPE: requireAuth (bearer JWT), then resolveOrgMembershipFromUserId resolves the caller's
// own org SERVER-SIDE from org_memberships — the request body carries NO org id field at all, so there is
// nothing for a client to spoof (CLAUDE.md standing rule + lane-common-contract: "never trust a
// client-supplied org id"). A caller with the `viewer` role is refused (403) — uploading operational data
// is a write action, not a read.
//
// VALIDATION: parseCsvUpload (src/lib/spec09/csv-upload-contract.mjs) is the ONE shared column contract —
// the same module scripts/spec09/*-producer.mjs import for the CLI/coordinator-dispatch path. A row that
// fails its own column contract is REJECTED with its specific reason(s), never silently dropped and never
// aborting the whole batch. Rows whose entity-ref columns (corridor_id/carrier_id/index_id/node_id/
// claimant_id) don't resolve against `entities` are rejected the same way, one layer earlier and friendlier
// than the DB's own FK constraint (migrations 296-298).
//
// WRITE PATH: service-role client (RLS bypassed by design for a server-validated, org-stamped insert —
// migration 308's new org-scoped SELECT policies are what protect a READER's cross-org access; this route
// is the ONE write path other than the CLI producer, and both stamp org_id from a trusted source, never
// the request body).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgMembershipFromUserId } from "@/lib/api/org";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import {
  parseCsvUpload,
  entityRefValuesForTable,
  validateEntityRefs,
  MAX_BYTES_PER_UPLOAD,
  MAX_ROWS_PER_UPLOAD,
  TABLE_CONTRACTS,
} from "@/lib/spec09/csv-upload-contract.mjs";
import {
  isKnownUploadTable,
  isRoleAllowedToUpload,
  buildRowsForInsert,
  mergeRejections,
} from "./logic";

async function handlePOST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();

  const membership = await resolveOrgMembershipFromUserId(supabase, auth.userId);
  if (!membership) {
    return NextResponse.json(
      { error: "User has no organization membership" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!isRoleAllowedToUpload(membership.role)) {
    return NextResponse.json(
      { error: "Uploading operational data requires the member, admin, or owner role. A viewer may read but not upload." },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }
  const orgId = membership.orgId; // SERVER-RESOLVED — the request body is never consulted for this.

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: rateLimitHeaders(auth.userId) });
  }

  const table = body.table;
  if (!isKnownUploadTable(table)) {
    return NextResponse.json(
      { error: `table must be one of: ${Object.keys(TABLE_CONTRACTS).join(", ")}` },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }
  const csv = body.csv;
  if (typeof csv !== "string" || csv.length === 0) {
    return NextResponse.json({ error: "csv (string) is required" }, { status: 400, headers: rateLimitHeaders(auth.userId) });
  }

  const parsed = parseCsvUpload(table, csv, { maxRows: MAX_ROWS_PER_UPLOAD, maxBytes: MAX_BYTES_PER_UPLOAD });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: rateLimitHeaders(auth.userId) });
  }

  // Entity-ref existence check — one lookup for every distinct id this batch references, not one query
  // per row.
  const refValues = entityRefValuesForTable(table, parsed.accepted);
  let existingEntityIds = new Set<string>();
  if (refValues.size > 0) {
    const { data: entityRows, error: entityErr } = await supabase
      .from("entities")
      .select("entity_id")
      .in("entity_id", [...refValues]);
    if (entityErr) {
      return NextResponse.json(
        { error: `Entity registry lookup failed — aborting upload to avoid inserting unverifiable rows: ${entityErr.message}` },
        { status: 500, headers: rateLimitHeaders(auth.userId) }
      );
    }
    existingEntityIds = new Set((entityRows || []).map((r) => (r as { entity_id: string }).entity_id));
  }
  const { valid: entityValidRows, invalid: entityRejectedRows } = validateEntityRefs(table, parsed.accepted, existingEntityIds);

  const rejected = mergeRejections(
    parsed.rejected.map((r) => ({ rowNumber: r.rowNumber, errors: r.errors })),
    entityRejectedRows
  );

  const rowsToInsert = buildRowsForInsert(table, entityValidRows, orgId);

  let inserted = 0;
  let insertedIds: string[] = [];
  if (rowsToInsert.length > 0) {
    const idColumn = table === "surcharge_audits" ? "audit_id"
      : table === "tce_data_quality" ? "dqi_id"
      : table === "auxiliary_energy_profiles" ? "profile_id"
      : table === "eudr_plot_claims" ? "claim_id"
      : table === "custody_chains" ? "custody_id"
      : "clause_id"; // indexation_clauses
    const { data: insertedRows, error: insertErr } = await supabase
      .from(table)
      .insert(rowsToInsert)
      .select(idColumn);
    if (insertErr) {
      return NextResponse.json(
        {
          error: `Insert failed: ${insertErr.message}`,
          // The parse/entity-ref rejections are still useful to the caller even though the insert itself
          // failed (e.g. a DB-level constraint this route's own checks don't pre-empt) — never discard them.
          rejected,
        },
        { status: 500, headers: rateLimitHeaders(auth.userId) }
      );
    }
    inserted = insertedRows?.length ?? 0;
    insertedIds = (insertedRows || []).map((r) => (r as Record<string, string>)[idColumn]);
  }

  return NextResponse.json(
    {
      table,
      totalRows: parsed.total,
      accepted: parsed.accepted.length,
      rejected,
      inserted,
      insertedIds,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export const POST = withErrorCapture("/api/workspace/spec09-upload", handlePOST);

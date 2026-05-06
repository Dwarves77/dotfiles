// POST /api/admin/sources/bulk-import
//
// W2.A — bulk-add tooling. Accepts a CSV upload or a JSON array of
// candidate sources, validates each row (URL shape, jurisdiction ISO
// shape, HEAD reachability, duplicate detection against existing
// `sources`), and either previews the result (dryRun=true) or applies
// it (dryRun=false).
//
// Apply behaviour:
//   - When the W2.F verification pipeline (src/lib/sources/verification.ts)
//     is present and `autoVerify=true`, each valid row is run through
//     the pipeline and the pipeline's tier (H / M / L) decides whether
//     the row goes into `sources` (auto-approve), `provisional_sources`
//     (queue), or is rejected.
//   - When the verification pipeline is NOT present, every valid+non-
//     duplicate row is queued into `provisional_sources` for human
//     review. This is the safe default — bulk-import never silently
//     auto-approves without verification.
//
// Auth: requireAuth + isPlatformAdmin. Rate-limited: 60 req/min/user
// (one bulk-import call counts as 1 request even when it processes
// hundreds of rows).
//
// All actions, regardless of dryRun, are logged to the `bulk_imports`
// audit table (migration 038) on apply only. Dry-run calls do not
// touch the database.

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";

const HEAD_TIMEOUT_MS = 8000;
const MAX_ROWS = 500;

const ISO_PATTERN = /^([A-Z]{2}|[A-Z]{2}-[A-Z0-9]{1,3}|EU|GLOBAL|IMO|ICAO)$/;

const ALLOWED_TYPES = new Set([
  "regulator",
  "standards-body",
  "industry-association",
  "gazette",
  "intergovernmental",
  "academic",
  "ngo",
  "trade-press",
  "law-firm",
  "other",
]);

interface BulkImportRow {
  url: string;
  name: string;
  type?: string;
  jurisdiction_iso?: string[];
  language?: string;
  notes?: string;
}

interface BulkImportRequest {
  format: "csv" | "json";
  data: string;
  options?: {
    dryRun?: boolean;
    autoVerify?: boolean;
    defaultJurisdictionIso?: string[];
  };
}

interface PreviewRow {
  row_index: number;
  url: string;
  name: string;
  head_status: number | "error";
  head_reason?: string;
  duplicate_of_source_id: string | null;
  validation_errors: string[];
  proposed_action:
    | "auto-approve"
    | "queue-provisional"
    | "reject"
    | "duplicate";
}

interface BulkImportResponse {
  preview: PreviewRow[];
  summary: {
    total_rows: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
  applied?: {
    sources_inserted: number;
    provisional_inserted: number;
    rejected: number;
  };
}

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function parseCsv(raw: string): { rows: BulkImportRow[]; error?: string } {
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { rows: [], error: "CSV is empty" };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  for (const col of ["url", "name"]) {
    if (!header.includes(col)) {
      return { rows: [], error: `CSV header missing required column: ${col}` };
    }
  }

  const idx = (col: string) => header.indexOf(col);
  const out: BulkImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length === 0 || cells.every((c) => c === "")) continue;
    const url = (cells[idx("url")] || "").trim();
    const name = (cells[idx("name")] || "").trim();
    const type = idx("type") >= 0 ? (cells[idx("type")] || "").trim() : "";
    const jurisdictionRaw =
      idx("jurisdiction_iso") >= 0
        ? (cells[idx("jurisdiction_iso")] || "").trim()
        : "";
    const language = idx("language") >= 0 ? (cells[idx("language")] || "").trim() : "";
    const notes = idx("notes") >= 0 ? (cells[idx("notes")] || "").trim() : "";

    const jurisdiction_iso = jurisdictionRaw
      ? jurisdictionRaw
          .split(/[|;,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    out.push({
      url,
      name,
      type: type || undefined,
      jurisdiction_iso,
      language: language || undefined,
      notes: notes || undefined,
    });
  }

  return { rows: out };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}

function parseJsonRows(raw: string): { rows: BulkImportRow[]; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { rows: [], error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (!Array.isArray(parsed)) {
    return { rows: [], error: "JSON body must be an array of rows" };
  }
  const out: BulkImportRow[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    out.push({
      url: typeof o.url === "string" ? o.url.trim() : "",
      name: typeof o.name === "string" ? o.name.trim() : "",
      type: typeof o.type === "string" ? o.type.trim() : undefined,
      jurisdiction_iso: Array.isArray(o.jurisdiction_iso)
        ? (o.jurisdiction_iso as unknown[])
            .filter((x): x is string => typeof x === "string")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      language: typeof o.language === "string" ? o.language.trim() : undefined,
      notes: typeof o.notes === "string" ? o.notes.trim() : undefined,
    });
  }
  return { rows: out };
}

function validateRow(
  row: BulkImportRow,
  defaultJurisdictionIso: string[]
): { errors: string[]; effectiveJurisdiction: string[] } {
  const errors: string[] = [];

  if (!row.url) errors.push("url is required");
  if (!row.name) errors.push("name is required");

  if (row.url) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(row.url);
    } catch {
      errors.push("url is not well-formed");
    }
    if (parsed && !["http:", "https:"].includes(parsed.protocol)) {
      errors.push("url must use http or https");
    }
  }

  if (row.type && !ALLOWED_TYPES.has(row.type)) {
    errors.push(
      `type "${row.type}" is not in allowed set: ${[...ALLOWED_TYPES].join(", ")}`
    );
  }

  const incomingIso = row.jurisdiction_iso ?? [];
  for (const code of incomingIso) {
    if (!ISO_PATTERN.test(code)) {
      errors.push(`jurisdiction_iso "${code}" does not match expected ISO pattern`);
    }
  }

  const effectiveJurisdiction =
    incomingIso.length > 0 ? incomingIso : defaultJurisdictionIso;

  if (row.language && !/^[a-z]{2}$/i.test(row.language)) {
    errors.push(`language "${row.language}" must be ISO 639-1 (two letters)`);
  }

  return { errors, effectiveJurisdiction };
}

async function headCheck(
  url: string
): Promise<{ status: number | "error"; reason?: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), HEAD_TIMEOUT_MS);
  try {
    let resp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ac.signal,
    });
    if (resp.status === 405 || resp.status === 501) {
      resp = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ac.signal,
      });
    }
    return { status: resp.status };
  } catch (e) {
    const err = e as Error;
    return {
      status: "error",
      reason: err.name === "AbortError" ? "timeout" : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

interface VerificationModule {
  verifyCandidate?: (
    candidate: {
      url: string;
      name?: string;
      jurisdiction_iso?: string[];
      discoveredFor?: string;
    },
    opts?: { skipDuplicateCheck?: boolean; dryRun?: boolean }
  ) => Promise<{
    tier: "H" | "M" | "L";
    action: "auto-approved" | "queued-provisional" | "rejected";
    rejection_reason?: string;
    resulting_source_id?: string;
    resulting_provisional_id?: string;
  }>;
}

async function loadVerificationModule(): Promise<VerificationModule | null> {
  try {
    const mod = (await import("@/lib/sources/verification")) as VerificationModule;
    if (typeof mod.verifyCandidate !== "function") return null;
    return mod;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  let body: BulkImportRequest;
  try {
    body = (await request.json()) as BulkImportRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  if (!body.format || !["csv", "json"].includes(body.format)) {
    return NextResponse.json(
      { error: "format must be 'csv' or 'json'" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (typeof body.data !== "string" || body.data.length === 0) {
    return NextResponse.json(
      { error: "data (string) is required" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const dryRun = body.options?.dryRun !== false;
  const autoVerify = body.options?.autoVerify !== false;
  const defaultJurisdictionIso = (body.options?.defaultJurisdictionIso || [])
    .map((s) => s.trim())
    .filter(Boolean);

  for (const code of defaultJurisdictionIso) {
    if (!ISO_PATTERN.test(code)) {
      return NextResponse.json(
        {
          error: `defaultJurisdictionIso entry "${code}" does not match expected ISO pattern`,
        },
        { status: 400, headers: rateLimitHeaders(auth.userId) }
      );
    }
  }

  const parseResult =
    body.format === "csv" ? parseCsv(body.data) : parseJsonRows(body.data);

  if (parseResult.error) {
    return NextResponse.json(
      { error: parseResult.error },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const rows = parseResult.rows;
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No rows parsed from input" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (${rows.length}). Maximum is ${MAX_ROWS}.` },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const wellFormedUrls = new Set<string>();
  for (const row of rows) {
    if (!row.url) continue;
    try {
      const u = new URL(row.url);
      if (u.protocol === "http:" || u.protocol === "https:") {
        wellFormedUrls.add(row.url);
      }
    } catch {
      // ignore — invalid URLs are caught in validateRow
    }
  }

  const existingByUrl = new Map<string, string>();
  if (wellFormedUrls.size > 0) {
    const { data: srcRows } = await supabase
      .from("sources")
      .select("id, url")
      .in("url", [...wellFormedUrls]);
    for (const r of srcRows || []) {
      existingByUrl.set((r as { url: string }).url, (r as { id: string }).id);
    }
  }

  const verification = autoVerify ? await loadVerificationModule() : null;

  const preview: PreviewRow[] = [];
  let valid = 0;
  let invalid = 0;
  let duplicates = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const { errors, effectiveJurisdiction } = validateRow(
      row,
      defaultJurisdictionIso
    );

    if (errors.length > 0) {
      preview.push({
        row_index: i,
        url: row.url,
        name: row.name,
        head_status: "error",
        head_reason: "skipped — row failed validation",
        duplicate_of_source_id: null,
        validation_errors: errors,
        proposed_action: "reject",
      });
      invalid++;
      continue;
    }

    const dupId = existingByUrl.get(row.url) || null;
    if (dupId) {
      preview.push({
        row_index: i,
        url: row.url,
        name: row.name,
        head_status: "error",
        head_reason: "skipped — duplicate of existing source",
        duplicate_of_source_id: dupId,
        validation_errors: [],
        proposed_action: "duplicate",
      });
      duplicates++;
      continue;
    }

    const head = await headCheck(row.url);
    let proposedAction: PreviewRow["proposed_action"] = "queue-provisional";

    if (head.status === "error") {
      proposedAction = "reject";
    } else if (typeof head.status === "number" && head.status >= 400) {
      proposedAction = "reject";
    } else if (verification?.verifyCandidate) {
      try {
        const v = await verification.verifyCandidate(
          {
            url: row.url,
            name: row.name,
            jurisdiction_iso: effectiveJurisdiction,
          },
          { dryRun: true, skipDuplicateCheck: true }
        );
        if (v.action === "auto-approved") proposedAction = "auto-approve";
        else if (v.action === "queued-provisional")
          proposedAction = "queue-provisional";
        else proposedAction = "reject";
      } catch {
        proposedAction = "queue-provisional";
      }
    } else {
      proposedAction = "queue-provisional";
    }

    preview.push({
      row_index: i,
      url: row.url,
      name: row.name,
      head_status: head.status,
      head_reason: head.reason,
      duplicate_of_source_id: null,
      validation_errors: [],
      proposed_action: proposedAction,
    });

    if (proposedAction === "reject") {
      invalid++;
    } else {
      valid++;
    }
  }

  const summary = {
    total_rows: rows.length,
    valid,
    invalid,
    duplicates,
  };

  if (dryRun) {
    const resp: BulkImportResponse = { preview, summary };
    return NextResponse.json(resp, {
      headers: rateLimitHeaders(auth.userId),
    });
  }

  let sourcesInserted = 0;
  let provisionalInserted = 0;
  let rejected = 0;

  for (const p of preview) {
    if (p.proposed_action === "duplicate") continue;
    if (p.proposed_action === "reject") {
      rejected++;
      continue;
    }

    const row = rows[p.row_index];
    const { effectiveJurisdiction } = validateRow(row, defaultJurisdictionIso);

    if (verification?.verifyCandidate) {
      try {
        const v = await verification.verifyCandidate(
          {
            url: row.url,
            name: row.name,
            jurisdiction_iso: effectiveJurisdiction,
          },
          { dryRun: false, skipDuplicateCheck: false }
        );
        if (v.action === "auto-approved" && v.resulting_source_id) {
          sourcesInserted++;
          continue;
        }
        if (
          v.action === "queued-provisional" &&
          v.resulting_provisional_id
        ) {
          provisionalInserted++;
          continue;
        }
        rejected++;
        continue;
      } catch {
        // Verification crashed mid-pipeline. Fall through to safe-default
        // provisional insert below so the row isn't silently dropped.
      }
    }

    const newProvisional = {
      name: row.name,
      url: row.url,
      description: row.notes || "",
      discovered_via: "manual_add" as const,
      provisional_tier: 7,
      status: "pending_review" as const,
    };
    const { error: provErr } = await supabase
      .from("provisional_sources")
      .insert(newProvisional);
    if (provErr) {
      rejected++;
    } else {
      provisionalInserted++;
    }
  }

  await supabase.from("bulk_imports").insert({
    imported_by: auth.userId,
    format: body.format,
    total_rows: summary.total_rows,
    sources_inserted: sourcesInserted,
    provisional_inserted: provisionalInserted,
    rejected,
    raw_input: body.data.slice(0, 100_000),
    preview_summary: {
      summary,
      preview: preview.map((p) => ({
        row_index: p.row_index,
        url: p.url,
        proposed_action: p.proposed_action,
        head_status: p.head_status,
        validation_errors: p.validation_errors,
      })),
      verification_present: !!verification?.verifyCandidate,
    },
  });

  const applied = {
    sources_inserted: sourcesInserted,
    provisional_inserted: provisionalInserted,
    rejected,
  };

  const resp: BulkImportResponse = { preview, summary, applied };
  return NextResponse.json(resp, {
    headers: rateLimitHeaders(auth.userId),
  });
}

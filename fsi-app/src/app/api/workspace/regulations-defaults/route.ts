import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";

// ───────────────────────────────────────────────────────────────────────────
// /api/workspace/regulations-defaults
//
// PR-E2 — server-side persistence for the /regulations Save-as-default
// feature. PR-E shipped Save-as-default to localStorage as L1; this route
// adds L2 server persistence so the saved filter combination follows the
// authenticated user's workspace across browsers/devices.
//
// Storage pattern: namespaced under workspace_settings.alert_config sub-key
// `regulations_defaults`. This mirrors the PR-L precedent of stacking
// per-feature config keys onto the existing alert_config JSONB column —
// no migration required. Read-modify-write preserves sibling keys
// (briefingCadence, briefingDay, etc.) on every write.
//
// Auth: requireAuth (Bearer JWT) + 60/min rate limit, matching the
// /api/workspace/overrides template.
// ───────────────────────────────────────────────────────────────────────────

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Shape of the regulations defaults payload. Mirrors the
// RegulationsDefaults interface in RegulationsSurface.tsx; keep these in
// sync. Validation is shape-tolerant — unknown extra keys are ignored,
// missing keys default to empty/sensible values on read.
interface RegulationsDefaultsPayload {
  sectors: string[];
  confidence: string[];
  priorities: string[];
  topics: string[];
  regions: string[];
  modes: string[];
  sort: string;
  view: string;
}

function sanitizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function sanitizeDefaults(input: unknown): RegulationsDefaultsPayload | null {
  if (typeof input !== "object" || input === null) return null;
  const obj = input as Record<string, unknown>;
  return {
    sectors: sanitizeStringArray(obj.sectors),
    confidence: sanitizeStringArray(obj.confidence),
    priorities: sanitizeStringArray(obj.priorities),
    topics: sanitizeStringArray(obj.topics),
    regions: sanitizeStringArray(obj.regions),
    modes: sanitizeStringArray(obj.modes),
    sort: typeof obj.sort === "string" ? obj.sort : "priority",
    view: typeof obj.view === "string" ? obj.view : "kanban",
  };
}

// GET /api/workspace/regulations-defaults
// Returns { defaults: RegulationsDefaultsPayload | null } for the
// authenticated user's workspace. `null` indicates no saved server-side
// default — the client should fall back to localStorage / workspace
// sector profile.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();

  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId);
  if (!orgId) {
    return NextResponse.json(
      { error: "User has no organization membership" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("workspace_settings")
    .select("alert_config")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ac = (data?.alert_config ?? {}) as Record<string, unknown>;
  const raw = ac.regulations_defaults;
  const defaults = raw ? sanitizeDefaults(raw) : null;

  return NextResponse.json(
    { defaults },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// PUT /api/workspace/regulations-defaults
// Body: RegulationsDefaultsPayload (sectors, confidence, priorities,
// topics, regions, modes, sort, view).
//
// Read-modify-write on workspace_settings.alert_config — preserves all
// other sub-keys (briefingCadence, briefingDay, etc.). Upserts the row
// if no workspace_settings row exists yet for this org.
async function upsertDefaults(
  request: NextRequest,
  payload: RegulationsDefaultsPayload | null
) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();

  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId);
  if (!orgId) {
    return NextResponse.json(
      { error: "User has no organization membership" },
      { status: 403 }
    );
  }

  // Read existing alert_config (if any) so we can merge.
  const { data: existing, error: readErr } = await supabase
    .from("workspace_settings")
    .select("alert_config")
    .eq("org_id", orgId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  const existingAlertConfig = (existing?.alert_config ?? {}) as Record<
    string,
    unknown
  >;

  // Setting payload to null = clear the saved default (DELETE semantics
  // expressed via PUT body for a single endpoint). We accomplish this by
  // omitting the regulations_defaults key from the merged object.
  const nextAlertConfig: Record<string, unknown> = { ...existingAlertConfig };
  if (payload === null) {
    delete nextAlertConfig.regulations_defaults;
  } else {
    nextAlertConfig.regulations_defaults = payload;
  }

  // Upsert handles both insert (no row yet) and update (row exists).
  // Default constraints on workspace_settings (sector_profile = '{}',
  // default_filters = '{}') apply on insert.
  const { error: writeErr } = await supabase
    .from("workspace_settings")
    .upsert(
      {
        org_id: orgId,
        alert_config: nextAlertConfig,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" }
    );

  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { defaults: payload },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Body shape: { defaults: RegulationsDefaultsPayload | null }
  const obj = (body || {}) as Record<string, unknown>;
  const rawDefaults = obj.defaults;
  if (rawDefaults === null) {
    return upsertDefaults(request, null);
  }
  const sanitized = sanitizeDefaults(rawDefaults);
  if (!sanitized) {
    return NextResponse.json(
      { error: "defaults must be an object or null" },
      { status: 400 }
    );
  }
  return upsertDefaults(request, sanitized);
}

// POST is an alias for PUT — clients that only support POST (older
// fetch wrappers, third-party form posts) hit the same code path.
export async function POST(request: NextRequest) {
  return PUT(request);
}

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { APP_DATA_TAG } from "@/lib/data";

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
//
// Cache layering (perf, 2026-05-10, follows PR #81 pattern):
//   - HTTP-level (Cache-Control headers, browser cache):
//       200 → private max-age=300 (defaults rarely change once saved);
//       401/403 → private max-age=60; 5xx no-store.
//       Absorbs duplicate fetches inside the same browser session;
//       this route is hit on most navigations.
//   - Server-level (unstable_cache):
//       Wraps the supabase select. Cache key includes orgId so each
//       workspace gets an isolated entry. 5 min TTL matches the HTTP
//       positive-cache window; defaults are rarely mutated. Tagged with
//       APP_DATA_TAG so the PUT/POST mutations below (and any other
//       route that calls revalidateTag(APP_DATA_TAG) — overrides,
//       staged-update approval) flush this entry atomically.
//   - Operator-measured pre-cache TTFB: 754 ms (2026-05-09). Expected
//       warm-hit: < 50 ms.
// ───────────────────────────────────────────────────────────────────────────

const NEGATIVE_CACHE = "private, max-age=60";
const POSITIVE_CACHE = "private, max-age=300";

function withCacheHeader(resp: NextResponse, value: string): NextResponse {
  resp.headers.set("Cache-Control", value);
  return resp;
}

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

// Server-side cache around the workspace_settings select. Keyed by orgId
// so each workspace has an isolated entry. 5 min TTL matches the HTTP
// positive cache; APP_DATA_TAG aligns with existing mutation
// revalidation (PUT/POST below + workspace overrides + staged updates).
type FetchResult = {
  defaults: RegulationsDefaultsPayload | null;
  dbError: string | null;
};

const fetchRegulationsDefaults = unstable_cache(
  async (orgId: string): Promise<FetchResult> => {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("workspace_settings")
      .select("alert_config")
      .eq("org_id", orgId)
      .maybeSingle();

    if (error) return { defaults: null, dbError: error.message };

    const ac = (data?.alert_config ?? {}) as Record<string, unknown>;
    const raw = ac.regulations_defaults;
    const defaults = raw ? sanitizeDefaults(raw) : null;
    return { defaults, dbError: null };
  },
  ["workspace-regulations-defaults-v1"],
  { revalidate: 300, tags: [APP_DATA_TAG] }
);

// GET /api/workspace/regulations-defaults
// Returns { defaults: RegulationsDefaultsPayload | null } for the
// authenticated user's workspace. `null` indicates no saved server-side
// default — the client should fall back to localStorage / workspace
// sector profile.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return withCacheHeader(auth, NEGATIVE_CACHE);

  const limited = checkRateLimit(auth.userId);
  if (limited) return withCacheHeader(limited, NEGATIVE_CACHE);

  const supabase = getServiceClient();

  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId);
  if (!orgId) {
    return NextResponse.json(
      { error: "User has no organization membership" },
      {
        status: 403,
        headers: {
          ...rateLimitHeaders(auth.userId),
          "Cache-Control": NEGATIVE_CACHE,
        },
      }
    );
  }

  const { defaults, dbError } = await fetchRegulationsDefaults(orgId);

  if (dbError) {
    return NextResponse.json(
      { error: dbError },
      {
        status: 500,
        headers: {
          ...rateLimitHeaders(auth.userId),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return NextResponse.json(
    { defaults },
    {
      headers: {
        ...rateLimitHeaders(auth.userId),
        "Cache-Control": POSITIVE_CACHE,
      },
    }
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

  // Flush the cached GET entry so the next read returns the new payload
  // immediately rather than waiting up to 5 min for natural revalidation.
  // APP_DATA_TAG is the shared mutation tag — already used by overrides
  // and staged-updates routes — so a single tag flush keeps everything
  // consistent without per-route plumbing.
  revalidateTag(APP_DATA_TAG, "max");

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

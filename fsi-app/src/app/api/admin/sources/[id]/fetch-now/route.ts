// POST /api/admin/sources/[id]/fetch-now
//
// Manual on-demand fetch for a single source. Bypasses pause state and
// the cooldown logic in /api/data/fetch-source — explicit admin action.
// Returns a content preview and a hash so the operator can sanity-check
// what was retrieved without paging through the full body.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const EIA_API_KEY = process.env.EIA_API_KEY;
const NREL_API_KEY = process.env.NREL_API_KEY;
const DATA_GOV_API_KEY = process.env.DATA_GOV_API_KEY;
const REGULATIONS_GOV_API_KEY = process.env.REGULATIONS_GOV_API_KEY;
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Mirror of /api/data/fetch-source's two helpers, kept inline so the
// manual fetch can run independently and bypass cooldown logic.
async function fetchViaApi(endpoint: string, keyEnv?: string, acceptHeader?: string): Promise<string> {
  let url = endpoint;
  const headers: Record<string, string> = { "User-Agent": "CarosLedge/1.0" };
  if (acceptHeader) headers["Accept"] = acceptHeader;
  if (keyEnv === "EIA_API_KEY" && EIA_API_KEY) url += (url.includes("?") ? "&" : "?") + `api_key=${EIA_API_KEY}`;
  else if (keyEnv === "NREL_API_KEY" && NREL_API_KEY) url += (url.includes("?") ? "&" : "?") + `api_key=${NREL_API_KEY}`;
  else if (keyEnv === "DATA_GOV_API_KEY" && DATA_GOV_API_KEY) url += (url.includes("?") ? "&" : "?") + `api_key=${DATA_GOV_API_KEY}`;
  else if (keyEnv === "REGULATIONS_GOV_API_KEY" && REGULATIONS_GOV_API_KEY) headers["X-Api-Key"] = REGULATIONS_GOV_API_KEY;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const data = await res.text();
  return data.slice(0, 100000);
}

async function fetchViaBrowserless(sourceUrl: string): Promise<string> {
  if (!BROWSERLESS_API_KEY) throw new Error("BROWSERLESS_API_KEY not set");
  // Browserless v2 schema: waitForSelector is an object, not a string. The
  // string form returns 400 "must be of type object" since the API change.
  const res = await fetch(`https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: sourceUrl,
      waitForSelector: { selector: "body", timeout: 5000, visible: true },
      gotoOptions: { waitUntil: "networkidle2", timeout: 15000 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Browserless ${res.status}: ${err.slice(0, 200)}`);
  }
  const html = await res.text();
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100000);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "source id required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: source, error: srcErr } = await supabase
    .from("sources")
    .select("id, name, url, access_method, api_endpoint, notes")
    .eq("id", id)
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const startTime = Date.now();
  let content: string;
  let method: "api" | "browserless";

  try {
    if (source.access_method === "api" && source.api_endpoint) {
      const keyEnv = source.notes?.match(/Key:\s*(\w+)/)?.[1] || undefined;
      const acceptHeader = source.notes?.match(/Accept:\s*([^\n]+)/)?.[1]?.trim() || undefined;
      content = await fetchViaApi(source.api_endpoint, keyEnv, acceptHeader);
      method = "api";
    } else {
      content = await fetchViaBrowserless(source.url);
      method = "browserless";
    }
  } catch (e: any) {
    await supabase.from("sources").update({
      last_checked: new Date().toISOString(),
      last_inaccessible: new Date().toISOString(),
    }).eq("id", source.id);
    return NextResponse.json(
      { success: false, error: e.message, source: source.name, method: source.access_method },
      { status: 502, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const contentHash = createHash("sha256").update(content).digest("hex").slice(0, 16);

  await supabase.from("sources").update({
    last_checked: new Date().toISOString(),
    last_accessible: new Date().toISOString(),
  }).eq("id", source.id);

  return NextResponse.json(
    {
      success: true,
      source: source.name,
      url: source.url,
      method,
      contentLength: content.length,
      contentHash,
      contentPreview: content.slice(0, 800),
      durationMs: Date.now() - startTime,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

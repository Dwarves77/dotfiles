import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
const EIA_API_KEY = process.env.EIA_API_KEY;
const NREL_API_KEY = process.env.NREL_API_KEY;
const DATA_GOV_API_KEY = process.env.DATA_GOV_API_KEY;
const REGULATIONS_GOV_API_KEY = process.env.REGULATIONS_GOV_API_KEY;

// ── Fetch via free API (no key or key from env) ──
async function fetchViaApi(endpoint: string, keyEnv?: string, acceptHeader?: string): Promise<{ content: string; method: "api" }> {
  let url = endpoint;

  // Inject API key if required. regulations.gov v4 uses an `X-Api-Key`
  // header rather than a query-string parameter; everything else is
  // query-string based.
  const headers: Record<string, string> = { "User-Agent": "CarosLedge/1.0" };
  if (acceptHeader) headers["Accept"] = acceptHeader;

  if (keyEnv === "EIA_API_KEY" && EIA_API_KEY) {
    url += (url.includes("?") ? "&" : "?") + `api_key=${EIA_API_KEY}`;
  } else if (keyEnv === "NREL_API_KEY" && NREL_API_KEY) {
    url += (url.includes("?") ? "&" : "?") + `api_key=${NREL_API_KEY}`;
  } else if (keyEnv === "DATA_GOV_API_KEY" && DATA_GOV_API_KEY) {
    url += (url.includes("?") ? "&" : "?") + `api_key=${DATA_GOV_API_KEY}`;
  } else if (keyEnv === "REGULATIONS_GOV_API_KEY" && REGULATIONS_GOV_API_KEY) {
    headers["X-Api-Key"] = REGULATIONS_GOV_API_KEY;
  }

  const res = await fetch(url, { headers });

  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const data = await res.text();
  return { content: data.slice(0, 100000), method: "api" };
}

// ── Fetch via Browserless (headless browser rendering) ──
async function fetchViaBrowserless(sourceUrl: string): Promise<{ content: string; method: "browserless" }> {
  if (!BROWSERLESS_API_KEY) throw new Error("BROWSERLESS_API_KEY not set");

  const res = await fetch(`https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: sourceUrl,
      waitForSelector: "body",
      gotoOptions: { waitUntil: "networkidle2", timeout: 15000 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Browserless ${res.status}: ${err.slice(0, 200)}`);
  }

  const html = await res.text();
  // Strip to readable text
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100000);

  return { content: text, method: "browserless" };
}

// ── Main route: fetch a single source ──
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { sourceId } = await request.json();
    if (!sourceId) {
      return NextResponse.json({ error: "sourceId required" }, { status: 400 });
    }

    // Get source record
    const { data: source, error: srcErr } = await supabase
      .from("sources")
      .select("id, name, url, access_method, api_endpoint, status, notes")
      .eq("id", sourceId)
      .single();

    if (srcErr || !source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // Gate: only active sources
    if (source.status !== "active") {
      return NextResponse.json({ error: "Source is not active" }, { status: 403 });
    }

    // Fetch content based on access method
    let result: { content: string; method: string };
    const startTime = Date.now();

    try {
      if (source.access_method === "api" && source.api_endpoint) {
        // Notes-driven config: `Key: VARNAME` selects which env-var key to inject;
        // `Accept: <mime>` overrides the default Accept header (needed for SPARQL,
        // JSON-LD, and other content-negotiation APIs).
        const keyEnv = source.notes?.match(/Key:\s*(\w+)/)?.[1] || undefined;
        const acceptHeader = source.notes?.match(/Accept:\s*([^\n]+)/)?.[1]?.trim() || undefined;
        result = await fetchViaApi(source.api_endpoint, keyEnv, acceptHeader);
      } else {
        result = await fetchViaBrowserless(source.url);
      }
    } catch (fetchErr: any) {
      // Log failure
      await supabase.from("sources").update({
        last_checked: new Date().toISOString(),
        last_inaccessible: new Date().toISOString(),
      }).eq("id", source.id);

      return NextResponse.json({
        error: `Fetch failed: ${fetchErr.message}`,
        source: source.name,
        method: source.access_method,
      }, { status: 502 });
    }

    const duration = Date.now() - startTime;

    // Store the fetched content — update the source record
    await supabase.from("sources").update({
      last_checked: new Date().toISOString(),
      last_accessible: new Date().toISOString(),
      consecutive_accessible: (source as any).consecutive_accessible + 1 || 1,
      total_checks: (source as any).total_checks + 1 || 1,
      successful_checks: (source as any).successful_checks + 1 || 1,
    }).eq("id", source.id);

    return NextResponse.json({
      source: source.name,
      url: source.url,
      method: result.method,
      contentLength: result.content.length,
      durationMs: duration,
      preview: result.content.slice(0, 500),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

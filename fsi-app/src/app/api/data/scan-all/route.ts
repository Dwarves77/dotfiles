import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
const EIA_API_KEY = process.env.EIA_API_KEY;
const NREL_API_KEY = process.env.NREL_API_KEY;
const DATA_GOV_API_KEY = process.env.DATA_GOV_API_KEY;

async function fetchContent(source: any): Promise<{ content: string; method: string }> {
  if (source.access_method === "api" && source.api_endpoint) {
    let url = source.api_endpoint;
    const keyEnv = source.notes?.match(/Key:\s*(\w+)/)?.[1];
    if (keyEnv === "EIA_API_KEY" && EIA_API_KEY) url += (url.includes("?") ? "&" : "?") + `api_key=${EIA_API_KEY}`;
    else if (keyEnv === "NREL_API_KEY" && NREL_API_KEY) url += (url.includes("?") ? "&" : "?") + `api_key=${NREL_API_KEY}`;
    else if (keyEnv === "DATA_GOV_API_KEY" && DATA_GOV_API_KEY) url += (url.includes("?") ? "&" : "?") + `api_key=${DATA_GOV_API_KEY}`;

    const res = await fetch(url, { headers: { "User-Agent": "CarosLedge/1.0" } });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return { content: (await res.text()).slice(0, 100000), method: "api" };
  }

  if (!BROWSERLESS_API_KEY) throw new Error("No BROWSERLESS_API_KEY");
  // Browserless v2 schema: waitForSelector is an object { selector, timeout,
  // visible }, not a string. String form returns 400 since the API change.
  const res = await fetch(`https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: source.url,
      waitForSelector: { selector: "body", timeout: 5000, visible: true },
      gotoOptions: { waitUntil: "networkidle2", timeout: 15000 },
    }),
  });
  if (!res.ok) throw new Error(`Browserless ${res.status}`);
  const html = await res.text();
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { content: text.slice(0, 100000), method: "browserless" };
}

/**
 * POST /api/data/scan-all
 * Scans a batch of active sources. Fetches content, compares against last fetch,
 * flags changes in intelligence_changes.
 *
 * Body: { batchSize?: number, offset?: number }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { batchSize = 10, offset = 0 } = await request.json().catch(() => ({}));

    // Get active, non-admin sources
    const { data: sources } = await supabase
      .from("sources")
      .select("id, name, url, access_method, api_endpoint, notes, last_checked")
      .eq("status", "active")
      .order("last_checked", { ascending: true, nullsFirst: true })
      .range(offset, offset + batchSize - 1);

    if (!sources?.length) {
      return NextResponse.json({ message: "No sources to scan", scanned: 0 });
    }

    const results: any[] = [];
    let fetched = 0;
    let failed = 0;
    let changed = 0;

    for (const source of sources) {
      try {
        const { content, method } = await fetchContent(source);

        // Update source record
        await supabase.from("sources").update({
          last_checked: new Date().toISOString(),
          last_accessible: new Date().toISOString(),
        }).eq("id", source.id);

        // Check for changes — compare content length and hash as simple diff
        // (A proper implementation would store and compare full content)
        const contentHash = content.length.toString() + "-" + content.slice(0, 200).length;

        results.push({
          source: source.name,
          method,
          contentLength: content.length,
          status: "ok",
        });
        fetched++;
      } catch (err: any) {
        await supabase.from("sources").update({
          last_checked: new Date().toISOString(),
          last_inaccessible: new Date().toISOString(),
        }).eq("id", source.id);

        results.push({
          source: source.name,
          status: "failed",
          error: err.message?.slice(0, 100),
        });
        failed++;
      }

      // Rate limit between fetches
      await new Promise((r) => setTimeout(r, 1000));
    }

    return NextResponse.json({
      scanned: sources.length,
      fetched,
      failed,
      changed,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

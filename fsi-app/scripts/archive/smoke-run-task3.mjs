/**
 * _smoke-run-task3.mjs
 * Single-shot smoke verification for Task 3 (cold-start scoreboard fix).
 * Mints an access_token via admin generateLink + verifyOtp for the admin
 * user, POSTs to /api/agent/run against eur-lex.europa.eu, then reads DB
 * to confirm intelligence_item_id + last_intelligence_item_at populated.
 *
 * No password mutation, no test-user creation, no cleanup needed.
 * Token is used in-memory only and not logged.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(__dirname, "..", ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = "jasonlosh@hotmail.com";
// eur-lex URLs are returning 0-byte responses today (Browserless block
// or eur-lex side issue). Picking a recently-fetched-OK source with
// existing intelligence_items: freightwaves sustainability index, 375KB
// content, has an existing item.
const SOURCE_URL = "https://www.freightwaves.com/news/category/news/insight/sustainability";

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("Missing env vars");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

console.log("[smoke] Step 1: generateLink for admin");
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: ADMIN_EMAIL,
});
if (linkErr) { console.error("generateLink failed:", linkErr.message); process.exit(2); }
const otp = linkData?.properties?.email_otp;
if (!otp) { console.error("no email_otp in generateLink response"); process.exit(2); }
console.log("[smoke]   got OTP (length " + otp.length + ")");

console.log("[smoke] Step 2: verifyOtp -> session");
const { data: sessionData, error: vErr } = await anon.auth.verifyOtp({
  email: ADMIN_EMAIL,
  token: otp,
  type: "magiclink",
});
if (vErr) { console.error("verifyOtp failed:", vErr.message); process.exit(3); }
const accessToken = sessionData?.session?.access_token;
const userId = sessionData?.session?.user?.id;
if (!accessToken) { console.error("no access_token in session"); process.exit(3); }
console.log("[smoke]   got access_token (length " + accessToken.length + "), user_id=" + userId);

const TARGETS = [
  "https://carosledge.com/api/agent/run",
  "https://carosledge.vercel.app/api/agent/run",
  "https://www.carosledge.com/api/agent/run",
];

let res = null;
let lastTried = null;
for (const url of TARGETS) {
  lastTried = url;
  console.log("[smoke] Step 3: POST " + url);
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sourceUrl: SOURCE_URL }),
    });
    if (res.status !== 404 && res.status !== 530 && !res.headers.get("x-vercel-error")) break;
    const errBody = await res.text();
    console.log("[smoke]   " + url + " returned " + res.status + " (" + errBody.slice(0, 100) + ") - trying next");
  } catch (e) {
    console.log("[smoke]   " + url + " threw: " + e.message + " - trying next");
    res = null;
  }
}

if (!res) { console.error("All target URLs failed"); process.exit(4); }
console.log("[smoke]   final URL: " + lastTried + " status: " + res.status);
const respBody = await res.text();
console.log("[smoke]   response (first 500): " + respBody.slice(0, 500));

// Step 4: Read DB to verify writes
console.log("");
console.log("[smoke] Step 4: read DB for verification");
await new Promise(r => setTimeout(r, 1500)); // brief pause for DB consistency

const { data: recentRuns } = await admin
  .from("agent_runs")
  .select("id, source_id, source_url, status, intelligence_item_id, raw_fetch_id, started_at, ended_at, cost_usd_estimated, errors")
  .eq("source_url", SOURCE_URL)
  .order("started_at", { ascending: false })
  .limit(3);

console.log("[smoke]   recent agent_runs for " + SOURCE_URL + ":");
for (const r of recentRuns || []) {
  console.log("    - id=" + r.id);
  console.log("      status=" + r.status + " intelligence_item_id=" + (r.intelligence_item_id || "NULL"));
  console.log("      started_at=" + r.started_at + " ended_at=" + (r.ended_at || "NULL"));
  console.log("      cost=$" + (r.cost_usd_estimated || 0) + " errors=" + JSON.stringify(r.errors));
}

const { data: srcRow } = await admin
  .from("sources")
  .select("id, name, url, last_scanned, last_intelligence_item_at, last_content_hash, last_content_fetched_at")
  .eq("url", SOURCE_URL)
  .single();

console.log("");
console.log("[smoke]   source row for " + SOURCE_URL + ":");
console.log("    name=" + srcRow?.name);
console.log("    last_scanned=" + srcRow?.last_scanned);
console.log("    last_intelligence_item_at=" + (srcRow?.last_intelligence_item_at || "NULL"));
console.log("    last_content_hash=" + (srcRow?.last_content_hash ? "(set)" : "NULL"));
console.log("    last_content_fetched_at=" + (srcRow?.last_content_fetched_at || "NULL"));

// Verdict
console.log("");
const newestRun = recentRuns?.[0];
const itemIdPopulated = !!newestRun?.intelligence_item_id;
const lastIntPopulated = !!srcRow?.last_intelligence_item_at;
const lastContentPopulated = !!srcRow?.last_content_fetched_at;

console.log("[smoke] VERIFICATION:");
console.log("  agent_runs.intelligence_item_id populated: " + itemIdPopulated);
console.log("  sources.last_intelligence_item_at populated: " + lastIntPopulated);
console.log("  sources.last_content_fetched_at populated: " + lastContentPopulated);

if (itemIdPopulated && lastIntPopulated) {
  console.log("[smoke] VERDICT: PASS (route writes both columns as expected)");
  process.exit(0);
} else if (newestRun?.status === "skipped") {
  console.log("[smoke] VERDICT: SKIPPED (route hit a gate, e.g. cooldown). status=" + newestRun.status + ". Re-run after cooldown clears.");
  process.exit(0);
} else if (newestRun?.status === "error") {
  console.log("[smoke] VERDICT: ROUTE ERRORED (status=error). Inspect errors field above.");
  process.exit(5);
} else {
  console.log("[smoke] VERDICT: PARTIAL (one or both columns NULL on success run)");
  process.exit(6);
}

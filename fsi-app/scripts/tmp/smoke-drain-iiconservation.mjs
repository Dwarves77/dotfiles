// Smoke test for the patched Wave 1b drain worker.
//
// Mimics what src/app/api/worker/drain-first-fetch/route.ts does after
// the 2026-05-11 patch, against a single source (iiconservation), so we
// can validate the full flow end-to-end before flipping the remaining
// 9 Task 6 sources to auto_run_enabled=true.
//
// Steps:
//   1. Flip the source's auto_run_enabled=true (the trigger from
//      migration 065 enqueues a pending_first_fetch row).
//   2. Run the patched drain logic inline:
//        a. Browserless pre-fetch
//        b. Haiku classify
//        c. INSERT enriched stub
//        d. POST to PROD /api/agent/run for the Sonnet brief
//   3. Mark the pending row 'done' so the prod cron does not retry.
//   4. Read back the intelligence_items row and report.
//
// Usage:
//   node scripts/tmp/smoke-drain-iiconservation.mjs

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(__dirname, "..", "..", ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
const APP_URL = (process.env.APP_URL || "").replace(/\/+$/, "");
const ADMIN_EMAIL =
  process.env.DRAIN_WORKER_EMAIL ||
  process.env.ADMIN_EMAIL ||
  "jasonlosh@hotmail.com";

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY || !ANTHROPIC_API_KEY || !BROWSERLESS_API_KEY) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY / ANTHROPIC_API_KEY / BROWSERLESS_API_KEY"
  );
  process.exit(1);
}
if (!APP_URL) {
  console.error("Missing APP_URL env (the deployed app base URL).");
  process.exit(1);
}

const SOURCE_URL = process.argv[2] || "https://www.iiconservation.org/";
console.log(`[smoke] target source URL: ${SOURCE_URL}`);
console.log(`[smoke] APP_URL: ${APP_URL}`);
console.log(`[smoke] admin email: ${ADMIN_EMAIL}`);

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false },
});

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HAIKU_SYSTEM = `You are a content classifier. Given source URL, source metadata, and a content excerpt, return STRICT JSON {"item_type":"...","severity":"...","priority":"...","urgency_tier":"...","topic_tags":[],"jurisdictions":[],"title_candidate":"...","summary":"...","rationale":"..."}.

item_type: regulation|directive|standard|guidance|technology|market_signal|regional_data|research_finding|innovation|framework|tool|initiative
severity: ACTION REQUIRED|COST ALERT|WINDOW CLOSING|COMPETITIVE EDGE|MONITORING
priority: CRITICAL|HIGH|MODERATE|LOW
urgency_tier: watch|elevated|stable|informational

Output JSON only.`;

async function browserlessRender(url) {
  const start = Date.now();
  const res = await fetch(`https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      waitForSelector: { selector: "body", timeout: 5000 },
      gotoOptions: { waitUntil: "networkidle2", timeout: 15000 },
    }),
  });
  const renderMs = Date.now() - start;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Browserless ${res.status}: ${body.slice(0, 200)} (${renderMs}ms)`);
  }
  const html = await res.text();
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
  return { html, text, status: res.status, renderMs };
}

async function haikuClassify(source, text) {
  const userMessage = `Source URL: ${source.url}
Source id: ${source.id}
Source tier: ${source.tier ?? "unknown"}
Content excerpt:
---
${text.slice(0, 6000)}
---
Output the JSON object only.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 800,
      system: HAIKU_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Haiku ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const blocks = data.content ?? [];
  const rawText = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
  const m = rawText.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in Haiku output");
  return JSON.parse(m[0]);
}

async function mintAccessToken() {
  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: ADMIN_EMAIL,
  });
  if (linkErr) throw new Error(`generateLink: ${linkErr.message}`);
  const otp = linkData?.properties?.email_otp;
  if (!otp) throw new Error("no email_otp in generateLink response");
  const { data: sessionData, error: vErr } = await anon.auth.verifyOtp({
    email: ADMIN_EMAIL,
    token: otp,
    type: "magiclink",
  });
  if (vErr) throw new Error(`verifyOtp: ${vErr.message}`);
  const tok = sessionData?.session?.access_token;
  if (!tok) throw new Error("no access_token in verifyOtp response");
  return tok;
}

async function main() {
  // ── Step 0: lookup source ─────────────────────────────────────────────
  const { data: source, error: srcErr } = await service
    .from("sources")
    .select("id, url, name, tier, access_method, status, auto_run_enabled, processing_paused")
    .eq("url", SOURCE_URL)
    .single();
  if (srcErr || !source) {
    console.error(`source lookup failed: ${srcErr?.message ?? "no row"}`);
    process.exit(2);
  }
  console.log(`[smoke] source: ${source.name} (id=${source.id}) status=${source.status} auto_run=${source.auto_run_enabled}`);

  // ── Step 0a: cleanup any pre-existing intelligence_items row for this source ──
  // (Should be none for iiconservation. Safety check.)
  const { data: pre } = await service
    .from("intelligence_items")
    .select("id, title, summary, pipeline_stage")
    .eq("source_url", SOURCE_URL);
  if (pre && pre.length > 0) {
    console.error(`[smoke] HALT: ${pre.length} pre-existing intelligence_items rows for this source. Refusing to overwrite.`);
    console.error(JSON.stringify(pre, null, 2));
    process.exit(2);
  }

  // ── Step 1: flip auto_run_enabled=true to fire the queue trigger ──
  console.log("[smoke] flipping auto_run_enabled=true...");
  const { error: flipErr } = await service
    .from("sources")
    .update({ auto_run_enabled: true })
    .eq("id", source.id);
  if (flipErr) {
    console.error(`flip failed: ${flipErr.message}`);
    process.exit(2);
  }

  // Verify the trigger fired.
  const { data: pending } = await service
    .from("pending_first_fetch")
    .select("id, status, attempt_count, queued_at")
    .eq("source_id", source.id)
    .order("queued_at", { ascending: false })
    .limit(1);
  if (!pending || pending.length === 0) {
    console.error("[smoke] NO pending_first_fetch row was created by the trigger; investigate migration 065 install state.");
    process.exit(2);
  }
  const pendingRow = pending[0];
  console.log(`[smoke] pending_first_fetch row created: id=${pendingRow.id} status=${pendingRow.status}`);

  // ── Step 2: claim the queue row ──
  await service
    .from("pending_first_fetch")
    .update({ status: "fetching", attempt_count: 1, last_attempt_at: new Date().toISOString() })
    .eq("id", pendingRow.id);

  // ── Step 3: pre-fetch via Browserless ──
  console.log("[smoke] pre-fetching via Browserless...");
  let fetched;
  try {
    fetched = await browserlessRender(source.url);
  } catch (e) {
    console.error(`[smoke] Browserless failed: ${e.message}`);
    await service
      .from("pending_first_fetch")
      .update({ status: "error", last_error_text: `pre-fetch: ${e.message}` })
      .eq("id", pendingRow.id);
    process.exit(2);
  }
  console.log(`[smoke] pre-fetch: ${fetched.html.length} html, ${fetched.text.length} text, ${fetched.renderMs}ms`);

  // ── Step 4: Haiku classify ──
  console.log("[smoke] Haiku classifying...");
  let cls;
  try {
    cls = await haikuClassify(source, fetched.text);
  } catch (e) {
    console.error(`[smoke] Haiku failed: ${e.message}`);
    await service
      .from("pending_first_fetch")
      .update({ status: "error", last_error_text: `haiku: ${e.message}` })
      .eq("id", pendingRow.id);
    process.exit(2);
  }
  console.log("[smoke] haiku output:", JSON.stringify(cls, null, 2));

  // ── Step 5: INSERT enriched stub (mirrors patched drain worker) ──
  const seedRow = {
    source_id: source.id,
    source_url: source.url,
    domain: 1,
    status: "monitoring",
    pipeline_stage: "draft",
    title: (cls.title_candidate ?? source.name ?? source.url).slice(0, 200),
    summary: (cls.summary ?? "").slice(0, 1000),
    severity: cls.severity ?? null,
    priority: cls.priority ?? "MODERATE",
    urgency_tier: cls.urgency_tier ?? null,
    item_type: cls.item_type ?? "regulation",
    topic_tags: cls.topic_tags ?? [],
    jurisdictions: cls.jurisdictions ?? [],
  };
  const { data: inserted, error: insErr } = await service
    .from("intelligence_items")
    .insert(seedRow)
    .select("id, title, summary, pipeline_stage")
    .single();
  if (insErr || !inserted) {
    console.error(`[smoke] seed insert failed: ${insErr?.message ?? "no data"}`);
    await service
      .from("pending_first_fetch")
      .update({ status: "error", last_error_text: `insert: ${insErr?.message}` })
      .eq("id", pendingRow.id);
    process.exit(2);
  }
  console.log(`[smoke] enriched stub inserted: id=${inserted.id} title="${inserted.title}" summary_len=${inserted.summary?.length}`);

  // ── Step 6: mint access_token + POST to PROD /api/agent/run ──
  console.log("[smoke] minting access_token...");
  let accessToken;
  try {
    accessToken = await mintAccessToken();
  } catch (e) {
    console.error(`[smoke] mintAccessToken failed: ${e.message}`);
    await service
      .from("pending_first_fetch")
      .update({ status: "error", last_error_text: `mint: ${e.message}` })
      .eq("id", pendingRow.id);
    process.exit(2);
  }

  console.log(`[smoke] POST ${APP_URL}/api/agent/run ...`);
  const start = Date.now();
  const resp = await fetch(`${APP_URL}/api/agent/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ sourceUrl: source.url }),
  });
  const elapsed = Date.now() - start;
  const respText = await resp.text();
  console.log(`[smoke] /api/agent/run -> ${resp.status} in ${elapsed}ms`);
  console.log(`[smoke] response body (truncated): ${respText.slice(0, 800)}`);

  // ── Step 7: mark pending row done (or error) ──
  await service
    .from("pending_first_fetch")
    .update({
      status: resp.ok ? "done" : "error",
      last_error_text: resp.ok ? null : `agent ${resp.status}: ${respText.slice(0, 300)}`,
    })
    .eq("id", pendingRow.id);

  // ── Step 8: read back the row and report ──
  const { data: finalRow } = await service
    .from("intelligence_items")
    .select("id, title, summary, severity, priority, urgency_tier, item_type, pipeline_stage, topic_tags, jurisdictions, full_brief, updated_at")
    .eq("id", inserted.id)
    .single();
  console.log("\n=== FINAL ROW ===");
  console.log(JSON.stringify({
    id: finalRow.id,
    title: finalRow.title,
    title_len: finalRow.title?.length,
    summary: finalRow.summary?.slice(0, 200),
    summary_len: finalRow.summary?.length,
    severity: finalRow.severity,
    priority: finalRow.priority,
    urgency_tier: finalRow.urgency_tier,
    item_type: finalRow.item_type,
    pipeline_stage: finalRow.pipeline_stage,
    topic_tags: finalRow.topic_tags,
    jurisdictions: finalRow.jurisdictions,
    brief_len: finalRow.full_brief?.length ?? 0,
    updated_at: finalRow.updated_at,
  }, null, 2));

  // ── Step 9: smoke verdict ──
  const titleOk = finalRow.title && finalRow.title !== source.name;
  const summaryOk = finalRow.summary && finalRow.summary.length > 50;
  const briefOk = (finalRow.full_brief?.length ?? 0) > 1000;
  console.log("\n=== SMOKE VERDICT ===");
  console.log(`title populated and not source.name fallback: ${titleOk ? "PASS" : "FAIL"}`);
  console.log(`summary populated (>50 chars): ${summaryOk ? "PASS" : "FAIL"}`);
  console.log(`full_brief populated (>1000 chars): ${briefOk ? "PASS" : "FAIL"}`);
  if (titleOk && summaryOk && briefOk) {
    console.log("\nSMOKE: PASS — proceed with remaining 9 Task 6 flips");
    process.exit(0);
  } else {
    console.log("\nSMOKE: FAIL — HALT. Investigate before proceeding.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[smoke] fatal", e);
  process.exit(99);
});

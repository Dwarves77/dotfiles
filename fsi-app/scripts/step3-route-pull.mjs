/** STEP 3 — prove the canonical chain AUTO-TRIGGERS through the real route.
 *
 * Direct execution does NOT satisfy step 3 (canonical-pipeline-proof.mjs already did
 * that). This mints a real user JWT and does ONE POST to /api/agent/run; the durable
 * workflow must then run preflight -> generate -> section -> ground -> grow ON ITS OWN.
 * We measure the DB effect (provenance quarantined->verified, source_citations 0->N,
 * subject-source trust before/after) and inspect the run's step graph.
 *
 *   node scripts/step3-route-pull.mjs [itemIdPrefix]
 *
 * Spends ~$0.15 Sonnet on ONE item (authorized). Pre-probes source fetchability in
 * isolation first so the one Sonnet spend lands on a fetchable source.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const BASE = process.env.STEP3_BASE_URL || "http://localhost:3000";
const EMAIL = "jasonlosh@gmail.com";
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { browserlessFetch } = await jiti.import("../src/lib/sources/canonical-fetch.mjs");

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Mint a real user access_token (admin generateLink -> anon verifyOtp) ──
async function mintToken() {
  let gl = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  if (gl.error) throw new Error(`generateLink: ${gl.error.message}`);
  const otp = gl.data?.properties?.email_otp;
  if (!otp) throw new Error("no email_otp in generateLink result");
  const v = await anon.auth.verifyOtp({ email: EMAIL, token: otp, type: "magiclink" });
  if (v.error) throw new Error(`verifyOtp: ${v.error.message}`);
  const tok = v.data?.session?.access_token;
  if (!tok) throw new Error("no access_token from verifyOtp");
  return tok;
}

// ── 2. Find a fetchable fresh item (prefer document-style URLs; stop at first good) ──
async function pickItem(prefix) {
  const { data } = await admin.from("intelligence_items")
    .select("id,title,source_url,source_id,provenance_status,full_brief")
    .eq("item_type", "research_finding").eq("is_archived", false)
    .not("source_url", "is", null).not("source_id", "is", null).limit(60);
  let pool = (data || []).filter((r) => /^https?:\/\//.test(r.source_url || "") && r.provenance_status !== "verified" && !(r.full_brief || "").trim());
  if (prefix) pool = (data || []).filter((r) => r.id.startsWith(prefix));
  // document-ish first: /reports/ /publications/ /assets/ .pdf in path
  const docish = (u) => /\/(reports?|publications?|assets|technical-reports)\/|\.pdf(\b|$)/i.test(u);
  pool.sort((a, b) => (docish(b.source_url) ? 1 : 0) - (docish(a.source_url) ? 1 : 0));
  for (const it of pool.slice(0, 6)) {
    process.stdout.write(`  probe ${it.id.slice(0, 8)} ${it.source_url.slice(0, 58)} ... `);
    let len = 0;
    try { const r = await browserlessFetch(it.source_url, { maxTextLength: 3000 }); len = (r.text || "").replace(/\s+/g, " ").trim().length; } catch (e) { len = 0; }
    console.log(`${len}ch`);
    if (len > 400) return it;
  }
  return null;
}

async function citeStats(sourceId) {
  const { count: total } = await admin.from("source_citations").select("id", { count: "exact", head: true });
  const { count: toSubject } = await admin.from("source_citations").select("id", { count: "exact", head: true }).eq("cited_source_id", sourceId);
  const { data: src } = await admin.from("sources").select("name, independent_citers, highest_citing_tier, total_citations, trust_score_citation").eq("id", sourceId).single();
  return { total, toSubject, src };
}

// ── main ──
console.log(`STEP 3 — real route pull @ ${BASE}\n`);
const token = await mintToken();
console.log(`token minted (${token.slice(0, 12)}...)\n`);

const item = await pickItem(process.argv[2]);
if (!item) { console.error("no fetchable fresh research_finding candidate found"); process.exit(1); }
console.log(`\nITEM ${item.id.slice(0, 8)} "${(item.title || "").slice(0, 50)}"\n  source=${item.source_url}\n  provenance(before)=${item.provenance_status}\n`);

const before = await citeStats(item.source_id);
console.log(`BEFORE: source_citations total=${before.total}, to-subject=${before.toSubject}; subject "${before.src?.name}" independent_citers=${before.src?.independent_citers} trust_citation=${before.src?.trust_score_citation}`);

// POST through the real route
const resp = await fetch(`${BASE}/api/agent/run`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ itemId: item.id }),
});
const body = await resp.json().catch(() => ({}));
console.log(`\nPOST /api/agent/run -> ${resp.status} ${JSON.stringify(body)}`);
if (resp.status !== 202 || !body.runId) { console.error("route did not accept the run"); process.exit(1); }
const runId = body.runId;

// Poll the DB for the AUTO-TRIGGERED effect (the route returned immediately).
// grow runs AFTER the verified flip, so keep polling until citations settle too.
console.log(`\npolling for auto-triggered chain (runId ${runId}) ...`);
let flipped = false, grew = false, last = "";
for (let i = 0; i < 75; i++) {
  await sleep(6000);
  const { data: it } = await admin.from("intelligence_items").select("provenance_status, full_brief").eq("id", item.id).single();
  const { count: scp } = await admin.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", item.id);
  const { count: cit } = await admin.from("source_citations").select("id", { count: "exact", head: true }).eq("cited_source_id", item.source_id);
  const now = `${(i + 1) * 6}s: provenance=${it?.provenance_status} brief=${(it?.full_brief || "").length}ch claims=${scp} cites=${cit}`;
  if (now !== last) { console.log(`  ${now}`); last = now; }
  if (it?.provenance_status === "verified") flipped = true;
  if ((cit ?? 0) > before.toSubject) grew = true;
  if (flipped && grew) break;
}

const after = await citeStats(item.source_id);
// canonical:* telemetry rows recorded by recordRun (budget-ledger feed)
const { data: crun } = await admin.from("agent_runs").select("fetch_method,status,cost_usd_estimated").eq("intelligence_item_id", item.id).like("fetch_method", "canonical:%").order("started_at", { ascending: true });
console.log(`\ncanonical:* agent_runs (recordRun ledger): ${(crun || []).map((r) => `${r.fetch_method}=${r.status}/$${r.cost_usd_estimated}`).join(", ") || "(none)"}`);
console.log(`\nAFTER: source_citations total=${before.total}->${after.total}, to-subject=${before.toSubject}->${after.toSubject}; subject independent_citers=${before.src?.independent_citers}->${after.src?.independent_citers} trust_citation=${before.src?.trust_score_citation}->${after.src?.trust_score_citation}`);

// Inspect the run's step graph (proves WHICH steps ran — best-effort).
console.log(`\n--- npx workflow inspect run ${runId} ---`);
try { console.log(execSync(`npx workflow inspect run ${runId}`, { cwd: ROOT, encoding: "utf8", timeout: 60000 }).slice(0, 2500)); }
catch (e) { console.log(`(inspect unavailable: ${String(e.message).slice(0, 100)})`); }

console.log(flipped ? "\nPASS — the route POST auto-triggered the canonical chain to VERIFIED." : "\nINCOMPLETE — no verified flip within the poll window (see provenance trail above).");
process.exit(flipped ? 0 : 2);

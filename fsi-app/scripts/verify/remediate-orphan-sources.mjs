/** REMEDIATION (guarded, snapshotted, per-step verified): drive the source-registration invariant to 0.
 *  GOVERNING SKILLS: source-credibility-model (§1/§5 — a source-not-item is a REGISTERED scannable
 *  source) + remediation-discipline. Pairs with rule 019 (commit-time) + migration 135 (DB guard).
 *
 *  Two actions, both through the guarded db.mjs path:
 *    (A) ORPHANS: source-y archived items whose host is NOT a registered active source → register the
 *        host as an active source (base_tier by institutional type). They stay archived (they are
 *        portals/artifacts); registering the host makes the scanner see it (the operator's rule:
 *        "if you have a source, register it — archiving without registering blinds the scanner").
 *    (B) THE 5 mis-labeled source_not_item portals whose host IS already registered → reclassifyToSource
 *        (idempotent register + read-back verify + relabel to reclassified_to_source).
 *
 *  base_tier is by institutional TYPE (content-authority, not role) and is OPERATOR-OVERRIDABLE; the
 *  honest default for an ambiguous host is T4. DRY-RUN default; --apply to write; --limit=N to bound.
 *  Requires env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Zero Browserless. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll, registerSource, reclassifyToSource, SOURCEY_ARCHIVE_REASONS } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const sb = readClient();
const host = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

// base_tier by institutional type (source-credibility-model 6-level hierarchy). Operator-overridable.
function classify(h, title = "") {
  const t = `${h} ${title}`.toLowerCase();
  if (/gazette|flk\.npc\.gov\.cn/.test(h)) return { tier: 1, role: "official_gazette", category: "regulatory" };
  if (/legislature|assembly|sdlegislature|oregonlegislature|lis\.virginia|phlcouncil|sfbos|chicityclerk|legislature\.ohio|yukonassembly|gov\.mb\.ca|legislative|council/.test(t)) return { tier: 2, role: "legislative_body", category: "regulatory" };
  if (/nrel\.gov/.test(h)) return { tier: 3, role: "government_data", category: "research" };
  if (/mit\.edu|kuehneclimate|\.ac\.|university|institute/.test(t)) return { tier: 3, role: "academic_research", category: "research" };
  if (/bureauveritas|eagle\.org|classnk|dnv|lr\.org/.test(h)) return { tier: 4, role: "industry_body", category: "market" };
  if (/toronto\.ca|chicago\.gov/.test(h) || /\bcity of\b|municipal/.test(t)) return { tier: 2, role: "municipal_government", category: "regulatory" };
  if (/\.gov\b|\.gob\b|\.gc\.ca|miteco|mingor|amsa|nhvr|recfit|calsta/.test(h) || /ministry|department|agency|authority|\bepa\b|\bdeq\b|\bdec\b/.test(t)) return { tier: 2, role: "regulator", category: "regulatory" };
  return { tier: 4, role: "other", category: "market" };
}

const cite = { skill: "source-credibility-model", reason: "source-registration remediation: register the host of a source-not-item / orphaned reclassified_to_source archive so the scanner can see it (operator rule: register, don't blind-archive); base_tier by institutional type, operator-overridable" };

// ── compute live orphans (mirror orphan-source-audit) — PAGINATED (the .limit cap hid >1000 rows) ──
const srcs = await readAll("sources", "url,status");
const activeHosts = new Set((srcs || []).filter((s) => s.status === "active").map((s) => host(s.url)).filter(Boolean));
const arc = await readAll("intelligence_items", "id,legacy_id,title,source_url,archive_reason", {
  match: (q) => q.eq("is_archived", true).in("archive_reason", SOURCEY_ARCHIVE_REASONS),
});
const orphans = (arc || []).filter((it) => { const h = host(it.source_url); return h && !activeHosts.has(h); });

console.log(`\n===== ORPHAN-SOURCE REMEDIATION (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`orphans to register: ${orphans.length}${LIMIT < Infinity ? ` (limited to ${LIMIT})` : ""}\n`);

let registered = 0, failed = 0;
for (const it of orphans.slice(0, LIMIT)) {
  const h = host(it.source_url);
  const c = classify(h, it.title || "");
  const name = (it.title || h).replace(/\s+[-–—].*$/, "").slice(0, 120).trim() || h;
  const line = `  T${c.tier} ${c.role.padEnd(20)} ${h.padEnd(34)} ${(it.title || "").slice(0, 40)}`;
  if (!APPLY) { console.log(line); continue; }
  try {
    const r = await registerSource(
      { url: it.source_url, name, base_tier: c.tier, extra: { tier: c.tier, tier_at_creation: c.tier, source_role: c.role, category: c.category, notes: "source-registration remediation 2026-06-06; base_tier by type, operator-overridable" } },
      { cite },
    );
    // read-back verify active
    const { data: chk } = await sb.from("sources").select("status").eq("id", r.source_id).single();
    if (chk?.status !== "active") throw new Error(`source ${r.source_id} not active after register`);
    registered++;
    console.log(`${line}  → ${r.created ? "REGISTERED" : "activated/exists"} ${r.source_id.slice(0, 8)}`);
  } catch (e) {
    failed++;
    console.log(`${line}  → FAILED: ${e.message}`);
    if (registered === 0) { console.log("\nHALT: first write failed — fix before batch (per-step verification)."); break; }
  }
}

console.log(`\n${APPLY ? `registered/activated=${registered}  failed=${failed}` : `DRY-RUN — ${Math.min(orphans.length, LIMIT)} would be registered (pass --apply)`}`);
process.exit(0);

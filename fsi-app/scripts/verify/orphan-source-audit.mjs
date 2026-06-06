/** VERIFIER (read-only, 0 Browserless): SOURCE-REGISTRATION INVARIANT over live data.
 *  GOVERNING SKILLS: source-credibility-model (§1/§5 — a source is registered + scannable) +
 *  remediation-discipline (classify-before-discard; never archive over a source bucket).
 *
 *  INVARIANT: no intelligence_items row may be is_archived=true with a source-y archive_reason
 *  unless a source for its host is REGISTERED and status='active'. A violation ("orphan") = an item
 *  hidden AS a source while the scanner can never see that source's pages. This is the live-data twin
 *  of rule 019 (commit-time) + migration 135 (db-guard) + db.mjs reclassifyToSource() (the safe path).
 *
 *  Exit 0 = invariant holds (no orphans). Exit 1 = orphans found (gates in CI-with-secrets / ops run).
 *  Reads only. Requires env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, SOURCEY_ARCHIVE_REASONS } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be pre-loaded in CI */ }

const host = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

const sb = readClient();

const { data: srcs, error: srcErr } = await sb.from("sources").select("url,status").limit(10000);
if (srcErr) { console.error(`orphan-source-audit: sources read failed: ${srcErr.message}`); process.exit(2); }
const activeHosts = new Set((srcs || []).filter((s) => s.status === "active").map((s) => host(s.url)).filter(Boolean));

const { data: arc, error: arcErr } = await sb.from("intelligence_items")
  .select("id,legacy_id,title,source_url,archive_reason")
  .eq("is_archived", true)
  .in("archive_reason", SOURCEY_ARCHIVE_REASONS)
  .limit(5000);
if (arcErr) { console.error(`orphan-source-audit: items read failed: ${arcErr.message}`); process.exit(2); }

const orphans = [];
for (const it of arc || []) {
  const h = host(it.source_url);
  if (!h || !activeHosts.has(h)) orphans.push({ ...it, host: h });
}

console.log(`\n===== SOURCE-REGISTRATION INVARIANT (read-only) =====`);
console.log(`source-y archived items: ${(arc || []).length}  |  active source hosts: ${activeHosts.size}  |  ORPHANS: ${orphans.length}`);
if (orphans.length) {
  console.log(`\n── ORPHANS (archived AS a source, but host not registered+active) ──`);
  for (const o of orphans) {
    console.log(`  ${(o.legacy_id || o.id.slice(0, 8)).padEnd(12)} reason=${o.archive_reason}  host=${o.host || "(unparseable)"}  ${(o.title || "").slice(0, 48)}`);
  }
  console.log(`\nFix: register each host as an active source (db.mjs registerSource / reclassifyToSource),`);
  console.log(`then re-run. This is the 25-orphan class the invariant exists to drive to zero.`);
  process.exit(1);
}
console.log(`invariant holds: every source-y archive has a registered, active source.`);
process.exit(0);

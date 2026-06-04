/**
 * offdomain-archive-pass.mjs — guarded archive pass over the 19 portal-shell items.
 *
 * Decided partition (2026-06-03, research wf_594b04f3-0ae; see
 * docs/audits/portal-shell-source-triage-2026-06-03.md):
 *
 *   REMOVE (6) — source is NOT a freight regulator. Archive item + SUSPEND source.
 *     error_page_artifact   : 24cf9264 (Montreal nav-error)
 *     non_regulatory_source : cd238eda, 445a06b2, ec086e7d, 14ff3453, 653f174b
 *   KEEP (13) — on-domain regulator/repository, ingested shell only. Archive item as
 *     portal_artifact; SOURCE PRESERVED (re-point + generate when Browserless is up).
 *
 * Four orthogonal archive_reason values, each meaning one thing:
 *   portal_artifact (regulator shell, source kept) | non_regulatory_source (not a
 *   freight regulator, removed) | off_domain (off-vertical item — reserved, not used
 *   here) | error_page_artifact (fetch error).
 *
 * Guarded: dry-run default; per-row UPDATE + read-back assert; halt on mismatch; ledger.
 * Reversal: un-archive (is_archived=false, archive_reason=null) on the 19; set the 6
 * suspended sources back to status='active'.
 *
 *   node scripts/offdomain-archive-pass.mjs                      # dry run
 *   node scripts/offdomain-archive-pass.mjs --execute --confirm  # write
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute"), CONFIRM = argv.includes("--confirm");
if (EXECUTE && !CONFIRM) { console.error("--execute requires --confirm"); process.exit(2); }

// REMOVE set (id8 -> reason); source SUSPENDED.
const SUSPEND = {
  "24cf9264": "error_page_artifact",
  "cd238eda": "non_regulatory_source",
  "445a06b2": "non_regulatory_source",
  "ec086e7d": "non_regulatory_source",
  "14ff3453": "non_regulatory_source",
  "653f174b": "non_regulatory_source",
};
// KEEP set (id8); reason portal_artifact; source PRESERVED.
const PRESERVE = ["2cb40f97","6918e77f","344a58cd","22d0883e","dff7017e","290933b8","7b159d86","281644c5","b8fb3eba","dbcf1b7a","cac4ab4c","edad4e2c","1add1175"];
const reasonFor = (id8) => SUSPEND[id8] || (PRESERVE.includes(id8) ? "portal_artifact" : null);
const ALL = [...Object.keys(SUSPEND), ...PRESERVE];

const { data: items, error } = await s.from("intelligence_items").select("id, legacy_id, title, is_archived, archive_reason, source_id, provenance_status");
if (error) { console.error(error.message); process.exit(1); }
const targets = items.filter((r) => ALL.includes(r.id.slice(0, 8)));

console.log(`MODE: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
console.log(`targets resolved: ${targets.length}/19  (SUSPEND ${Object.keys(SUSPEND).length} + PRESERVE ${PRESERVE.length})\n`);
if (targets.length !== 19) { console.error(`HALT: expected 19, got ${targets.length}.`); process.exit(1); }

// guard: no source shared between a SUSPEND item and a PRESERVE item (would wrongly suspend a kept source)
const suspendSrc = new Set(targets.filter((t) => SUSPEND[t.id.slice(0,8)]).map((t) => t.source_id));
const preserveSrc = new Set(targets.filter((t) => PRESERVE.includes(t.id.slice(0,8))).map((t) => t.source_id));
const overlap = [...suspendSrc].filter((x) => preserveSrc.has(x));
if (overlap.length) { console.error(`HALT: source(s) shared between suspend+preserve sets: ${overlap.join(",")}`); process.exit(1); }

for (const it of targets) {
  const id8 = it.id.slice(0, 8), reason = reasonFor(id8), act = SUSPEND[id8] ? "SUSPEND src" : "PRESERVE src";
  console.log(`  ${id8} ${it.legacy_id || ""} -> archive_reason='${reason}'  ${act} ${it.source_id ?? "(none)"}`);
  console.log(`     "${(it.title || "").slice(0, 58)}"`);
}

if (!EXECUTE) { console.log(`\nDRY RUN — no write. Re-run with --execute --confirm.`); process.exit(0); }

const log = [];
let archived = 0, suspended = 0;
for (const it of targets) {
  const id8 = it.id.slice(0, 8), reason = reasonFor(id8), doSuspend = !!SUSPEND[id8];
  const { error: aErr } = await s.from("intelligence_items").update({ is_archived: true, archive_reason: reason }).eq("id", it.id);
  if (aErr) { console.error(`HALT [archive ${id8}]: ${aErr.message}`); writeFileSync(resolve(ROOT,"docs","offdomain-archive-pass-log.json"), JSON.stringify({aborted:it.id,log},null,2)); process.exit(1); }
  const { data: av } = await s.from("intelligence_items").select("is_archived, archive_reason").eq("id", it.id).maybeSingle();
  const aOk = av?.is_archived === true && av?.archive_reason === reason;
  let srcStatus = "preserved", sOk = true;
  if (doSuspend && it.source_id) {
    const { error: sErr } = await s.from("sources").update({ status: "suspended" }).eq("id", it.source_id);
    if (sErr) { console.error(`HALT [suspend ${it.source_id}]: ${sErr.message}`); writeFileSync(resolve(ROOT,"docs","offdomain-archive-pass-log.json"), JSON.stringify({aborted:it.id,log},null,2)); process.exit(1); }
    const { data: sv } = await s.from("sources").select("status").eq("id", it.source_id).maybeSingle();
    srcStatus = sv?.status; sOk = sv?.status === "suspended";
  }
  const ok = aOk && sOk;
  console.log(`  [${ok ? "OK" : "MISMATCH"}] ${id8} archived=${av?.is_archived} reason=${av?.archive_reason} src=${srcStatus}`);
  log.push({ id: it.id, legacy_id: it.legacy_id, archive_reason: reason, source_id: it.source_id, source_action: doSuspend ? "suspend" : "preserve", source_status: srcStatus, ok });
  if (!ok) { console.error("HALT: read-back mismatch."); writeFileSync(resolve(ROOT,"docs","offdomain-archive-pass-log.json"), JSON.stringify({aborted:it.id,log},null,2)); process.exit(1); }
  archived++; if (doSuspend) suspended++;
}
// post-assert: 13 preserved sources still active
const { data: keepSrcRows } = await s.from("sources").select("id, status").in("id", [...preserveSrc]);
const preservedActive = (keepSrcRows || []).filter((r) => r.status === "active").length;
writeFileSync(resolve(ROOT, "docs", "offdomain-archive-pass-log.json"), JSON.stringify({ completed: true, archived, suspended, preserved_sources_active: preservedActive, log }, null, 2));
console.log(`\narchived ${archived}/19 | sources suspended ${suspended}/6 | preserved sources still active ${preservedActive}/${preserveSrc.size}`);
console.log(`Log: docs/offdomain-archive-pass-log.json`);
console.log(`Reversal: is_archived=false + archive_reason=null on the 19; the 6 suspended sources back to status='active'.`);

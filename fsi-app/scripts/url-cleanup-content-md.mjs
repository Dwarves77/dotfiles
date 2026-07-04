/** URL-NORMALIZATION CLEANUP (1c, operator ruling 2026-07-04). Strips trailing markdown-emphasis markers
 *  (`*` / backtick) glued to URLs in stored intelligence_item_sections.content_md. These are
 *  customer-checkable citations — a trailing `*` breaks the clicked link AND makes validate_item_provenance
 *  criterion-2's exact-string compare read an active registered source as ungrounded_url. GOVERNING:
 *  environmental-policy-and-innovation (brief content integrity). Same transform as the write-site fix
 *  (stripUrlMarkers) now applied to EXISTING rows. GUARDED (guardedUpdate: snapshot + cite, reversible).
 *
 *  MODES: default = DRY-RUN (report polluted rows). --sample = apply to 3, read-back verify. --class =
 *  apply to the remainder (run AFTER --sample confirms). Read-back asserts no `url*`/`url\`` remains. */
import { readClient, guardedUpdate } from "./lib/db.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));

const SAMPLE = process.argv.includes("--sample");
const CLASS = process.argv.includes("--class");
// Same strip as canonical-pipeline stripUrlMarkers: trailing `*` / backtick glued to the END of a URL.
const strip = (md) => String(md ?? "").replace(/(https?:\/\/[^\s)\]}"'<>*`]+)[*`]+/g, "$1");
// A row is polluted iff a URL in it is immediately followed by `*` or backtick.
const POLLUTED = /https?:\/\/[^\s)\]}"'<>]*[*`]/;

const CITE = {
  skill: "environmental-policy-and-innovation",
  reason: "URL-normalization 1c: strip trailing markdown-emphasis `*`/backtick glued to citation URLs in intelligence_item_sections.content_md (customer-checkable link + validate_item_provenance criterion-2 exact-compare). Operator ruling 2026-07-04. Same transform as the write-site fix.",
};

const sb = readClient();
// paginate the sections read
let rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("intelligence_item_sections").select("id,item_id,section_key,content_md").order("id").range(from, from + 999);
  if (error) { console.error("read failed:", error.message); process.exit(2); }
  if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
}
let polluted = rows.filter((r) => POLLUTED.test(r.content_md || "")).map((r) => ({ ...r, cleaned: strip(r.content_md) })).filter((r) => r.cleaned !== r.content_md);
// Join item provenance_status so the customer-visible (verified) rows can be split from quarantined (invisible).
const itemIds = [...new Set(polluted.map((r) => r.item_id))];
const statusById = {};
for (let i = 0; i < itemIds.length; i += 300) {
  const { data } = await sb.from("intelligence_items").select("id,provenance_status").in("id", itemIds.slice(i, i + 300));
  for (const it of (data || [])) statusById[it.id] = it.provenance_status;
}
polluted = polluted.map((r) => ({ ...r, status: statusById[r.item_id] || "unknown" }));
const quarantined = polluted.filter((r) => r.status === "quarantined");
const verified = polluted.filter((r) => r.status === "verified");
console.log(`sections scanned: ${rows.length} | POLLUTED: ${polluted.length}  (quarantined ${quarantined.length} / verified ${verified.length} / other ${polluted.length - quarantined.length - verified.length})`);
console.log(`NOTE: verified rows are CUSTOMER-VISIBLE — separate scope ruling. Default --sample/--class operate on QUARANTINED-scope only unless --include-verified is passed.`);
for (const r of quarantined.slice(0, 20)) {
  const ex = (r.content_md.match(/https?:\/\/[^\s)\]}"'<>]*[*`]+/) || [""])[0];
  console.log(`  [Q] ${r.id.slice(0, 8)} item=${r.item_id.slice(0, 8)} [${r.section_key}] …${ex.slice(-55)}`);
}

if (!SAMPLE && !CLASS) { console.log("\nDRY-RUN. Pass --sample (first 3 quarantined, read-back) then --class. Add --include-verified only on the separate verified-scope ruling."); process.exit(0); }

const scope = process.argv.includes("--include-verified") ? polluted : quarantined;
const targets = SAMPLE ? scope.slice(0, 3) : scope;
console.log(`\n${SAMPLE ? "SAMPLE (3)" : "CLASS (all remaining)"} — applying guardedUpdate to ${targets.length} row(s)…`);
let done = 0, failed = 0;
for (const r of targets) {
  try {
    const res = await guardedUpdate("intelligence_item_sections", (q) => q.eq("id", r.id), { content_md: r.cleaned }, { cite: CITE });
    // read-back: assert no residual url+marker
    const { data: rb } = await sb.from("intelligence_item_sections").select("content_md").eq("id", r.id).single();
    const clean = !POLLUTED.test(rb?.content_md || "");
    console.log(`  ✔ ${r.id.slice(0, 8)} updated=${res.updated} read-back-clean=${clean}${clean ? "" : " ‼ STILL POLLUTED"}`);
    if (clean) done++; else failed++;
  } catch (e) { failed++; console.log(`  ✖ ${r.id.slice(0, 8)} ${e.message.slice(0, 80)}`); }
}
console.log(`\n${SAMPLE ? "SAMPLE" : "CLASS"} DONE: ${done} clean, ${failed} failed. Snapshots under scripts/_snapshots/.`);
if (SAMPLE) console.log("Verify above, then re-run with --class for the remaining rows.");
process.exit(failed ? 1 : 0);

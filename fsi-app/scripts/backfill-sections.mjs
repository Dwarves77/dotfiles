/** SECTION BACKFILL (guarded-by-design, NON-DESTRUCTIVE, dry-run default): recover missing
 *  intelligence_item_sections rows using the now-wired number-first extractor. GOVERNING:
 *  analysis-construction-spec (per-format section construction). The extractor change (number-first +
 *  ize/ise) recovers sections whose heading carries its number but whose text differs from the spec —
 *  ~982 rows that heading-text matching silently dropped.
 *
 *  INSERT ONLY where (item_id, section_key) is ABSENT — never deletes, never overwrites. Provenance is
 *  untouched (set_provenance_status fires on intelligence_items, not sections). Runs the SAME extractor
 *  the app uses (specForItemType().extract via jiti). Paginated reads. Zero Browserless.
 *  DRY-RUN default; --apply to insert. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient, readAll } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { specForItemType } = await jiti.import("../src/lib/agent/extract-registry.ts");

const items = await readAll("intelligence_items", "id,legacy_id,item_type,full_brief,provenance_status", { match: (q) => q.eq("is_archived", false) });
const sections = await readAll("intelligence_item_sections", "item_id,section_key");
const have = new Set(sections.map((s) => `${s.item_id}::${s.section_key}`));

const toInsert = [];
let itemsTouched = 0;
for (const it of items) {
  if (!it.full_brief) continue;
  let spec; try { spec = specForItemType(it.item_type); } catch { continue; }
  if (!spec?.extract) continue;
  let rows = [];
  try { const r = spec.extract(it.full_brief); rows = Array.isArray(r) ? r : (r?.sections || []); } catch { continue; }
  let gained = 0;
  for (const row of rows) {
    const key = String(row.section_key ?? row.key ?? "");
    if (!key) continue;
    const body = (row.content_md ?? row.contentMarkdown ?? "").trim();
    if (!body) continue;
    if (have.has(`${it.id}::${key}`)) continue;            // already present — never overwrite
    toInsert.push({ item_id: it.id, section_key: key, section_order: row.section_order ?? (Number(key) || 0), content_md: body, is_conditional: row.is_conditional ?? false });
    gained++;
  }
  if (gained) itemsTouched++;
}

console.log(`\n===== SECTION BACKFILL (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`active items w/ brief: ${items.filter((i) => i.full_brief).length}  existing section rows: ${sections.length}`);
console.log(`NEW rows to insert: ${toInsert.length}  across ${itemsTouched} items (additive only; never deletes/overwrites)`);

if (!APPLY) { console.log(`\nDRY-RUN — pass --apply to insert. (provenance untouched; INSERT-only)`); process.exit(0); }
if (!toInsert.length) { console.log("nothing to insert."); process.exit(0); }

// gate check: provenance_status of a sample item unchanged pre/post.
const sample = items.find((i) => toInsert.some((r) => r.item_id === i.id));
const before = sample ? sample.provenance_status : null;

let inserted = 0;
for (let i = 0; i < toInsert.length; i += 500) {
  const batch = toInsert.slice(i, i + 500);
  const { data, error } = await sb.from("intelligence_item_sections").insert(batch).select("id");
  if (error) { console.error(`insert batch ${i} failed: ${error.message}`); process.exit(1); }
  inserted += data?.length ?? 0;
}
const afterRow = sample ? (await sb.from("intelligence_items").select("provenance_status").eq("id", sample.id).single()).data : null;
console.log(`\nINSERTED ${inserted} section rows. provenance gate (sample ${sample?.legacy_id || sample?.id?.slice(0, 8)}): ${before} -> ${afterRow?.provenance_status} ${before === afterRow?.provenance_status ? "UNCHANGED ✓" : "CHANGED ✗ INVESTIGATE"}`);
process.exit(0);

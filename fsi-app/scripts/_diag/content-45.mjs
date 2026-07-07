/** READ-ONLY: dump the ACTUAL stored content of each of the 45 flips (from the snapshot original
 *  brief — pre-redo, 0 spend) so triage is grounded in what each item CONTAINS, not its title.
 *  Prints: title, source, summary/what_is_it, section count, and a brief excerpt. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const flips = JSON.parse(readFileSync(resolve(ROOT, "scripts/_diag/_flip-ids.json"), "utf8"));
const want = new Set(flips.map((f) => f.id));

// original pre-redo rows from snapshots (earliest per id)
const snapDir = resolve(ROOT, "scripts/_snapshots");
const priorById = new Map();
for (const f of readdirSync(snapDir).filter((x) => x.startsWith("redo-prior-") && x.endsWith(".jsonl")).sort()) {
  for (const line of readFileSync(resolve(snapDir, f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const { ts, prior } = JSON.parse(line);
    if (!prior?.id || !want.has(prior.id)) continue;
    const ex = priorById.get(prior.id);
    if (!ex || ts < ex.ts) priorById.set(prior.id, { ts, prior });
  }
}
const sources = await readAll("sources", "id,name,url,base_tier,status");
const srcById = new Map(sources.map((s) => [s.id, s]));

const clip = (s, n) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
for (const fl of flips) {
  const p = priorById.get(fl.id)?.prior;
  if (!p) { console.log(`\n### ${fl.key} — NO SNAPSHOT`); continue; }
  const src = srcById.get(p.source_id);
  console.log(`\n### ${(p.legacy_id || p.id.slice(0, 8))}  [${p.item_type}]  ${p.title}`);
  console.log(`src: ${src ? `${src.name} (t${src.base_tier}/${src.status})` : "NONE"} | ${p.source_url || ""}`);
  if (p.summary) console.log(`summary: ${clip(p.summary, 260)}`);
  if (p.what_is_it) console.log(`what_is_it: ${clip(p.what_is_it, 260)}`);
  const fb = p.full_brief || "";
  console.log(`brief[${fb.length}ch]: ${clip(fb, 480)}`);
}
console.log(`\n(${flips.length} items — READ ONLY, snapshot original content, 0 spend)`);

// READ-ONLY live proof of the entity resolver against the REAL corpus (no writes). Confirms the fixture
// tests hold on live data: GLEC content → ISO-14083 edge; a real 2023/1805-mentioning item → the FuelEU item.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const { planLinks } = await import("../../src/lib/entities/entity-resolve.mjs");
const sb = readClient();

const corpus = (await readAll("intelligence_items", "id,title,instrument_identifier,is_archived", { match: (q) => q.eq("is_archived", false) }))
  .map((i) => ({ id: i.id, title: i.title, instrument_identifier: i.instrument_identifier }));
const titleOf = (id) => corpus.find((c) => c.id === id)?.title?.slice(0, 46);

async function contentOf(prefix) {
  const it = corpus.find((c) => c.id.startsWith(prefix));
  const { data: one } = await sb.from("intelligence_items").select("full_brief").eq("id", it.id).single();
  const { data: pool } = await sb.from("agent_run_searches").select("result_content_excerpt").eq("intelligence_item_id", it.id);
  return { id: it.id, text: (one?.full_brief || "") + " " + (pool || []).map((r) => r.result_content_excerpt || "").join(" ") };
}

for (const [label, prefix] of [["GLEC v3 (3581c084)", "3581c084"], ["AFIR (62ba40b0) — mentions 2023/1805", "62ba40b0"]]) {
  const { id, text } = await contentOf(prefix);
  const { edges, surface } = planLinks(text, corpus, id);
  console.log(`\n══ ${label} — content ${text.length}ch ══`);
  console.log(`  WIRE edges (${edges.length}):`);
  for (const e of edges.slice(0, 12)) console.log(`    -[${e.kind}:${e.via}]-> ${e.target_item_id.slice(0, 8)} "${titleOf(e.target_item_id)}"`);
  console.log(`  SURFACE candidates (${surface.length}): ${surface.slice(0, 8).map((s) => `${s.kind}:${s.mention}(${s.resolvedCount})`).join(", ")}`);
}
process.exit(0);

// run-change-sweep.mjs — B4 runner (scrape-and-build plan, 2026-07-19): the change-to-analysis consumer.
// Sweeps a changed source's VERIFIED items through the ONE snapshot-first verify entry (verifyItem):
//   verified_cheap → record only ($0, spans intact in stored text)
//   stale_flag     → the durable queue row (integrity_flags stale_snapshot_content_changed); NO fetch
//   needs_acquire  → the LOCKED paid path (GROUNDING_ACQUIRE_ENABLED per sanctioned run) — this runner
//                    only REPORTS the route; it never opens the lock.
//
// READ-ONLY by default; --act enables the guarded side effects (stale-flag queue rows). Free either way
// (freshness probe is HEAD-only; cheap verify reads stored text).
//
// Usage:
//   node scripts/run-change-sweep.mjs --source <uuid|url-substring> [--act] [--limit 50]
//   node scripts/run-change-sweep.mjs --all-changed [--act] [--limit 50] [--max-sources 10]
//     (--all-changed reads monitoring_queue.last_result='change_detected' — the check-sources signal)
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };

const SRC = opt("source", null);
const ALL = flag("all-changed");
if (!SRC && !ALL) { console.error("usage: run-change-sweep.mjs --source <uuid|url-substring> | --all-changed  [--act] [--limit 50] [--max-sources 10]"); process.exit(2); }
for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[v]) { console.error(`missing env ${v} (source fsi-app/.env.local)`); process.exit(2); }
}

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { sweepChangedSource, sweepAllChangedSources } = await jiti.import("../src/lib/sources/change-sweep.mjs");
const { getSnapshot } = await jiti.import("../src/lib/sources/snapshot-store.mjs");
const { probeFreshness } = await jiti.import("../src/lib/sources/freshness-probe.mjs");
const { cheapVerifyClaims } = await jiti.import("../src/lib/sources/cheap-verify.mjs");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// The SAME live dep binding groundStep uses (generate-brief.ts) — one contract, no drift.
const deps = {
  getSnapshot,
  probeFreshness,
  cheapVerifyClaims,
  loadItem: async (client, id) => {
    const { data } = await client.from("intelligence_items").select("source_id, source_url").eq("id", id).single();
    return data ?? null;
  },
  loadClaims: async (client, id) => {
    const { data } = await client.from("section_claim_provenance").select("claim_text, claim_kind, source_span").eq("intelligence_item_id", id);
    return data ?? [];
  },
  env: process.env,
};

const act = flag("act");
const limit = Number(opt("limit", "50"));

const printSweep = (s) => {
  console.log(`source ${s.sourceId}: swept=${s.sweptCount} notSwept=${s.notSwept} act=${s.act}`);
  console.log(`  routes: ${JSON.stringify(s.counts)}`);
  for (const r of s.results) console.log(`  [${r.outcome}] ${String(r.title).slice(0, 70)} — ${String(r.reason).slice(0, 140)}${r.acted ? "  (queued)" : ""}`);
};

if (SRC) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(SRC);
  const { data: rows, error } = isUuid
    ? await sb.from("sources").select("id,name,url").eq("id", SRC)
    : await sb.from("sources").select("id,name,url").ilike("url", `%${SRC}%`).order("url");
  if (error || !rows?.length) { console.error(`source lookup failed: ${error?.message ?? "no match"}`); process.exit(1); }
  const source = isUuid ? rows[0] : rows.sort((a, b) => a.url.length - b.url.length)[0];
  console.log(`sweep: ${source.name ?? "(unnamed)"}  ${source.url}  [${source.id}]`);
  printSweep(await sweepChangedSource(sb, deps, { sourceId: source.id, act, limit }));
} else {
  const summary = await sweepAllChangedSources(
    sb,
    {
      loadChangedSourceIds: async (svc) => {
        const { data, error } = await svc.from("monitoring_queue").select("source_id").eq("last_result", "change_detected");
        if (error) throw new Error(`changed-source read failed: ${error.message}`);
        return [...new Set((data ?? []).map((r) => r.source_id).filter(Boolean))];
      },
    },
    deps,
    { act, limitPerSource: limit, maxSources: Number(opt("max-sources", "10")) }
  );
  for (const s of summary.sweeps) printSweep(s);
  console.log(`\ntotal: sources=${summary.sources} skippedSources=${summary.skippedSources} routes=${JSON.stringify(summary.totals)}`);
}

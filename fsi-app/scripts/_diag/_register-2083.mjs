// Register Reg (EU) 2025/2083 (CBAM amending regulation, enacted EU law on EUR-Lex). Guarded path
// (registerSource: idempotent by host, requires a cite, snapshots). FIRST shows eur-lex.europa.eu's
// existing registry rows + tier (so we report exactly what register does: dedup to the host T1 source).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, registerSource } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(ROOT + "/.env.local");
const sb = readClient();
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

// audit: what eur-lex.europa.eu sources already exist + their tier (host the 2025/2083 URL lives on)
const all = [];
for (let f = 0; ; f += 1000) { const { data } = await sb.from("sources").select("id,url,name,base_tier,effective_tier,status").order("id").range(f, f + 999); if (!data?.length) break; all.push(...data); if (data.length < 1000) break; }
const eurlex = all.filter((s) => hostOf(s.url) === "eur-lex.europa.eu");
console.log(`eur-lex.europa.eu registry rows: ${eurlex.length}`);
for (const s of eurlex) console.log(`  base_tier=${s.base_tier} eff=${s.effective_tier} status=${s.status}  ${(s.name || "").slice(0, 40)}  ${s.url.slice(0, 56)}`);

const URL2083 = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32025R2083";
console.log(`\nregisterSource("${URL2083.slice(0, 60)}...") — guarded, idempotent-by-host:`);
const res = await registerSource(
  { url: URL2083, name: "Regulation (EU) 2025/2083 — CBAM amending regulation (simplification)", base_tier: 1 },
  { cite: { skill: "source-credibility-model", reason: "register enacted EU regulation 2025/2083 (CBAM amending instrument) — enacted text on EUR-Lex; T1 binding law as the consequence of its source-type, consistent with the eur-lex institution" } },
);
console.log(`  => source_id=${res.source_id}  created=${res.created}  host=${res.host}`);
console.log(res.created ? "  (NEW row created at base_tier=1)" : "  (DEDUPED to the existing eur-lex.europa.eu source — 2025/2083 resolves to that host's tier, NOT a per-instrument row)");
process.exit(0);

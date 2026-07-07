// Diagnose what the grow pass added so it can be precisely reversed if needed.
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\//, "");
try { process.loadEnvFile(ROOT + ".env.local"); } catch {}
const sb = readClient();
const sources = await readAll("sources", "id,url,base_tier,effective_tier,tier_override,status,auto_run_enabled,created_at");
// recent provisional rows (grow window = last ~2h to be safe)
const cutoff = Date.now() - 2 * 3600 * 1000;
const recent = sources.filter((s) => s.created_at && Date.parse(s.created_at) > cutoff);
const recentProv = recent.filter((s) => s.status === "provisional");
console.log(`sources total=${sources.length} | created in last 2h=${recent.length} | of those provisional=${recentProv.length}`);
console.log(`recent-provisional status breakdown: ${JSON.stringify(recent.reduce((a, s) => { a[s.status] = (a[s.status] || 0) + 1; return a; }, {}))}`);
// host helper
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return "?"; } };
// one-tier-per-host: hosts with >1 distinct base_tier (no override)
const byHost = {};
for (const s of sources) { const h = hostOf(s.url); (byHost[h] ||= []).push(s); }
const inconsistent = [];
for (const [h, rows] of Object.entries(byHost)) {
  const tiers = new Set(rows.filter((r) => r.tier_override == null).map((r) => r.base_tier));
  if (tiers.size > 1) {
    const recentHere = rows.filter((r) => Date.parse(r.created_at || 0) > cutoff).length;
    inconsistent.push({ host: h, tiers: [...tiers], rows: rows.length, recentRows: recentHere });
  }
}
console.log(`\none-tier-per-host inconsistent hosts: ${inconsistent.length}`);
for (const x of inconsistent.slice(0, 25)) console.log(`   ${x.host.padEnd(34)} tiers=${JSON.stringify(x.tiers)} rows=${x.rows} grewThisWindow=${x.recentRows}`);
const causedByGrow = inconsistent.filter((x) => x.recentRows > 0).length;
console.log(`\n→ ${causedByGrow}/${inconsistent.length} inconsistent hosts have a row created in the grow window (grow-caused).`);
process.exit(0);

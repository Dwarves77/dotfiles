// Walk every intelligence_items row with a source_url; HEAD-request each and
// report status (or fall back to GET if HEAD is rejected). Read-only — emits
// a structured report classifying each URL.
//
// Categories:
//   ok            — 2xx response (HEAD or fallback GET)
//   redirect_ok   — 3xx with valid redirect chain ending 2xx (followed)
//   not_found     — 404
//   forbidden     — 403 (typical anti-bot, not necessarily broken for browsers)
//   server_error  — 5xx
//   timeout       — request hung > 15s
//   network_error — DNS / TLS / refused / other

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: items } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, source_url, source_id, item_type")
  .not("source_url", "is", null)
  .neq("source_url", "")
  .order("legacy_id", { nullsFirst: false });

console.log(`Checking ${items.length} URLs from intelligence_items.source_url\n`);

async function check(url) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 15000);
    let res;
    try {
      res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "CarosLedge-HealthCheck/1.0" } });
    } catch (e) {
      // Some servers reject HEAD; fall back to GET with abort after first byte
      try {
        res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "CarosLedge-HealthCheck/1.0" } });
      } catch (e2) {
        clearTimeout(tm);
        if (e2.name === "AbortError" || e2.name === "TimeoutError") return { category: "timeout", code: null, ms: Date.now() - t0 };
        return { category: "network_error", code: null, ms: Date.now() - t0, detail: e2.message };
      }
    }
    clearTimeout(tm);
    const code = res.status;
    let category;
    if (code >= 200 && code < 300) category = res.redirected ? "redirect_ok" : "ok";
    else if (code === 404) category = "not_found";
    else if (code === 403) category = "forbidden";
    else if (code >= 500) category = "server_error";
    else if (code >= 300 && code < 400) category = "redirect_ok";
    else category = `http_${code}`;
    return { category, code, ms: Date.now() - t0, finalUrl: res.url };
  } catch (e) {
    if (e.name === "AbortError" || e.name === "TimeoutError") return { category: "timeout", code: null, ms: Date.now() - t0 };
    return { category: "network_error", code: null, ms: Date.now() - t0, detail: e.message };
  }
}

const results = [];
const counts = {};

// 4-at-a-time concurrency to keep the run under a few minutes
const CONCURRENCY = 4;
let inFlight = 0;
let nextIdx = 0;
async function worker() {
  while (nextIdx < items.length) {
    const i = nextIdx++;
    const it = items[i];
    inFlight++;
    const r = await check(it.source_url);
    inFlight--;
    counts[r.category] = (counts[r.category] || 0) + 1;
    results.push({
      idx: i + 1,
      legacy_id: it.legacy_id,
      uuid: it.id,
      title: it.title,
      item_type: it.item_type,
      url: it.source_url,
      ...r,
    });
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${items.length} checked`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

console.log("\n=== summary ===");
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}

console.log("\n=== broken / problematic URLs ===");
const broken = results.filter((r) => !["ok", "redirect_ok"].includes(r.category)).sort((a, b) => a.legacy_id?.localeCompare(b.legacy_id || "") || 0);
console.log(`Total: ${broken.length}`);
console.log("");
console.log("ID         | TYPE              | CATEGORY      | CODE | TITLE                                | URL");
console.log("-".repeat(180));
for (const r of broken) {
  const id = (r.legacy_id || r.uuid.slice(0, 8)).padEnd(10);
  const type = (r.item_type || "?").padEnd(17);
  const cat = r.category.padEnd(13);
  const code = String(r.code ?? "-").padStart(4);
  const title = (r.title || "").slice(0, 36).padEnd(36);
  console.log(`${id} | ${type} | ${cat} | ${code} | ${title} | ${r.url.slice(0, 80)}`);
}

console.log("\n=== JSON dump of broken set ===");
console.log(JSON.stringify(broken.map((r) => ({ id: r.legacy_id || r.uuid, title: r.title, item_type: r.item_type, url: r.url, category: r.category, code: r.code, detail: r.detail })), null, 2));

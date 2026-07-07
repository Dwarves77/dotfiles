// THROWAWAY DIAGNOSTIC (uncommitted). Discriminates WHY the real grounding call (non-streaming,
// max_tokens 24000) exceeds the runner's 120s bound where the 4000-token preflight probe returns in 3s.
// Outcomes:
//   non-stream returns in N<300s            -> 120s bound too tight for 24k non-streaming; fix = stream / raise bound
//   non-stream hangs to 300s, stream OK     -> idle-socket on long non-streaming call;        fix = stream (keepalive)
//   BOTH fail at 300s                        -> genuine outbound-network outage;               stop-condition (a), wait
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\//, "");
try { process.loadEnvFile(ROOT + ".env.local"); } catch {}
const KEY = process.env.ANTHROPIC_API_KEY;
const HDR = { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" };
// A prompt that FORCES a large completion so generation time ~ the real grounding/regen call.
const SYS = "You output exactly what is asked, in full, with no preamble.";
const USER = "Output a JSON array named \"claims\" of 180 objects. Each object has: \"id\" (1..180), " +
  "\"claim\" (a ~30-word sentence about freight sustainability regulation), \"quote\" (a ~40-word verbatim-style passage), " +
  "and \"tier\" (1..7). Emit the full array with all 180 objects. Do not truncate, do not summarize.";
const CAP_MS = 300000;
const withCap = (p, ms, label) => Promise.race([p, new Promise((_, j) => setTimeout(() => j(new Error(`CAP ${label} (${ms}ms)`)), ms))]);

async function nonStream() {
  const t = Date.now();
  try {
    const r = await withCap(fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: HDR,
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 24000, system: SYS, messages: [{ role: "user", content: USER }] }),
    }), CAP_MS, "nonstream");
    const d = await r.json().catch(() => ({}));
    const out = ((d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("")) || "";
    console.log(`[NON-STREAM] ${((Date.now() - t) / 1000).toFixed(1)}s HTTP ${r.status}  chars=${out.length}  stop=${d.stop_reason || "?"}`);
  } catch (e) { console.log(`[NON-STREAM] ${((Date.now() - t) / 1000).toFixed(1)}s ERR ${e.message}${e.cause ? " | cause=" + (e.cause.code || e.cause.message) : ""}`); }
}

async function stream() {
  const t = Date.now(); let firstByte = 0, chars = 0, events = 0;
  try {
    const r = await withCap(fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: HDR,
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 24000, stream: true, system: SYS, messages: [{ role: "user", content: USER }] }),
    }), CAP_MS, "stream-connect");
    if (!r.ok || !r.body) { console.log(`[STREAM] connect HTTP ${r.status} (no body)`); return; }
    const reader = r.body.getReader(); const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await withCap(reader.read(), 60000, "stream-chunk"); // 60s no-progress cap PER chunk
      if (done) break;
      if (!firstByte) firstByte = Date.now() - t;
      const text = dec.decode(value, { stream: true });
      events += (text.match(/event:/g) || []).length;
      for (const line of text.split("\n")) {
        if (line.startsWith("data:")) { try { const j = JSON.parse(line.slice(5).trim()); if (j.delta?.text) chars += j.delta.text.length; } catch {} }
      }
    }
    console.log(`[STREAM] ${((Date.now() - t) / 1000).toFixed(1)}s total, first-byte ${firstByte}ms, events~${events}, deltaChars=${chars}`);
  } catch (e) { console.log(`[STREAM] ${((Date.now() - t) / 1000).toFixed(1)}s ERR ${e.message}${e.cause ? " | cause=" + (e.cause.code || e.cause.message) : ""}`); }
}

console.log("=== stream vs non-stream (max_tokens 24000, 300s cap) ===");
await nonStream();
await stream();
process.exit(0);

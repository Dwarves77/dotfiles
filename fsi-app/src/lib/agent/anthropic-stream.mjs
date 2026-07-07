// src/lib/agent/anthropic-stream.mjs
//
// Streaming Anthropic Messages call. Exists because a LARGE non-streaming completion (max_tokens 24000)
// HANGS in some network paths: the response socket sits idle for the whole multi-minute generation and
// never resolves (proven 2026-06-19 — non-stream hung >300s where the identical stream:true call
// completed in ~500s, first byte <1s). A non-streaming call that never returns cannot be saved by a
// retry count or a bigger timeout. Streaming keeps the socket alive (continuous deltas) AND lets us bound
// on NO-PROGRESS (idle) rather than total duration — a legitimately long completion finishes; only a true
// hang trips the idle watchdog.
//
// PURE/IO split so CI can unit-test the parse (createSSEAccumulator) without network. The classifier
// (anthropic-error.mjs) is preserved on BOTH failure surfaces a stream has: the pre-stream HTTP status
// (out-of-credits / auth / bad-request arrive as a normal non-200 before any byte streams) AND a
// mid-stream `event: error` frame (overload). So a billing/auth halt still re-throws FATAL and the batch
// runner HALTS with the actionable cause — it does not regress the error-swallow we already fixed.

import { anthropicError } from "./anthropic-error.mjs";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/** Anthropic stream error frames carry {type, message}. Map the type to the HTTP status the classifier
 *  expects so fatal/transient is decided the SAME way as a pre-stream HTTP error. */
function streamErrorToAnthropic(err) {
  const map = {
    overloaded_error: 529, rate_limit_error: 429, api_error: 500, timeout_error: 504,
    authentication_error: 401, permission_error: 403, invalid_request_error: 400,
  };
  const status = map[err && err.type] || 500;
  return anthropicError(status, { error: err || { message: "stream error" } });
}

/** PURE. Feed SSE text chunks (any split — partial lines buffer across feeds); read accumulated state.
 *  Accumulates text_delta text, captures stop_reason (message_delta), error (error frame), done
 *  (message_stop). Returns an object with feed(chunk) and a `state` getter. No I/O — directly unit-tested. */
export function createSSEAccumulator() {
  let buffer = "";
  let text = "";
  let stopReason = null;
  let error = null;
  let done = false;
  // TELEMETRY (span-attribution unit 4f): Anthropic streams usage in two frames — message_start carries
  // input_tokens (and an initial output_tokens), message_delta carries the running output_tokens. Capture
  // both so the stored path can log real spend to agent_runs (no DDL). Last output_tokens wins (cumulative).
  // PROMPT-CACHE (Phase-3a): with a cache_control prefix, message_start usage ALSO carries
  // cache_creation_input_tokens (prefix written, 1.25×) and cache_read_input_tokens (prefix read, 0.1×);
  // input_tokens then EXCLUDES the cached prefix. Captured so cost + savings telemetry are real.
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  return {
    feed(chunk) {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue; // skip `event:` lines, blank lines, comments
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let j;
        try { j = JSON.parse(payload); } catch { continue; }
        if (j.type === "content_block_delta" && j.delta && j.delta.type === "text_delta") text += j.delta.text || "";
        else if (j.type === "message_delta" && j.delta && j.delta.stop_reason) stopReason = j.delta.stop_reason;
        else if (j.type === "message_stop") done = true;
        else if (j.type === "error") error = j.error || { message: "stream error" };
        if (j.type === "message_start" && j.message && j.message.usage) {
          if (typeof j.message.usage.input_tokens === "number") inputTokens = j.message.usage.input_tokens;
          if (typeof j.message.usage.output_tokens === "number") outputTokens = j.message.usage.output_tokens;
          if (typeof j.message.usage.cache_creation_input_tokens === "number") cacheCreationTokens = j.message.usage.cache_creation_input_tokens;
          if (typeof j.message.usage.cache_read_input_tokens === "number") cacheReadTokens = j.message.usage.cache_read_input_tokens;
        } else if (j.type === "message_delta" && j.usage && typeof j.usage.output_tokens === "number") {
          outputTokens = j.usage.output_tokens;
        }
      }
    },
    get state() { return { text, stopReason, error, done, usage: { input_tokens: inputTokens, output_tokens: outputTokens, cache_creation_input_tokens: cacheCreationTokens, cache_read_input_tokens: cacheReadTokens } }; },
  };
}

/** Stream a Messages call and return { text, stopReason }. Throws a CLASSIFIED anthropicError on a
 *  non-200 pre-stream response or a mid-stream error frame; throws a TRANSIENT error if the stream makes
 *  no progress for idleMs (the hang detector). fetchImpl is injectable for tests.
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {object} opts.body         - Messages body (model, max_tokens, system, messages); stream:true is added here
 * @param {string[]} [opts.betaHeaders]
 * @param {number} [opts.idleMs]     - no-progress watchdog (default 90000ms)
 * @param {number} [opts.heartbeatMs]- rate-limit between progress beats (default 30000ms; growth is the trigger)
 * @param {typeof fetch} [opts.fetchImpl]
 * @returns {Promise<{text:string, stopReason:(string|null), usage:{input_tokens:number, output_tokens:number, cache_creation_input_tokens:number, cache_read_input_tokens:number}}>}
 */
export async function streamMessagesText({ apiKey, body, betaHeaders, idleMs = 90000, heartbeatMs = 30000, fetchImpl } = {}) {
  if (!apiKey) throw new Error("ANTHROPIC_FATAL: missing ANTHROPIC_API_KEY");
  const doFetch = fetchImpl || fetch;
  const headers = { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": API_VERSION };
  if (betaHeaders && betaHeaders.length) headers["anthropic-beta"] = betaHeaders.join(",");
  const ctrl = new AbortController();
  const res = await doFetch(API_URL, {
    method: "POST", headers, signal: ctrl.signal,
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw anthropicError(res.status, d); // out-of-credits / auth / bad-request — arrives before any byte
  }
  if (!res.body || typeof res.body.getReader !== "function") {
    const e = new Error("ANTHROPIC_TRANSIENT (stream had no readable body)"); e.fatal = false; throw e;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const acc = createSSEAccumulator();
  // Heartbeat: a legitimate large completion streams for minutes while the CALLER (a batch runner) prints
  // nothing until the item finishes. A long SILENT stretch reads as a hang to a background-task watchdog
  // and gets the process killed. Emit a low-rate stderr beat so the run stays visibly active.
  // PROGRESS-TIED, NOT a wall-clock timer: a beat fires ONLY when accumulated text has actually GROWN
  // since the last beat. If the stream stalls mid-completion (socket alive but no new tokens), text stops
  // growing → no beat → the run goes silent and the watchdog / 90s idle-abort still catch the genuine hang.
  // The interval only RATE-LIMITS beats; growth is the trigger. So the heartbeat gives the watchdog the
  // liveness signal it lacked for streamed calls without ever masking a real stall as healthy.
  const HEARTBEAT_MS = heartbeatMs;
  let lastBeat = Date.now();
  let lastBeatChars = 0;
  try {
    for (;;) {
      let timer;
      const idle = new Promise((_, rej) => {
        timer = setTimeout(() => {
          try { ctrl.abort(); } catch { /* noop */ }
          const e = new Error(`ANTHROPIC_TRANSIENT (stream idle >${idleMs}ms — hang)`); e.fatal = false; rej(e);
        }, idleMs);
      });
      let chunk;
      try { chunk = await Promise.race([reader.read(), idle]); }
      finally { clearTimeout(timer); }
      if (chunk.done) break;
      acc.feed(dec.decode(chunk.value, { stream: true }));
      const st = acc.state;
      if (st.error) { try { ctrl.abort(); } catch { /* noop */ } throw streamErrorToAnthropic(st.error); }
      if (st.done) break;
      if (st.text.length > lastBeatChars && Date.now() - lastBeat > HEARTBEAT_MS) {
        const delta = st.text.length - lastBeatChars;
        lastBeat = Date.now(); lastBeatChars = st.text.length;
        try { process.stderr.write(`  …streaming +${delta} chars (${st.text.length} total)\n`); } catch { /* noop */ }
      }
    }
  } finally {
    try { reader.releaseLock && reader.releaseLock(); } catch { /* noop */ }
  }
  const st = acc.state;
  if (st.error) throw streamErrorToAnthropic(st.error);
  return { text: st.text, stopReason: st.stopReason, usage: st.usage };
}

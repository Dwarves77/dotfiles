// Unit tests for the streaming Anthropic call — the fix for the LARGE non-streaming completion hang.
// Covers the pure SSE parse AND that the fatal/transient classifier survives on both stream failure
// surfaces (pre-stream HTTP status + mid-stream error frame) and that a no-progress stream trips the
// idle watchdog as TRANSIENT (retryable), never fatal. CI-gated via discipline.yml.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSSEAccumulator, streamMessagesText } from "./anthropic-stream.mjs";
import { isFatalAnthropic } from "./anthropic-error.mjs";

const enc = new TextEncoder();
// Build a web ReadableStream that emits the given string chunks then closes.
const streamOf = (chunks) => new ReadableStream({
  start(c) { for (const s of chunks) c.enqueue(enc.encode(s)); c.close(); },
});
const okRes = (chunks) => ({ ok: true, status: 200, body: streamOf(chunks) });
const errRes = (status, body) => ({ ok: false, status, json: async () => body });
// A stream that delivers one chunk per pull with a real gap, so wall-clock advances between chunks
// (lets the rate-limited heartbeat fire deterministically without a 30s wait).
const delayedStreamOf = (chunks, gapMs) => {
  let i = 0;
  return new ReadableStream({
    async pull(c) {
      if (i >= chunks.length) { c.close(); return; }
      await new Promise((r) => setTimeout(r, gapMs));
      c.enqueue(enc.encode(chunks[i++]));
    },
  });
};
const MSG_START = 'event: message_start\ndata: {"type":"message_start","message":{"id":"m"}}\n\n';
const PING = 'event: ping\ndata: {"type":"ping"}\n\n';
const MSG_STOP = 'event: message_stop\ndata: {"type":"message_stop"}\n\n';
const textDelta = (s) => `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: s } })}\n\n`;
// Capture only the progress-beat stderr lines around an async call.
async function captureBeats(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  const beats = [];
  process.stderr.write = (s) => { if (/streaming \+/.test(String(s))) beats.push(String(s)); return true; };
  try { await fn(); } finally { process.stderr.write = orig; }
  return beats;
}

const SSE_OK = [
  'event: message_start\ndata: {"type":"message_start","message":{"id":"m"}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"world"}}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
];

test("accumulator: collects text deltas, stop_reason, done", () => {
  const acc = createSSEAccumulator();
  for (const c of SSE_OK) acc.feed(c);
  const st = acc.state;
  assert.equal(st.text, "Hello world");
  assert.equal(st.stopReason, "end_turn");
  assert.equal(st.done, true);
  assert.equal(st.error, null);
});

test("accumulator: buffers a line split ACROSS feed boundaries (the chunk-boundary case)", () => {
  const acc = createSSEAccumulator();
  const full = 'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"split"}}\n';
  acc.feed(full.slice(0, 30)); // mid-JSON
  acc.feed(full.slice(30));    // remainder + newline
  assert.equal(acc.state.text, "split");
});

test("accumulator: a mid-stream error frame is captured, not parsed as text", () => {
  const acc = createSSEAccumulator();
  acc.feed('event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}\n\n');
  assert.equal(acc.state.text, "");
  assert.equal(acc.state.error.type, "overloaded_error");
});

test("streamMessagesText: happy path returns concatenated text + stopReason", async () => {
  const out = await streamMessagesText({ apiKey: "k", body: { model: "m", max_tokens: 10, messages: [] }, fetchImpl: async () => okRes(SSE_OK) });
  assert.equal(out.text, "Hello world");
  assert.equal(out.stopReason, "end_turn");
});

test("accumulator + streamMessagesText: captures usage (input from message_start, output from message_delta) — telemetry 4f", async () => {
  const chunks = [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"m","usage":{"input_tokens":1200,"output_tokens":1}}}\n\n',
    textDelta("hi"),
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":345}}\n\n',
    MSG_STOP,
  ];
  const out = await streamMessagesText({ apiKey: "k", body: { messages: [] }, fetchImpl: async () => okRes(chunks) });
  assert.equal(out.usage.input_tokens, 1200);
  assert.equal(out.usage.output_tokens, 345); // running total from message_delta wins over the start seed
});

test("accumulator: usage defaults to 0/0 when no usage frames present (never NaN)", () => {
  const acc = createSSEAccumulator();
  for (const c of SSE_OK) acc.feed(c);
  assert.deepEqual(acc.state.usage, { input_tokens: 0, output_tokens: 0 });
});

test("streamMessagesText: pre-stream 400 out-of-credits → FATAL classified (the halt path, preserved)", async () => {
  const body = { error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } };
  await assert.rejects(
    () => streamMessagesText({ apiKey: "k", body: { messages: [] }, fetchImpl: async () => errRes(400, body) }),
    (e) => { assert.equal(isFatalAnthropic(e), true); assert.match(e.message, /credit balance is too low/); return true; },
  );
});

test("streamMessagesText: mid-stream overloaded error frame → TRANSIENT (retryable), not fatal", async () => {
  const chunks = [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"m"}}\n\n',
    'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}\n\n',
  ];
  await assert.rejects(
    () => streamMessagesText({ apiKey: "k", body: { messages: [] }, fetchImpl: async () => okRes(chunks) }),
    (e) => { assert.equal(isFatalAnthropic(e), false); assert.match(e.message, /TRANSIENT/); return true; },
  );
});

test("heartbeat: fires on real text GROWTH (progress-tied, not a wall-clock timer)", async () => {
  const chunks = [MSG_START, textDelta("x".repeat(40)), textDelta("y".repeat(40)), MSG_STOP];
  const beats = await captureBeats(() =>
    streamMessagesText({ apiKey: "k", body: { messages: [] }, heartbeatMs: 0, fetchImpl: async () => ({ ok: true, status: 200, body: delayedStreamOf(chunks, 4) }) }),
  );
  assert.ok(beats.length >= 1, "growing stream must emit at least one progress beat");
  assert.match(beats[0], /streaming \+\d+ chars/);
});

test("heartbeat: a STALLED stream (chunks arrive, NO new tokens) stays SILENT — a genuine hang is never masked", async () => {
  // message_start + pings arrive (socket alive) but text never grows. The progress-tied beat must NOT
  // fire, so the watchdog still sees silence and can kill a real hang. This is the anti-masking guarantee.
  const stall = [MSG_START, PING, PING, PING, MSG_STOP];
  const beats = await captureBeats(() =>
    streamMessagesText({ apiKey: "k", body: { messages: [] }, heartbeatMs: 0, fetchImpl: async () => ({ ok: true, status: 200, body: delayedStreamOf(stall, 4) }) }),
  );
  assert.equal(beats.length, 0, "a no-token stream must stay silent (not reported as healthy)");
});

test("streamMessagesText: a no-progress stream trips the idle watchdog as TRANSIENT (the hang fix)", async () => {
  const neverStream = new ReadableStream({ start() { /* never enqueues, never closes */ } });
  await assert.rejects(
    () => streamMessagesText({ apiKey: "k", body: { messages: [] }, idleMs: 40, fetchImpl: async () => ({ ok: true, status: 200, body: neverStream }) }),
    (e) => { assert.equal(isFatalAnthropic(e), false); assert.match(e.message, /idle/); return true; },
  );
});

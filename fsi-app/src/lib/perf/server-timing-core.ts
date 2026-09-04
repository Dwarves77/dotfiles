// Pure, dependency-free core of the Server-Timing instrumentation (lane PERF-ARCH, 2026-09-04).
//
// WHY THIS IS SPLIT FROM server-timing.ts (the exact shape src/lib/detail/load-detail-core.ts
// established, cited in that file's own header): server-timing.ts's ambient API is backed by
// React's cache() — the SAME request-scoped memoization src/lib/api/server-bootstrap.ts and
// src/lib/api/org.ts already use, so unrelated modules within one request (auth, a listing RPC,
// a detail-page loader) can call recordPhase()/timePhase() and land on ONE shared per-request
// store with no store threaded through props or arguments. But PERF-6 read the installed React
// source and proved (docs/audits/perf-load-times-2026-09-03.md §12.4) that cache() only memoizes
// inside an ACTIVE render/work-unit dispatcher (a real RSC render or a Route Handler's
// workUnitAsyncStorage) — outside one (plain `node --test`, a script) it is a harmless
// passthrough that calls the wrapped function FRESH every call. A module whose only API relies on
// that cross-call memoization therefore cannot prove its own accumulation logic under `node
// --test`: every call would mint its own empty store, and there would be nothing to assert
// against. This file is the part that needs no dispatcher at all — every function takes its store
// as an explicit argument — so it is fully, portably testable (no "react" import, no "next/*"
// import of any kind, value or type), and server-timing.ts's ambient wrapper is provably just
// `getStore()` (cache()-backed) plus a direct call into these functions — nothing about the
// accumulation, formatting, or byte-measurement logic depends on cache() actually memoizing.
//
// PHASES THIS LANE'S OWN DIAGNOSIS NAMES (docs/audits/perf-waterfall-2026-09-04.md; the dispatch's
// own list): coldstart, auth, org, listing_rpc, counts, detail_core, serialize_bytes, total. Named
// here as documentation only — `recordPhaseOnStore`/`recordBytesOnStore` accept any string, since
// a bootstrap-route caller (this lane's own wired example, src/app/api/workspace/bootstrap/route.ts)
// has a different, equally legitimate phase vocabulary (personal_state, list_orders, members,
// admin_attention). PERF_PHASES below is the named list for callers that DO want the shared
// vocabulary (a future PERF-10/PERF-11 pass instrumenting the four detail/listing pages, out of
// this lane's write set — see ADR-027).

export const PERF_PHASES = {
  AUTH: "auth",
  ORG: "org",
  LISTING_RPC: "listing_rpc",
  COUNTS: "counts",
  DETAIL_CORE: "detail_core",
  SERIALIZE_BYTES: "serialize_bytes",
} as const;

export interface PerfPhaseRecord {
  readonly name: string;
  /** Present for a duration phase (auth, listing_rpc, ...). Mutually exclusive with `bytes` on
   *  one record — a phase is either timed or sized, never both, so the two render unambiguously
   *  in both the Server-Timing header (`dur=` vs `desc=`) and the log line (`Nms` vs `Nbytes`). */
  readonly durationMs?: number;
  /** Present for a size phase (serialize_bytes). See durationMs's note. */
  readonly bytes?: number;
}

export interface PerfTimingStore {
  readonly requestStartedAt: number;
  readonly coldStart: boolean;
  readonly phases: PerfPhaseRecord[];
}

/** process.uptime() < this at request start ⇒ coldstart phase, per the dispatch's own definition. */
export const COLD_START_UPTIME_SECONDS = 5;

export function createTimingStore(
  nowMs: number = Date.now(),
  processUptimeSeconds: number = Number.POSITIVE_INFINITY
): PerfTimingStore {
  return {
    requestStartedAt: nowMs,
    coldStart: processUptimeSeconds < COLD_START_UPTIME_SECONDS,
    phases: [],
  };
}

export function recordPhaseOnStore(store: PerfTimingStore, name: string, durationMs: number): void {
  store.phases.push({ name, durationMs: Math.max(0, Math.round(durationMs)) });
}

export function recordBytesOnStore(store: PerfTimingStore, name: string, bytes: number): void {
  store.phases.push({ name, bytes: Math.max(0, Math.round(bytes)) });
}

/** Time an async (or sync) phase and record it on `store`, returning the wrapped call's own
 *  result unchanged. Records the phase even when `fn` throws (matches the repo's existing
 *  soft-fail convention — a timed phase that failed is still evidence, not a hole in the trace). */
export async function timePhaseOnStore<T>(
  store: PerfTimingStore,
  name: string,
  fn: () => Promise<T> | T
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    recordPhaseOnStore(store, name, Date.now() - start);
  }
}

/** UTF-8 wire byte length of a JSON-serializable value — the "serialize_bytes" phase (the
 *  dispatch's own definition: "JSON size of the props passed to client components"). Uses
 *  TextEncoder rather than Buffer.byteLength so this is callable from an edge-runtime caller too
 *  (TextEncoder is a Web-standard global present in both Node and Edge; Buffer is Node-only) —
 *  same portability reasoning proxy.ts's own comments already apply elsewhere in this codebase.
 *  Never throws: an unserializable value (a circular structure, a BigInt) yields 0 rather than
 *  crashing the caller's render over an instrumentation side-channel. */
export function measureJsonBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 0 : new TextEncoder().encode(json).length;
  } catch {
    return 0;
  }
}

// A Server-Timing metric name must be an HTTP token (RFC 9110 §5.6.2 via the W3C Server Timing
// spec): no whitespace, no DQUOTE, none of the delimiters "(),/:;<=>?@[\]{}". Every phase name
// this module ships is our own literal constant, never end-user input, but sanitizing defensively
// means a future caller's bad name degrades to one renamed header entry instead of a malformed
// response — the same defensive posture F34/F36's own header-safety reasoning uses elsewhere.
const TOKEN_UNSAFE_RE = /[^A-Za-z0-9_-]/g;

export function sanitizeTimingName(name: string): string {
  const cleaned = String(name).replace(TOKEN_UNSAFE_RE, "_");
  return cleaned.length > 0 ? cleaned : "phase";
}

/** Render the Server-Timing HTTP header value for one store (W3C Server Timing:
 *  https://www.w3.org/TR/server-timing/ — "name;dur=value;desc=value", comma-separated entries).
 *  Duration phases render as `name;dur=123`; byte-count phases (serialize_bytes) render as
 *  `name;desc="123B"` since `dur` is specified as a duration, not a magnitude — misusing it for a
 *  byte count would make the header lie about its own units to any tool that parses it (Chrome
 *  DevTools' Network panel included). A synthetic `total` duration (now - requestStartedAt) and a
 *  `coldstart` marker (always present, `desc="cold"`/`desc="warm"` — never omitted, so a reader
 *  never has to infer "warm" from absence) are always appended last. */
export function toServerTimingHeader(store: PerfTimingStore, now: number = Date.now()): string {
  const entries = store.phases.map((p) => {
    const token = sanitizeTimingName(p.name);
    if (typeof p.bytes === "number") return `${token};desc="${p.bytes}B"`;
    return `${token};dur=${Math.max(0, Math.round(p.durationMs ?? 0))}`;
  });
  entries.push(`total;dur=${Math.max(0, now - store.requestStartedAt)}`);
  entries.push(`coldstart;desc="${store.coldStart ? "cold" : "warm"}"`);
  return entries.join(", ");
}

/** The same store as one structured log line, matching this repo's existing `[perf] ...`
 *  console.log convention (e.g. src/app/regulations/[slug]/page.tsx:249 "[perf]
 *  /regulations/${id} data ${ms}ms", src/lib/data.ts:293 "[perf] getListingsOnly ${ms}ms") —
 *  extended with a per-phase breakdown instead of one flat total. This is the channel that
 *  reaches a full RSC page render: Next.js has no supported way to attach a response header from
 *  inside a Server Component (see server-timing.ts's header and ADR-027 §"Server-Timing and RSC
 *  pages" for the doc citation), so for page renders this log line — not an HTTP header — is the
 *  phase-level artifact a coordinator reads back from Vercel's runtime logs, the exact tool
 *  docs/audits/perf-load-times-2026-09-03.md §3/§9/§12 already used for every prior PERF lane's
 *  before/after measurement. */
export function toPerfLogLine(routeLabel: string, store: PerfTimingStore, now: number = Date.now()): string {
  const parts = store.phases.map((p) =>
    typeof p.bytes === "number" ? `${p.name}=${p.bytes}bytes` : `${p.name}=${Math.round(p.durationMs ?? 0)}ms`
  );
  const total = Math.max(0, now - store.requestStartedAt);
  return `[perf] ${routeLabel} ${parts.join(" ")} total=${total}ms coldstart=${store.coldStart ? 1 : 0}`;
}

/** Apply a store's Server-Timing header to a standard Fetch API `Response` (or `NextResponse`,
 *  which extends it) without importing "next/server" — `Response`/`Headers` are Web-standard
 *  globals available in Node 18+ and every edge runtime, so this stays usable from a Route
 *  Handler, from proxy.ts, or from a plain test, with zero framework-specific dependency. Clones
 *  the response (a Response's body can only be read/consumed once; constructing a new one with
 *  the same body/status/headers-plus-one is the standard way to add a header to an
 *  already-built Response without touching whatever produced it). */
export function applyServerTimingHeader(response: Response, store: PerfTimingStore, now: number = Date.now()): Response {
  const headers = new Headers(response.headers);
  headers.append("Server-Timing", toServerTimingHeader(store, now));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

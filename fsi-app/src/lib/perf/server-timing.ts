// Ambient, request-scoped Server-Timing instrumentation (lane PERF-ARCH, 2026-09-04).
// docs/audits/perf-waterfall-2026-09-04.md (Part 1b) / docs/decisions/ADR-027-*.md.
//
// React cache(): request-scoped memoization — the IDENTICAL pattern
// src/lib/api/server-bootstrap.ts's resolveServerBootstrap and src/lib/api/org.ts's
// resolveOrgIdFromCookies already use (both cited by PERF-6/PERF-7,
// docs/audits/perf-load-times-2026-09-03.md §12.4/§13). The same call from ANY Server Component or
// Route Handler within one request returns the SAME store object, so recordPhase() calls from
// unrelated modules (an auth check, a listing RPC, a detail-page loader) accumulate onto one
// shared per-request record with no store threaded through props or function arguments — the
// brief's own instruction ("whichever the repo already uses for per-request state: read
// src/lib/api/server-bootstrap.ts") is followed exactly, not reinvented.
//
// SAFETY OUTSIDE A REQUEST (verified, not assumed — PERF-6 read the installed React source,
// node_modules/react/cjs/react.react-server.development.js's `exports.cache`, §12.4): "when there
// is no active render dispatcher, cache()'s wrapper just calls the underlying function directly,
// every time — no memoization, and critically, no cross-request state to leak." That is why this
// file's own logic is a thin pass-through into server-timing-core.ts (see that file's header) —
// this module is not independently required to prove the accumulation logic works; the core does,
// under plain `node --test`, with an explicit store. This file's own test only proves the ambient
// wrapper's shape (exports exist, delegate correctly) using the SAME "no dispatcher ⇒ no memo"
// behavior, not by relying on memoization it cannot get outside a real request.
//
// ROUTE-HANDLER SCOPE, CONFIRMED (PERF-6 §12.4, reading Next 16.1.6's installed source): "Next
// 16.1.6's Route Handler module, node_modules/next/dist/server/route-modules/app-route/module.js:427,
// runs the handler inside workUnitAsyncStorage.run(requestStore, handler, ...) — a fresh,
// request-scoped store per request" — so cache() memoizes correctly inside a Route Handler too,
// not only inside a Server Component render. This is why the SAME getStore() below backs both
// src/app/api/workspace/bootstrap/route.ts's timing (a Route Handler) and, for a future caller
// in this lane's write set, an RSC page's timing — one module, two call shapes, proven by the
// same citation.
//
// SERVER-TIMING AND RSC PAGES — the limit this module does NOT paper over: Next.js's own docs
// (nextjs.org/docs/app/api-reference/functions/after, fetched 2026-09-04) state `after()` "allows
// you to schedule work to be executed after a response... is finished" and is "useful for tasks
// and other side effects that should not block the response" — it runs once the response has
// already been sent, so it cannot attach a header to that response. There is no other supported
// hook for a Server Component to set a response header on a full-document RSC render. See
// ADR-027 for the full citation trail and the OpenTelemetry (`@vercel/otel`) recommendation this
// finding leads to — this module's `withServerTiming` below therefore only ever promises a real
// HTTP header for a Route Handler / proxy response; a page's own phase breakdown goes out via
// `toPerfLogLine` (server-timing-core.ts), extending this codebase's existing `[perf] ...
// console.log` convention rather than inventing a header mechanism the framework does not support
// for pages.

import { cache } from "react";
import {
  createTimingStore,
  recordPhaseOnStore,
  recordBytesOnStore,
  timePhaseOnStore,
  toServerTimingHeader,
  toPerfLogLine,
  measureJsonBytes,
  applyServerTimingHeader,
  PERF_PHASES,
  COLD_START_UPTIME_SECONDS,
  type PerfTimingStore,
  type PerfPhaseRecord,
} from "./server-timing-core.ts";

export { PERF_PHASES, COLD_START_UPTIME_SECONDS };
export type { PerfTimingStore, PerfPhaseRecord };

function safeProcessUptimeSeconds(): number {
  try {
    return typeof process !== "undefined" && typeof process.uptime === "function"
      ? process.uptime()
      : Number.POSITIVE_INFINITY; // no `process` (a stripped edge sandbox): never flag "cold" on this signal alone
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

const getStore = cache((): PerfTimingStore => createTimingStore(Date.now(), safeProcessUptimeSeconds()));

/** The current request's timing store (creates it on first call within this request). */
export function getTimingSnapshot(): PerfTimingStore {
  return getStore();
}

/** Record a phase's duration onto the current request's store. */
export function recordPhase(name: string, durationMs: number): void {
  recordPhaseOnStore(getStore(), name, durationMs);
}

/** Record a byte-count phase (e.g. PERF_PHASES.SERIALIZE_BYTES) onto the current request's store. */
export function recordBytesPhase(name: string, bytes: number): void {
  recordBytesOnStore(getStore(), name, bytes);
}

/** Time an async (or sync) phase and record it, returning `fn`'s own result unchanged. */
export function timePhase<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  return timePhaseOnStore(getStore(), name, fn);
}

/** Measure `value`'s JSON wire size and record it as a bytes phase in one call — the
 *  `serialize_bytes` phase's intended call shape: `recordSerializedBytes(propsPassedToClient)`. */
export function recordSerializedBytes(value: unknown, name: string = PERF_PHASES.SERIALIZE_BYTES): number {
  const bytes = measureJsonBytes(value);
  recordBytesOnStore(getStore(), name, bytes);
  return bytes;
}

/** The current request's store, as one `[perf] ...` log line (see server-timing-core.ts's header
 *  for why this — not a header — is the channel for a full RSC page render). */
export function logTimingLine(routeLabel: string): string {
  return toPerfLogLine(routeLabel, getStore());
}

/** Attach the current request's Server-Timing header to a Route Handler's Response —
 *  the one call an `app/api/**` route needs to add (see
 *  src/app/api/workspace/bootstrap/route.ts for the wired example). Framework-agnostic (Web
 *  Response/Headers only — see server-timing-core.ts's applyServerTimingHeader), so it also works
 *  from proxy.ts without importing "next/server" as a value. */
export function withServerTiming(response: Response): Response {
  return applyServerTimingHeader(response, getStore());
}

/** The current request's Server-Timing header value, for a caller that builds its own Response
 *  (e.g. one that also needs to set other headers in the same object) rather than post-processing
 *  an existing one with withServerTiming. */
export function getServerTimingHeaderValue(): string {
  return toServerTimingHeader(getStore());
}

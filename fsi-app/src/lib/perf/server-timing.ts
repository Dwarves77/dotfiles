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

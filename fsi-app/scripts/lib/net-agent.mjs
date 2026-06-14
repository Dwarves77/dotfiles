/** Bounded-pool undici dispatcher (operator correction 2026-06-13) to tame the transient sandbox
 *  outbound-network instability that surfaced as `TypeError: fetch failed` on the Anthropic + Browserless
 *  calls. Importing this module (side-effect) installs a global Agent with:
 *    - SHORT keepAliveTimeout: retire idle sockets BEFORE the peer resets them — kills the stale-socket
 *      ECONNRESET that the global fetch's default long keep-alive invited (the dominant failure cause).
 *    - LOW connections cap + NO pipelining: gentle, predictable concurrency per origin.
 *  Chosen over `Connection: close` deliberately: keep-alive is RETAINED (warm sockets), just not allowed
 *  to go stale — so we do NOT force a fresh DNS+TLS per call (DNS ENOTFOUND/EAI_AGAIN is itself one of the
 *  intermittent failures here, and per-call DNS would raise that rate). Applies process-wide (the pipeline
 *  is jiti-imported into the same process); DB WRITES stay on pg-direct regardless. */
import { Agent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(new Agent({
  keepAliveTimeout: 4000,        // ms idle before a kept-alive socket is retired (well under peer reset window)
  keepAliveMaxTimeout: 10000,
  connections: 4,                // low per-origin concurrency cap
  pipelining: 0,                 // no request pipelining
  connect: { timeout: 10000 },   // bounded TCP+TLS connect
}));

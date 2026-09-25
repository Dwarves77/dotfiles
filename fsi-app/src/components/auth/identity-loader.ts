/**
 * The identity lookup's attempt loop, lifted out of AuthProvider.tsx (lane AUTH-IDENTITY, 2026-09-24)
 * so its behaviour is provable with `node --test` + jiti; this repo has no JSX mount harness for a
 * provider (see app-shell-banner.ts's header for that constraint).
 *
 * THE DEFECT [CONFIRMED by code read; the live instance is the operator's 16:51Z sign-in, 2026-09-24]:
 * AuthProvider fetched `/api/auth/identity` exactly once per tab. Any rejection or non-200 went to
 * `seed(null)`, which resolved to the RESOLVED-no-org value, so a single failed request showed "No
 * workspace yet" and hid Admin for the rest of the tab's life.
 *
 * THE BEHAVIOUR NOW:
 *   - A round is up to IDENTITY_ATTEMPTS_PER_ROUND attempts: the first immediately, then after each
 *     delay in IDENTITY_RETRY_DELAYS_MS. A 200 with a bootstrap body ends the round as `resolved`.
 *   - A round that exhausts its attempts ends as `error` (IDENTITY_ERROR_SEED: orgId UNKNOWN), never as
 *     "no workspace".
 *   - `rearm()` starts ONE new round, and only when the last round ended in `error` and nothing is in
 *     flight or scheduled. AuthProvider calls it on window focus, on the tab becoming visible, and from
 *     the error note's Retry action. Those are the only triggers: no polling, no other timers.
 *   - A `resolved` answer is final (shouldApplySeed); rearm() is then a no-op.
 */
import {
  IDENTITY_ERROR_SEED,
  nextIdentityRetryDelay,
  resolveAuthSeed,
  shouldApplySeed,
  type AuthSeed,
  type BootstrapLike,
  type IdentityStatus,
} from "../shell/bootstrap-seed";

export interface IdentityLoaderDeps {
  /**
   * One attempt. Resolve with the parsed body on a 200, `null` on any non-200; a rejection (network
   * failure, unparseable body) counts as a failed attempt exactly like `null`.
   */
  fetchIdentity: () => Promise<unknown>;
  /** Receives every APPLIED answer (never a discarded one). */
  onSeed: (seed: AuthSeed) => void;
  /** True while a re-armed round is running after an `error`, false when it ends. For the Retry note. */
  onRetrying?: (retrying: boolean) => void;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
}

export interface IdentityLoader {
  start: () => void;
  rearm: () => void;
  stop: () => void;
  status: () => IdentityStatus;
}

/** A 200 body is a bootstrap only if it has the route's shape; anything else is a failed attempt. */
function asBootstrap(body: unknown): BootstrapLike | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Partial<BootstrapLike>;
  if (!("user" in b) || !("orgId" in b) || !Array.isArray(b.sectors) || !Array.isArray(b.workspaceSectors)) {
    return null;
  }
  return b as BootstrapLike;
}

export function createIdentityLoader(deps: IdentityLoaderDeps): IdentityLoader {
  let status: IdentityStatus = "pending";
  let attemptsThisRound = 0;
  let inFlight = false;
  let timer: unknown = null;
  let stopped = false;
  let retrying = false;

  const setRetrying = (v: boolean) => {
    if (retrying === v) return;
    retrying = v;
    deps.onRetrying?.(v);
  };

  const apply = (seed: AuthSeed) => {
    if (!shouldApplySeed(status, seed.status)) return;
    status = seed.status;
    deps.onSeed(seed);
  };

  const attempt = async (): Promise<void> => {
    if (stopped || status === "resolved") return;
    inFlight = true;
    let bootstrap: BootstrapLike | null = null;
    try {
      bootstrap = asBootstrap(await deps.fetchIdentity());
    } catch {
      bootstrap = null;
    }
    inFlight = false;
    if (stopped) return;
    attemptsThisRound += 1;

    if (bootstrap) {
      apply(resolveAuthSeed(bootstrap));
      setRetrying(false);
      return;
    }
    const delay = nextIdentityRetryDelay(attemptsThisRound);
    if (delay === null) {
      apply(IDENTITY_ERROR_SEED);
      setRetrying(false);
      return;
    }
    timer = deps.schedule(() => {
      timer = null;
      void attempt();
    }, delay);
  };

  return {
    start() {
      if (stopped || inFlight || timer !== null || attemptsThisRound > 0) return;
      void attempt();
    },
    rearm() {
      if (stopped || status !== "error" || inFlight || timer !== null) return;
      attemptsThisRound = 0;
      setRetrying(true);
      void attempt();
    },
    stop() {
      stopped = true;
      if (timer !== null) deps.cancel(timer);
      timer = null;
    },
    status: () => status,
  };
}

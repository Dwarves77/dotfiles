// live-preflight.mjs (lane GATES-2, 2026-10-05): the fail-fast check the Live smoke workflow runs BEFORE npm ci
// or any browser install, so an unset secret or a bad target stops the job in seconds with a named message.
// Pure and dependency-free: it never prints a secret value, only whether one is present.

/** Hosts the smoke credentials may be sent to: production and Vercel deployments. */
export const ALLOWED_HOSTS = Object.freeze(["carosledge.com", "www.carosledge.com"]);
export const ALLOWED_HOST_SUFFIXES = Object.freeze([".vercel.app"]);

export const SECRET_NAMES = Object.freeze({ email: "LIVE_SMOKE_EMAIL", password: "LIVE_SMOKE_PASSWORD" });

const hostAllowed = (host) => ALLOWED_HOSTS.includes(host) || ALLOWED_HOST_SUFFIXES.some((s) => host.endsWith(s));

/**
 * @param {{url?: string|null, email?: string|null, password?: string|null}} input
 * @returns {{ok: boolean, errors: string[], origin: string|null}}
 */
export function preflight({ url, email, password } = {}) {
  const errors = [];
  if (!String(email ?? "").trim()) {
    errors.push(
      `${SECRET_NAMES.email} secret is not set. Add it under repository Settings, Secrets and variables, Actions: the dedicated read-only smoke account's email.`,
    );
  }
  if (!String(password ?? "").trim()) {
    errors.push(
      `${SECRET_NAMES.password} secret is not set. Add it under repository Settings, Secrets and variables, Actions: the dedicated read-only smoke account's password.`,
    );
  }
  let origin = null;
  const raw = String(url ?? "").trim();
  if (!raw) {
    errors.push("target url is empty: pass the url input (workflow_dispatch) or run on a successful deployment_status event that carries an environment url.");
  } else {
    let u = null;
    try {
      u = new URL(raw);
    } catch {
      errors.push(`target url is not a valid URL: ${raw.slice(0, 80)}`);
    }
    if (u) {
      if (u.protocol !== "https:") errors.push(`target url must be https, got ${u.protocol.replace(":", "")}.`);
      else if (!hostAllowed(u.hostname)) {
        errors.push(
          `target host ${u.hostname} is not allowed: the smoke credentials are only sent to ${ALLOWED_HOSTS.join(", ")} or *${ALLOWED_HOST_SUFFIXES.join(", *")}.`,
        );
      } else origin = u.origin;
    }
  }
  return { ok: errors.length === 0, errors, origin };
}

/** CLI for the workflow's fail-fast step: reads LIVE_SMOKE_URL / LIVE_SMOKE_EMAIL / LIVE_SMOKE_PASSWORD. */
export function runPreflightCli(env = process.env, log = console.error) {
  const r = preflight({ url: env.LIVE_SMOKE_URL, email: env.LIVE_SMOKE_EMAIL, password: env.LIVE_SMOKE_PASSWORD });
  for (const e of r.errors) log(`::error::${e}`);
  return r.ok ? 0 : 1;
}

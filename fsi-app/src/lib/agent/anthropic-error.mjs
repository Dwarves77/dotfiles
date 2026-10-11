/** @returns {{ fatal: boolean, label: string, message: string, status: number }} */

export function classifyAnthropic(status, body) {
  const err = (body && body.error) || {};
  const msg = err.message || (body ? JSON.stringify(body) : "");
  const fatal = status === 400 || status === 401 || status === 403;
  const label = /credit balance is too low|plans\s*&\s*billing|purchase credits/i.test(msg)
    ? "ANTHROPIC_OUT_OF_CREDITS"
    : fatal ? "ANTHROPIC_FATAL" : "ANTHROPIC_TRANSIENT";
  return { fatal, label, message: `${label} (HTTP ${status} ${err.type || "error"}): ${msg}`, status };
}

/** Build a thrown Error carrying the classification (so callers/runners can branch on e.fatal). */
export function anthropicError(status, body) {
  const c = classifyAnthropic(status, body);
  const e = /** @type {Error & {fatal:boolean,status:number}} */ (new Error(c.message));
  e.fatal = c.fatal; e.status = c.status;
  return e;
}

/** True when an error came from anthropicError and is fatal/non-retryable. */
export function isFatalAnthropic(e) { return !!(e && e.fatal); }

/** FUNDED-PASS RUN-LOCK client (Wave 2 concurrent-race hardening, 2026-07-15; migration 205).
 *  DB-level mutual exclusion so a second funded-pass process can NEVER drive the same worklist (the race that
 *  zeroed Nashville + Fjords). Backed by public.funded_pass_runlock + the acquire/heartbeat/release SQL
 *  functions. A live holder blocks acquisition (acquired=false); the caller exits with zero spend. A holder
 *  whose heartbeat is older than STALE_SECONDS is claimable (takeover, logged in the row). Pairs with the
 *  emergencyPaused between-item poll so an operator STOP is a flag-flip, never a process kill.
 */
export const LOCK_KEY = "funded-pass";
export const STALE_SECONDS = 300; // 5 min; heartbeat runs between items, well under this
export const HEARTBEAT_MIN_MS = 30_000; // don't heartbeat more than once per 30s

/** Acquire the run-lock (atomic acquire-or-takeover-or-fail). Returns
 *  { ok, takeover, holderLabel, holderPid, heartbeatAt }. ok=false means a live holder owns it. */
export async function acquireRunLock(sb, { key = LOCK_KEY, label, pid, host, worklistRef, staleSeconds = STALE_SECONDS }) {
  const { data, error } = await sb.rpc("acquire_funded_pass_lock", {
    p_key: key, p_label: label, p_pid: pid, p_host: host, p_worklist: worklistRef, p_stale_seconds: staleSeconds,
  });
  if (error) return { ok: false, error: error.message, holderLabel: null, holderPid: null };
  const r = Array.isArray(data) ? data[0] : data;
  return {
    ok: !!r?.acquired, takeover: !!r?.takeover,
    holderLabel: r?.cur_label ?? null, holderPid: r?.cur_pid ?? null, heartbeatAt: r?.cur_heartbeat ?? null,
  };
}

/** Refresh the heartbeat. Returns true only while THIS pid still owns the lock; false = the lock was taken
 *  over (caller should halt — it no longer holds exclusivity). */
export async function heartbeatRunLock(sb, { key = LOCK_KEY, pid }) {
  const { data, error } = await sb.rpc("heartbeat_funded_pass_lock", { p_key: key, p_pid: pid });
  if (error) return false;
  const r = Array.isArray(data) ? data[0] : data;
  return !!r?.still_held;
}

/** Release the lock iff THIS pid owns it (clean-exit release; a takeover already replaced the pid). */
export async function releaseRunLock(sb, { key = LOCK_KEY, pid }) {
  const { error } = await sb.rpc("release_funded_pass_lock", { p_key: key, p_pid: pid });
  return !error;
}

/** Read the operator emergency-stop (system_state.global_processing_paused) — the flag-flip STOP path so a
 *  running funded-pass halts gracefully (releases the lock, no mid-write kill). Fails OPEN to not-paused on a
 *  read error (a transient read error must not wedge a legitimately-running pass); the between-item cadence
 *  re-reads on the next item, so a real pause is caught within one item. */
export async function emergencyPaused(sb) {
  const { data, error } = await sb.from("system_state").select("global_processing_paused").eq("id", true).maybeSingle();
  if (error) return false;
  return !!data?.global_processing_paused;
}

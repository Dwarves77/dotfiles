const one = (data) => (Array.isArray(data) ? data[0] : data);

/** Acquire the lease. Returns {acquired, takeover, cur_holder, cur_heartbeat}. acquired=false => held by cur_holder. */
export async function acquireLease(sb, itemId, holder, lane = null, staleSeconds = 300) {
  const { data, error } = await sb.rpc("acquire_mutation_lease", { p_item: itemId, p_holder: holder, p_lane: lane, p_stale_seconds: staleSeconds });
  if (error) throw new Error(`acquire_mutation_lease failed (${itemId}): ${error.message}`);
  return one(data);
}

/** Refresh the holder's heartbeat. Returns true while THIS holder still owns it; false => taken over (halt). */
export async function heartbeatLease(sb, itemId, holder) {
  const { data, error } = await sb.rpc("heartbeat_mutation_lease", { p_item: itemId, p_holder: holder });
  if (error) throw new Error(`heartbeat_mutation_lease failed (${itemId}): ${error.message}`);
  return !!one(data)?.still_held;
}

/** Release the lease (only the holder can). Returns true if a row was released. */
export async function releaseLease(sb, itemId, holder) {
  const { data, error } = await sb.rpc("release_mutation_lease", { p_item: itemId, p_holder: holder });
  if (error) throw new Error(`release_mutation_lease failed (${itemId}): ${error.message}`);
  return !!one(data)?.released;
}

/**
 * Run `fn` under the item's lease. Acquires first; if the lease is held by another session, THROWS a named
 * error (never proceeds) so no item is ever worked without its lease. Releases in finally (acquire/release pair).
 * @returns whatever fn resolves to.
 */
export async function withLease(sb, itemId, holder, lane, fn) {
  const res = await acquireLease(sb, itemId, holder, lane);
  if (!res.acquired) {
    const err = new Error(`LEASE HELD: item ${itemId} is leased by "${res.cur_holder}" (heartbeat ${res.cur_heartbeat}) — refusing to work it (mutation-lease H5)`);
    err.leaseHeldBy = res.cur_holder;
    throw err;
  }
  try {
    return await fn();
  } finally {
    await releaseLease(sb, itemId, holder).catch((e) => console.warn(`[mutation-lease] release failed for ${itemId}: ${e.message}`));
  }
}

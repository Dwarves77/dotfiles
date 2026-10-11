/**
 * Split `items` into the ones a run may promote and the ones it must defer.
 * @template T
 * @param {T[]} items the eligible (would-mint) candidates, oldest-eligible first
 * @param {number} cap max_promote for this run. A non-finite or negative value is treated as "no cap"
 *   (every item promotable), the same permissive default `opts.maxPromote === undefined` gets at the
 *   call site in portal-harvest.ts.
 * @returns {{toPromote: T[], deferred: T[]}} toPromote = items.slice(0, cap); deferred = the remainder,
 *   left completely untouched by the caller (ledger status stays 'candidate') for a later apply run.
 */

export function applyPromoteCap(items, cap) {
  const n = Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : items.length;
  return {
    toPromote: items.slice(0, n),
    deferred: items.slice(n),
  };
}

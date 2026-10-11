const ABSENT_RE = /does not exist|could not find|schema cache|relation .* does not exist|column .* does not exist/i;

/** True when `e` is the error a read raises because a table or column is not there yet. @param {unknown} e */
export function isAbsentError(e) {
  return ABSENT_RE.test(e instanceof Error ? e.message : String(e));
}

/** Run a read that may fail because a migration is not applied yet. @returns {Promise<{rows: object[], absent: boolean}>} */
export async function readTolerant(fn) {
  try {
    return { rows: (await fn()) ?? [], absent: false };
  } catch (e) {
    if (isAbsentError(e)) return { rows: [], absent: true };
    throw e;
  }
}

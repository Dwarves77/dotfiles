import { cache } from "react";

/** The one instant for this server render. Serialise it into client props as `nowIso`. */
export const renderNowIso = cache((): string => new Date().toISOString());

/** Parse a `nowIso` prop back to a Date. Falls back to the epoch-free "now" only when the prop
 *  is absent (a caller that has not been threaded yet) — never silently, the caller's own prop
 *  type keeps it required on every threaded surface. */
export function nowFrom(nowIso: string | undefined): Date {
  return nowIso ? new Date(nowIso) : new Date();
}

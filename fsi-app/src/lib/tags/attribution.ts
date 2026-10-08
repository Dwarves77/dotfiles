/**
 * Workspace tag attribution (lane s8b-tag-attribution, 2026-10-07, migration 360 / plan Stage 8).
 *
 * A workspace tag shows who applied it and when. Inside a workspace the members see each other's
 * names (the Community pseudonymity rules do not apply here), so the name is the profile's own
 * name. The pair is stored on the item_workspace_tags join row as created_by / created_at
 * (migration 313): the tag write route stamps created_by from the session, never from the request
 * body, and created_at is the column default. This module holds the pure shaping and wording so
 * the route (server) and the chip and list (client) read one definition and cannot drift.
 *
 * Pure: no imports, no I/O, safe for the browser bundle and the no-database tests.
 */

/** One tag application on one item, as the GET route returns it and the components read it. */
export interface TagApplication {
  tagId: string;
  /** The applying member's user id; null when that account no longer exists (created_by is
   *  ON DELETE SET NULL, migration 313). */
  appliedBy: string | null;
  /** The applying member's display name; null when there is no author or no name on the profile. */
  appliedByName: string | null;
  /** When the tag was applied (ISO timestamp from item_workspace_tags.created_at). */
  appliedAt: string | null;
}

/** The profile columns the name resolution reads. */
export interface ProfileNameRow {
  id: string;
  full_name?: string | null;
  display_name?: string | null;
}

/** A join row as the bounded read returns it. */
export interface TagLinkRow {
  tag_id: string;
  created_by: string | null;
  created_at: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A member's display name: full name, else display name, else null. An email is never used, so a
 *  tag tooltip cannot leak an address. */
export function memberDisplayName(profile: Pick<ProfileNameRow, "full_name" | "display_name"> | null | undefined): string | null {
  const full = profile?.full_name?.trim();
  if (full) return full;
  const display = profile?.display_name?.trim();
  return display || null;
}

/** Shape the bounded join-row read plus the resolved names into one application per tag. */
export function buildApplications(
  rows: TagLinkRow[],
  nameById: ReadonlyMap<string, string | null>
): TagApplication[] {
  return rows.map((row) => ({
    tagId: row.tag_id,
    appliedBy: row.created_by,
    appliedByName: row.created_by ? nameById.get(row.created_by) ?? null : null,
    appliedAt: row.created_at,
  }));
}

/** "3 Sep 2026", in UTC so the same instant reads the same on the server, in the browser and in a
 *  test. Null for a missing or unparseable timestamp. */
export function formatAppliedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "applied by Ada Lovelace on 3 Sep 2026". The wording the tag chip's title and the tag list both
 *  show. A removed account reads "a former member"; a member with no name on the profile reads "a
 *  workspace member"; a missing date drops the "on ..." clause rather than printing a placeholder. */
export function attributionText(application: TagApplication | null | undefined): string | null {
  if (!application) return null;
  const who = application.appliedByName
    ? application.appliedByName
    : application.appliedBy
      ? "a workspace member"
      : "a former member";
  const when = formatAppliedDate(application.appliedAt);
  return when ? `applied by ${who} on ${when}` : `applied by ${who}`;
}

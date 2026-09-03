"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { WatchlistItemType } from "@/lib/data";
import { isTeamOnlyWatchType } from "@/lib/watchlist-scope";
import { getClientWatchMembership, lookupWatchMembership } from "@/lib/watchlist/membership";

/** WatchButton — the WIRED watch toggle (chrome-audit S2-04, browser wave).
 *
 *  Replaces the two byte-identical local-state stubs that lived privately in
 *  RegulationDetailSurface and MarketSignalDetailSurface ("toggles a local pressed state") —
 *  one home now, persisting to user_watchlist via /api/watchlist (the new writer; migration 060's
 *  table + the DashboardWatchlist reader pre-existed). Auth follows the NotesField idiom: browser
 *  session → Bearer token. Optimistic toggle with revert-on-failure; state loads on mount so a
 *  watched item renders "Watching" after reload (the stubs always reset to unwatched).
 */
// Landing B (2026-08-01): palette became optional with semantic-token defaults so
// surfaces without a local palette object (research, operations) can mount the
// button; item_type union widened with migration 233's CHECK expansion.
//
// Dual scope (2026-08-02): the primary button remains the PERSONAL watch. A
// second pill toggles the TEAM watch (org_watchlist), which every member of the
// workspace sees. Per migration 077's shipped RLS any member may add or remove,
// so the pill carries no role gate — unlike the team archive, which is
// admin/owner-gated because it hides an item from everyone.
//
// The pill renders only when the server reports an org actually resolved
// (teamAvailable). A user with no workspace membership sees the personal button
// alone rather than an affordance that could only fail.
//
// The team API accepts an optional note; this button deliberately does not send
// one. A note needs an input surface, and adding a text field to a two-word
// toggle would be the wrong home for it.
//
// Team-only types (L6, Defect 3 — WO-23 follow-up): market_series is watchable
// at TEAM scope only (org_watchlist's CHECK admits it, user_watchlist's
// deliberately does not — /api/watchlist/route.ts's isTeamOnlyScopeViolation
// rejects a personal write with a clean 400). A button that still offered the
// personal control for such a type would be an affordance the API can only
// reject, so isTeamOnlyWatchType (src/lib/watchlist-scope.ts, the SAME
// decision route.ts's write handlers gate on) branches the render: the
// personal button is never shown for a team-only type, and when no team is
// available either (no workspace resolved) the widget renders a disabled
// explainer instead of a control that could only 403 — the same "no
// affordance that can only fail" principle the !teamAvailable branch above
// already applies to the team pill for every other type.
//
// itemType's type is WatchlistItemType (src/lib/supabase-server.ts, imported
// type-only via @/lib/data — the same precedent watchlist-links.ts already
// uses), not a locally hardcoded literal union. It used to be a hand-copied
// 5-value union that drifted the moment market_series (a 6th value) shipped,
// silently omitting the newest watchable type from this button's own prop
// type without either side raising a compile error. Importing the type means
// a 7th value added to the real union is a compile error here too, by
// construction, instead of a second place someone has to remember to update.
const DEFAULT_PALETTE = {
  accent: "var(--color-primary)",
  hairStrong: "var(--color-border)",
  tint: "var(--color-bg-raised)",
  card: "var(--color-bg-surface)",
  ink: "var(--color-text-primary)",
};

type WatchScope = "personal" | "team";

export function WatchButton({
  itemType,
  itemId,
  palette = DEFAULT_PALETTE,
  initialWatched,
  initialTeamWatched,
  initialTeamAvailable,
}: {
  itemType: WatchlistItemType;
  itemId: string;
  palette?: { accent: string; hairStrong: string; tint: string; card: string; ink: string };
  /**
   * Server-resolved initial state (PERF-3, 2026-09-03, docs/audits/perf-load-times-2026-09-03.md
   * item 2). When the caller can supply this (one server-side batch read for the whole page — see
   * src/lib/watchlist/membership.ts), WatchButton renders it immediately and fetches NOTHING on
   * mount — the GET this component used to fire unconditionally, once per instance, is skipped
   * entirely. `initialWatched` is the signal: pass all three together or none: a caller that knows
   * one of them knows all three (they come from the same server read).
   */
  initialWatched?: boolean;
  initialTeamWatched?: boolean;
  initialTeamAvailable?: boolean;
}) {
  const hasServerState = initialWatched !== undefined;
  const [watched, setWatched] = useState(initialWatched ?? false);
  const [teamWatched, setTeamWatched] = useState(initialTeamWatched ?? false);
  const [teamAvailable, setTeamAvailable] = useState(initialTeamAvailable ?? false);
  const [loaded, setLoaded] = useState(hasServerState);
  const [failed, setFailed] = useState(false);
  const [teamFailed, setTeamFailed] = useState(false);
  // One in-flight guard per scope: toggling the team pill must not block the
  // personal button, and vice versa.
  const busy = useRef<Record<WatchScope, boolean>>({ personal: false, team: false });

  useEffect(() => {
    // Server already supplied this instance's state (see initialWatched's own doc comment) —
    // nothing to fetch. This is the common case once a surface threads props from a server read;
    // every WatchButton call site that cannot (today: the four detail-page surfaces, fed by
    // [slug]/page.tsx files outside this lane's write set — see membership.ts's header) falls
    // through to the shared client-side cache below instead of firing its own request.
    if (hasServerState) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const authHeader = { Authorization: `Bearer ${session?.access_token || ""}` };
        // PERF-3: routed through the shared per-item_type membership cache instead of an ad hoc
        // fetch — N WatchButton instances of the same itemType on one page now share ONE network
        // request between them (see membership.ts's header for the "six fetches" defect this
        // replaces).
        const map = await getClientWatchMembership(itemType, { fetchImpl: fetch, authHeader });
        if (!cancelled) {
          const entry = lookupWatchMembership(map, itemId);
          setWatched(entry.watched);
          setTeamWatched(entry.teamWatched);
          setTeamAvailable(entry.teamAvailable);
        }
      } catch { /* stay unwatched; toggle still attempts the write */ }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [hasServerState, itemType, itemId]);

  const toggle = useCallback(
    async (scope: WatchScope) => {
      if (busy.current[scope]) return;
      busy.current[scope] = true;

      const isTeam = scope === "team";
      const setState = isTeam ? setTeamWatched : setWatched;
      const setFailedState = isTeam ? setTeamFailed : setFailed;
      const next = !(isTeam ? teamWatched : watched);

      setState(next); // optimistic
      setFailedState(false);
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const authHeader = { Authorization: `Bearer ${session?.access_token || ""}` };
        const resp = next
          ? await fetch("/api/watchlist", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeader },
              body: JSON.stringify({ itemType, itemId, scope }),
            })
          : await fetch(
              `/api/watchlist?item_type=${itemType}&item_id=${encodeURIComponent(itemId)}&scope=${scope}`,
              { method: "DELETE", headers: authHeader }
            );
        if (!resp.ok) { setState(!next); setFailedState(true); }
      } catch {
        setState(!next);
        setFailedState(true);
      }
      busy.current[scope] = false;
    },
    [itemType, itemId, watched, teamWatched]
  );

  const personalButton = (
    <button
      type="button"
      aria-pressed={watched}
      disabled={!loaded}
      onClick={() => toggle("personal")}
      title={
        failed
          ? "Save failed — click to retry"
          : watched
            ? "Watching — updates surface on your dashboard watchlist"
            : "Watch this item on your dashboard watchlist"
      }
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: 11.5,
        fontWeight: 700,
        padding: "8px 16px",
        borderRadius: 6,
        border: `1px solid ${watched ? palette.accent : palette.hairStrong}`,
        background: watched ? palette.tint : palette.card,
        color: watched ? palette.accent : palette.ink,
        cursor: loaded ? "pointer" : "default",
        opacity: loaded ? 1 : 0.6,
      }}
    >
      {watched ? "Watching" : "Watch"}
    </button>
  );

  // `soleControl` is true when this is a team-only itemType (Defect 3): there
  // is no personal button beside it, so the label and title speak for a watch
  // toggle on their own terms rather than as a secondary "Team" pill.
  const teamButton = (soleControl: boolean) => (
    <button
      type="button"
      aria-pressed={teamWatched}
      disabled={!loaded}
      onClick={() => toggle("team")}
      title={
        teamFailed
          ? "Save failed — click to retry"
          : teamWatched
            ? "On the workspace watchlist — every member sees this. Click to remove it for everyone."
            : soleControl
              ? "Watch on the workspace watchlist — every member sees it. Personal watching is not available for this item."
              : "Add to the workspace watchlist so every member sees it"
      }
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: 11.5,
        fontWeight: 700,
        padding: soleControl ? "8px 16px" : "8px 12px",
        borderRadius: 6,
        border: `1px solid ${teamWatched ? palette.accent : palette.hairStrong}`,
        background: teamWatched ? palette.tint : palette.card,
        color: teamWatched ? palette.accent : palette.ink,
        cursor: loaded ? "pointer" : "default",
        opacity: loaded ? 1 : 0.6,
      }}
    >
      {soleControl ? (teamWatched ? "Watching (team)" : "Watch (team)") : teamWatched ? "Team ✓" : "Team"}
    </button>
  );

  if (isTeamOnlyWatchType(itemType)) {
    // No personal control, ever: user_watchlist's CHECK does not admit this
    // type (route.ts's isTeamOnlyScopeViolation would 400 the write), so
    // offering it would be an affordance the API can only reject.
    if (!teamAvailable) {
      // And no team control either — no workspace resolved, so the write
      // would 403. Nothing here can succeed; render a disabled explainer
      // instead of a control that can only fail, same principle the
      // pre-existing !teamAvailable branch below applies to the team pill.
      return (
        <span
          title="Watching this item requires a workspace membership"
          style={{
            display: "inline-block",
            fontFamily: "var(--font-sans)",
            fontSize: 11.5,
            fontWeight: 700,
            padding: "8px 16px",
            borderRadius: 6,
            border: `1px dashed ${palette.hairStrong}`,
            color: palette.ink,
            opacity: 0.5,
          }}
        >
          Watch
        </span>
      );
    }
    return teamButton(true);
  }

  if (!teamAvailable) return personalButton;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {personalButton}
      {teamButton(false)}
    </span>
  );
}

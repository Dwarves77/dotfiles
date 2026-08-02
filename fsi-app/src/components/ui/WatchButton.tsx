"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

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
}: {
  itemType: "source" | "reg" | "signal" | "research" | "operations";
  itemId: string;
  palette?: { accent: string; hairStrong: string; tint: string; card: string; ink: string };
}) {
  const [watched, setWatched] = useState(false);
  const [teamWatched, setTeamWatched] = useState(false);
  const [teamAvailable, setTeamAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [teamFailed, setTeamFailed] = useState(false);
  // One in-flight guard per scope: toggling the team pill must not block the
  // personal button, and vice versa.
  const busy = useRef<Record<WatchScope, boolean>>({ personal: false, team: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const resp = await fetch(
          `/api/watchlist?item_type=${itemType}&item_id=${encodeURIComponent(itemId)}`,
          { headers: { Authorization: `Bearer ${session?.access_token || ""}` } }
        );
        if (!cancelled && resp.ok) {
          const j = (await resp.json()) as {
            watched?: boolean;
            team?: boolean;
            teamAvailable?: boolean;
          };
          setWatched(!!j.watched);
          setTeamWatched(!!j.team);
          setTeamAvailable(!!j.teamAvailable);
        }
      } catch { /* stay unwatched; toggle still attempts the write */ }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [itemType, itemId]);

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

  if (!teamAvailable) return personalButton;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {personalButton}
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
              : "Add to the workspace watchlist so every member sees it"
        }
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 11.5,
          fontWeight: 700,
          padding: "8px 12px",
          borderRadius: 6,
          border: `1px solid ${teamWatched ? palette.accent : palette.hairStrong}`,
          background: teamWatched ? palette.tint : palette.card,
          color: teamWatched ? palette.accent : palette.ink,
          cursor: loaded ? "pointer" : "default",
          opacity: loaded ? 1 : 0.6,
        }}
      >
        {teamWatched ? "Team ✓" : "Team"}
      </button>
    </span>
  );
}

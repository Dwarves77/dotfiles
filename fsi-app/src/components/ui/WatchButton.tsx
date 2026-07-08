"use client";

import { useEffect, useRef, useState } from "react";
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
export function WatchButton({
  itemType,
  itemId,
  palette,
}: {
  itemType: "source" | "reg" | "signal";
  itemId: string;
  palette: { accent: string; hairStrong: string; tint: string; card: string; ink: string };
}) {
  const [watched, setWatched] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

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
          const j = (await resp.json()) as { watched?: boolean };
          setWatched(!!j.watched);
        }
      } catch { /* stay unwatched; toggle still attempts the write */ }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [itemType, itemId]);

  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    const next = !watched;
    setWatched(next); // optimistic
    setFailed(false);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = { Authorization: `Bearer ${session?.access_token || ""}` };
      const resp = next
        ? await fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify({ itemType, itemId }),
          })
        : await fetch(`/api/watchlist?item_type=${itemType}&item_id=${encodeURIComponent(itemId)}`, {
            method: "DELETE",
            headers: authHeader,
          });
      if (!resp.ok) { setWatched(!next); setFailed(true); }
    } catch {
      setWatched(!next);
      setFailed(true);
    }
    busy.current = false;
  };

  return (
    <button
      type="button"
      aria-pressed={watched}
      disabled={!loaded}
      onClick={toggle}
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
}

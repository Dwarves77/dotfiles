"use client";

/**
 * B2RegenerationNote: B.2 regeneration progress as the ONE state-note strip it is
 * (lane adminlayout, 2026-09-08, the operator's item 4).
 *
 * It replaces `B2ProgressBanner`, a bordered card of its own carrying a heading, a progress
 * bar, and four "By format / By priority / Tag coverage / Recent" columns that stood empty in
 * every state the operator saw. The artboard has no such card, and the operator's ruling is
 * exact: "a state note strip under the tab row of the sources card (neutral variant), text
 * 'Regeneration · 0 / 1518 at current contract · 1287 never regenerated', action 'Open queue'.
 * Not its own card with empty chart placeholders." The three numbers in that line are the same
 * three `/api/admin/b2-progress` already returned (`at_current`, `total_eligible`,
 * `never_regenerated`); nothing else it returned was ever rendered anywhere else, so the rest
 * of the payload is simply not read here rather than kept as a dormant shape.
 *
 * The strip is the shared `StateNote` in its neutral variant, the same part the provisional
 * card's pipeline note and the registry's scraping strip use. There is no second strip
 * component.
 */

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import { StateNote } from "@/components/ui/StateNote";
import { Absence } from "@/components/ui/Absence";
import { formatNumber } from "@/lib/format";

interface B2Progress {
  total_eligible: number;
  at_current: number;
  never_regenerated: number;
}

export function B2RegenerationNote({ onOpenQueue }: { onOpenQueue?: () => void }) {
  const [data, setData] = useState<B2Progress | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/admin/b2-progress");
      const payload = await res.json();
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setData({
        total_eligible: Number(payload.total_eligible ?? 0),
        at_current: Number(payload.at_current ?? 0),
        never_regenerated: Number(payload.never_regenerated ?? 0),
      });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div data-audit="registry-regeneration-note">
      <StateNote action={onOpenQueue ? { label: "Open queue", onClick: onOpenQueue } : undefined}>
        <b>Regeneration</b> ·{" "}
        {data && !failed ? (
          <>
            {formatNumber(data.at_current)} / {formatNumber(data.total_eligible)} at current
            contract · {formatNumber(data.never_regenerated)} never regenerated
          </>
        ) : (
          <Absence reason="pending" />
        )}
      </StateNote>
    </div>
  );
}

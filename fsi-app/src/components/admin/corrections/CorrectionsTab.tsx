"use client";

/**
 * CorrectionsTab , the "Corrections" tab of the admin dashboard (lane G7-UI, 2026-10-06, plan Stage 7).
 *
 * The reader's goal: see every correction anyone has made to item data, find the ones that need attention
 * (the orphaned filter), and open or revoke them. Lists every correction, active, revoked and orphaned, newest first,
 * with filters by state and by target kind, and a search to open any item's Corrections panel. Orphaned fact
 * corrections carry their plain explanation and the revoke action in the same row.
 *
 * Reads through loadAllCorrections (load-all.mjs); the loader is a prop so the smoke spec mounts it on fixtures.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { ActionButton } from "@/components/ui/ActionRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { fieldStyle, labelStyle } from "@/components/admin/corrections/styles";
import { SECTION_TITLE_STYLE } from "@/components/ui/section-title-style";
import { CorrectionRow } from "@/components/admin/corrections/CorrectionRow";
import { ItemSearchPicker } from "@/components/admin/corrections/ItemSearchPicker";
import { loadAllCorrections } from "@/components/admin/corrections/load-all.mjs";
import {
  KIND_FILTERS,
  STATE_FILTERS,
  countByState,
  filterCorrections,
  kindLabel,
  postRevoke,
  stateLabel,
} from "@/components/admin/corrections/model.mjs";
import type { CorrectionData, Fetcher } from "@/components/admin/corrections/types";

const PAGE = 20;

interface CorrectionsTabProps {
  /** Test seam: the smoke spec supplies fixture rows. The app uses the default read. */
  loadAll?: () => Promise<{ rows: CorrectionData[]; unchecked: number }>;
  fetcher?: Fetcher;
}

export function CorrectionsTab({ loadAll, fetcher = authedFetch }: CorrectionsTabProps) {
  const [rows, setRows] = useState<CorrectionData[]>([]);
  const [unchecked, setUnchecked] = useState(0);
  const [load, setLoad] = useState<{ state: "loading" | "ready" | "error"; message?: string }>({ state: "loading" });
  const [state, setState] = useState("");
  const [kind, setKind] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [notice, setNotice] = useState<string | null>(null);

  const read = useCallback(async () => {
    try {
      const out = loadAll
        ? await loadAll()
        : ((await loadAllCorrections(createSupabaseBrowserClient())) as { rows: CorrectionData[]; unchecked: number });
      setRows(out.rows);
      setUnchecked(out.unchecked);
      setLoad({ state: "ready" });
    } catch (e) {
      setLoad({ state: "error", message: e instanceof Error ? e.message : "The corrections could not be read." });
    }
  }, [loadAll]);

  useEffect(() => {
    // Initial read of every correction: one synchronization with the database, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read();
  }, [read]);

  const counts = useMemo(() => countByState(rows), [rows]);
  const visible = useMemo(() => filterCorrections(rows, { state, kind }), [rows, state, kind]);

  async function revoke(c: CorrectionData, reason: string) {
    const out = await postRevoke(fetcher, c.item_id, c.id, reason);
    if (!out.ok) return { ok: false, message: out.message };
    setNotice("Revoked. The machine value is back and customers see it now.");
    await read();
    return { ok: true };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <SectionCard padding={16} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <h2 data-guard-title style={{ ...SECTION_TITLE_STYLE, fontSize: 18, whiteSpace: "normal", overflowWrap: "anywhere" }}>
          Corrections to item data
        </h2>
        <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
          {load.state === "loading" && "Loading corrections..."}
          {load.state === "ready" && `${counts.active} active, ${counts.revoked} revoked, ${counts.orphaned} orphaned.`}
        </div>
        {load.state === "ready" && unchecked > 0 && (
          <div role="note" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Orphaned status could not be checked for {unchecked} {unchecked === 1 ? "item" : "items"} with an active fact correction. Open the item to see it.
          </div>
        )}
        {load.state === "error" && (
          <div role="alert" style={{ fontSize: 12, color: "var(--color-error)", overflowWrap: "anywhere" }}>
            {load.message} <ActionButton onClick={() => void read()}>Try again</ActionButton>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label style={labelStyle}>
            State
            <select value={state} onChange={(e) => { setState(e.target.value); setShown(PAGE); }} style={fieldStyle}>
              <option value="">All states</option>
              {STATE_FILTERS.map((s: string) => (
                <option key={s} value={s}>{stateLabel(s)}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            What was corrected
            <select value={kind} onChange={(e) => { setKind(e.target.value); setShown(PAGE); }} style={fieldStyle}>
              <option value="">Everything</option>
              {KIND_FILTERS.map((k: string) => (
                <option key={k} value={k}>{kindLabel(k)}</option>
              ))}
            </select>
          </label>
        </div>
        <ItemSearchPicker
          label="Open an item to correct it"
          onPick={(item) => { window.location.assign(`/admin/items/${item.id}`); }}
          fetcher={fetcher}
        />
        {notice && (
          <div role="status" style={{ fontSize: 13, color: "var(--ink)", background: "var(--tag)", padding: "9px 12px", borderRadius: 6, overflowWrap: "anywhere" }}>
            {notice}
          </div>
        )}
      </SectionCard>

      {load.state === "ready" && rows.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
          No corrections yet. Search for an item above to correct a fact, tag, connection, section or brief. Every value customers see is the machine value until you do.
        </div>
      )}
      {load.state === "ready" && rows.length > 0 && visible.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--ink-2)" }}>No corrections match these filters. Choose All states and Everything to see them all.</div>
      )}
      {visible.slice(0, shown).map((c) => (
        <CorrectionRow key={c.id} correction={c} onRevoke={revoke} itemHref={`/admin/items/${c.item_id}`} />
      ))}
      {visible.length > shown && (
        <div>
          <ActionButton onClick={() => setShown((n) => n + PAGE)}>Show more corrections ({visible.length - shown} left)</ActionButton>
        </div>
      )}
    </div>
  );
}

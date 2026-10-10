"use client";

/**
 * ItemSearchPicker , pick an item by searching (lane G7-UI, 2026-10-06). Reuses the existing item search, the
 * same GET /api/search the command bar calls (src/app/api/search, search_intelligence_items, migration 159), so
 * there is no second search. Used to pick the other end of a connection and to open any item from the tab.
 * Results are real items; nothing is typed into the correction by hand but a choice from this list.
 */

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import { fieldStyle, labelStyle } from "@/components/admin/corrections/styles";
import type { SearchResultRow } from "@/app/api/search/logic";
import type { Fetcher } from "@/components/admin/corrections/types";

const MIN_CHARS = 3;

interface ItemSearchPickerProps {
  label: string;
  /** Items to leave out of the results, for example the item being corrected. */
  excludeIds?: string[];
  onPick: (item: { id: string; title: string }) => void;
  fetcher?: Fetcher;
}

export function ItemSearchPicker({ label, excludeIds = [], onPick, fetcher = authedFetch }: ItemSearchPickerProps) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SearchResultRow[]>([]);
  const [state, setState] = useState<"idle" | "searching" | "done" | "error">("idle");

  useEffect(() => {
    const text = q.trim();
    if (text.length < MIN_CHARS) {
      setRows([]);
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("searching");
    const timer = setTimeout(async () => {
      try {
        const res = await fetcher(`/api/search?q=${encodeURIComponent(text)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results?: SearchResultRow[] };
        if (cancelled) return;
        setRows(Array.isArray(data.results) ? data.results : []);
        setState("done");
      } catch {
        if (cancelled) return;
        setRows([]);
        setState("error");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, fetcher]);

  const shown = rows.filter((r) => !excludeIds.includes(r.id)).slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <label style={labelStyle}>
        {label}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type at least three letters of the title"
          style={fieldStyle}
        />
      </label>
      {state === "searching" && <div style={{ fontSize: 12, color: "var(--ink-2)" }}>Searching...</div>}
      {state === "error" && (
        <div role="alert" style={{ fontSize: 12, color: "var(--color-error)" }}>
          The search did not go through. Check the connection and type again.
        </div>
      )}
      {state === "done" && shown.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--ink-2)" }}>No items match. Try other words from the title.</div>
      )}
      {shown.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onPick({ id: r.id, title: r.title });
                  setQ("");
                  setRows([]);
                  setState("idle");
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  minHeight: 44,
                  padding: "8px 10px",
                  fontSize: 13,
                  fontFamily: "inherit",
                  color: "var(--ink)",
                  background: "var(--card)",
                  border: "1px solid var(--line-1)",
                  borderRadius: 6,
                  cursor: "pointer",
                  overflowWrap: "anywhere",
                }}
              >
                {r.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

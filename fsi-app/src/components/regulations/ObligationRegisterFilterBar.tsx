"use client";

/**
 * ObligationRegisterFilterBar — the interactive half of ObligationRegister (Lane OBLIG, 2026-09-02).
 * "use client": owns the jurisdiction / mode / binding-position / due-window filter state and re-filters
 * an already-fetched page of register rows IN THE BROWSER via `filterJoinedRows` — the exact same pure
 * predicate/sort `src/lib/obligations/read-register.mjs`'s server-side `selectRegisterRows` uses, so the
 * filter behaviour here can never drift from what the server-side read would produce for the same spec.
 * No network round trip on filter change; the list page fetches once (up to 500 active rows) and this
 * component slices it client-side, same trade-off RegulationsLedger already makes for its own filters.
 *
 * FILTER OPTIONS ARE DERIVED FROM THE FETCHED ROWS, never a hardcoded list — a jurisdiction/mode this
 * corpus does not currently carry is never offered as a dead option.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  filterJoinedRows,
  buildRegisterQuerySpec,
  UNCLASSIFIED,
  DUE_WINDOWS,
} from "@/lib/obligations/read-register.mjs";
import { formatEventDate } from "@/lib/connections/forward-event-format.mjs";
import { BINDING_POSITION, TRANSPORT_MODES, orderedValues } from "@/lib/contracts/vocabularies.mjs";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import { itemDetailHref } from "@/lib/item-links";

export interface ObligationItem {
  id: string;
  title: string;
  legacy_id: string | null;
  jurisdiction_iso: string[] | null;
}

export interface ObligationRow {
  id: string;
  intelligence_item_id: string;
  forward_event_id: string;
  jurisdiction: string[] | null;
  modes: string[] | null;
  binding_position: string | null;
  due_date: string | null;
  date_precision: "day" | "month" | "year" | null;
  event_kind: string;
  status: string;
  item: ObligationItem;
}

// TRANSPORT_MODES (vocabularies.mjs) is an exact-keys frozen object literal, not a Record<string, ...> —
// TS infers no index signature for it, so a dynamic mode string pulled from live row data (never a
// `keyof typeof TRANSPORT_MODES` literal at compile time) cannot index it directly. This is the one safe
// place to widen: the vocabulary itself stays the source of truth (read, never redefined), and an
// unrecognised mode still degrades to `undefined` at runtime exactly as a direct index would.
const MODE_META = TRANSPORT_MODES as Record<string, { code: string; label: string; order: number; corridorOnly: boolean }>;

const EVENT_KIND_LABELS: Record<string, string> = {
  entry_into_force: "Entry into force",
  compliance_deadline: "Compliance deadline",
  review_or_report: "Review / report",
  phase_step: "Phase step",
  consultation_close: "Consultation close",
  other: "Other",
};

const DUE_WINDOW_LABELS: Record<string, string> = {
  all: "All",
  overdue: "Overdue",
  "30": "Next 30 days",
  "90": "Next 90 days",
  "365": "Next 12 months",
  undated: "No date on file",
};

const ALL = "__all__";

interface Props {
  rows: ObligationRow[];
  variant?: "list" | "detail";
  /** Live count of `item_forward_events` (migration 274), fetched by the parent ONLY when `rows` is
   *  empty on the list variant — see ObligationRegister.tsx / fetchForwardEventCount's own header. Null
   *  when not fetched (detail variant, or non-empty rows) or when the count read itself failed; the
   *  empty-state copy degrades to the generic message in either case, never a fabricated number. */
  sourceEventCount?: number | null;
}

export function ObligationRegisterFilterBar({ rows, variant = "list", sourceEventCount = null }: Props) {
  const [jurisdiction, setJurisdiction] = useState<string>(ALL);
  const [mode, setMode] = useState<string>(ALL);
  const [bindingPosition, setBindingPosition] = useState<string>(ALL);
  const [dueWindow, setDueWindow] = useState<string>("all");

  const jurisdictionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const j of r.jurisdiction ?? []) set.add(j);
    return [...set].sort();
  }, [rows]);

  const modeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const m of r.modes ?? []) set.add(m);
    return [...set].sort((a, b) => (MODE_META[a]?.order ?? 99) - (MODE_META[b]?.order ?? 99));
  }, [rows]);

  const filtered = useMemo(() => {
    const spec = buildRegisterQuerySpec({
      jurisdiction: jurisdiction === ALL ? null : jurisdiction,
      mode: mode === ALL ? null : mode,
      bindingPosition: bindingPosition === ALL ? null : bindingPosition,
      dueWindow,
      limit: variant === "detail" ? 200 : 300,
    });
    // filterJoinedRows filters/sorts/slices `rows` without transforming any element (it never builds a
    // new `{...row, item}` object the way read-register.mjs's server-side selectRegisterRows does — that
    // merge already happened before these rows ever reached this client component) — so casting its
    // return to ObligationRow[] is exactly what it is at runtime, not a type-safety shortcut. The cast is
    // needed because the JSDoc's plain `Array<object>` return type does not by itself preserve the input
    // element type across the call.
    return filterJoinedRows(rows, spec) as ObligationRow[];
  }, [rows, jurisdiction, mode, bindingPosition, dueWindow, variant]);

  if (rows.length === 0) {
    return variant === "detail" ? null : (
      <section style={sectionStyle}>
        <Header total={0} />
        <p style={emptyTextStyle}>
          {typeof sourceEventCount === "number" ? (
            <>
              No obligations classified into the register yet. It is derived from{" "}
              <strong>{sourceEventCount.toLocaleString()}</strong> dated forward event
              {sourceEventCount === 1 ? "" : "s"} already on file (migration 274); the register fills in
              as they are matched to their parent regulation's jurisdiction, mode and binding position.
            </>
          ) : (
            "No obligations on file yet. This register is derived from forward-events extraction landing "
            + "dated obligations for verified regulations."
          )}
        </p>
      </section>
    );
  }

  return (
    <section style={sectionStyle}>
      <Header total={rows.length} shown={filtered.length} />
      {variant === "list" && (
        <div style={filterRowStyle}>
          <Select label="Jurisdiction" value={jurisdiction} onChange={setJurisdiction}>
            <option value={ALL}>All jurisdictions</option>
            {jurisdictionOptions.map((j) => (
              <option key={j} value={j.toLowerCase()}>
                {isoToDisplayLabel(j)}
              </option>
            ))}
          </Select>
          <Select label="Mode" value={mode} onChange={setMode}>
            <option value={ALL}>All modes</option>
            {modeOptions.map((m) => (
              <option key={m} value={m}>
                {MODE_META[m]?.label ?? m}
              </option>
            ))}
          </Select>
          <Select label="Binding position" value={bindingPosition} onChange={setBindingPosition}>
            <option value={ALL}>All positions</option>
            {orderedValues("binding_position").map((v: { code: string; label: string }) => (
              <option key={v.code} value={v.code}>
                {v.label}
              </option>
            ))}
            <option value={UNCLASSIFIED}>Not classified</option>
          </Select>
          <Select label="Due" value={dueWindow} onChange={setDueWindow}>
            {DUE_WINDOWS.map((w: string) => (
              <option key={w} value={w}>
                {DUE_WINDOW_LABELS[w] ?? w}
              </option>
            ))}
          </Select>
        </div>
      )}

      {filtered.length === 0 ? (
        <p style={emptyTextStyle}>No obligations match these filters.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Due</Th>
                <Th>Kind</Th>
                <Th>Regulation</Th>
                <Th>Binding position</Th>
                <Th>Jurisdiction</Th>
                <Th>Mode</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Row key={r.id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Row({ row }: { row: ObligationRow }) {
  const href = itemDetailHref({ id: row.item.legacy_id || row.item.id });
  const bp = row.binding_position ? BINDING_POSITION[row.binding_position] : null;
  return (
    <tr style={{ borderTop: "1px solid var(--border-sub, rgba(0,0,0,0.08))" }}>
      <td style={tdStyle}>
        {row.due_date ? (
          <span style={{ fontWeight: 700 }}>{formatEventDate(row.due_date, row.date_precision ?? "day")}</span>
        ) : (
          <span style={{ color: "var(--muted, #7A6E6C)", fontStyle: "italic" }}>No date on file</span>
        )}
      </td>
      <td style={tdStyle}>{EVENT_KIND_LABELS[row.event_kind] ?? row.event_kind}</td>
      <td style={tdStyle}>
        {/* Law-2 floor: the anchor's own box was just its text line (~15px) — `inline-flex` +
            `minHeight: 24` reaches the 24px-with-clearance alternative to 44px without changing
            the cell's padding or the table's row height visually (the cell's own 9px vertical
            padding already keeps rows apart). */}
        <Link href={href} style={{ display: "inline-flex", alignItems: "center", minHeight: 24, color: "var(--accent, #E8610A)", fontWeight: 700, textDecoration: "none" }}>
          {row.item.title}
        </Link>
      </td>
      <td style={tdStyle}>
        {bp ? (
          <span title={bp.note} style={bindingChipStyle(row.binding_position!)}>
            {bp.label}
          </span>
        ) : (
          <span style={{ color: "var(--muted, #7A6E6C)", fontStyle: "italic" }}>Not classified</span>
        )}
      </td>
      <td style={tdStyle}>{(row.jurisdiction ?? []).map(isoToDisplayLabel).join(", ") || "—"}</td>
      <td style={tdStyle}>{(row.modes ?? []).map((m) => MODE_META[m]?.label ?? m).join(", ") || "—"}</td>
    </tr>
  );
}

function bindingChipStyle(code: string): React.CSSProperties {
  const tone: Record<string, string> = {
    direct_duty: "#DC2626",
    carrier_passthrough: "#CA8A04",
    customer_contract: "#2563EB",
    monitoring_only: "#5A6B67",
  };
  const c = tone[code] ?? "#5A6B67";
  return { fontSize: 11, fontWeight: 700, color: c, whiteSpace: "nowrap" };
}

function Header({ total, shown }: { total: number; shown?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      <h2 data-guard-title style={headingStyle}>Obligation register</h2>
      <span style={{ fontSize: 11.5, color: "var(--color-text-muted, #7A6E6C)" }}>
        {typeof shown === "number" && shown !== total ? `${shown} of ${total}` : `${total}`}{" "}
        {total === 1 ? "obligation" : "obligations"}
      </span>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, fontWeight: 700, color: "var(--color-text-muted, #7A6E6C)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border, rgba(0,0,0,0.18))", background: "var(--color-surface, #fff)", color: "var(--color-text-primary, #1A1A1A)", textTransform: "none" }}
      >
        {children}
      </select>
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--color-text-muted, #7A6E6C)", padding: "8px 12px", whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}

const sectionStyle: React.CSSProperties = { maxWidth: 1180, margin: "24px auto 0", padding: "0 36px" };
const headingStyle: React.CSSProperties = { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-primary, #1A1A1A)", margin: 0 };
const filterRowStyle: React.CSSProperties = { display: "flex", gap: 14, flexWrap: "wrap", margin: "0 0 14px" };
const emptyTextStyle: React.CSSProperties = { fontSize: 12.5, color: "var(--color-text-muted, #7A6E6C)", margin: 0 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 720 };
const tdStyle: React.CSSProperties = { fontSize: 12.5, padding: "9px 12px", color: "var(--color-text-primary, #1A1A1A)", verticalAlign: "top" };

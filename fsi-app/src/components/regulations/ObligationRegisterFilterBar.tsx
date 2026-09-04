"use client";

/**
 * ObligationRegisterFilterBar — the interactive half of ObligationRegister (Lane OBLIG, 2026-09-02).
 * "use client": owns the jurisdiction / mode / binding-position / due-window filter state.
 *
 * PERF-11 (2026-09-04) REWRITE OF THE DATA MODEL. Was: the parent fetched up to 500 rows (in practice the
 * WHOLE live register — 1,141 rows [CONFIRMED, live SQL, 2026-09-04] is under 500 for the itemId-less
 * list read) and shipped them ALL as this component's `rows` prop; every filter change re-sliced that
 * in-memory array via `filterJoinedRows`, and the table rendered up to 300 `<tr>`s regardless of which
 * filter was active. That was the single largest contributor this lane measured to /regulations' oversized
 * document (the register's own field content alone: ~230-280 KB live-measured, paid twice via SSR HTML +
 * the RSC flight duplicate) and the clearest instance of the operator's own framing ("you dont load every
 * item at once") on this page.
 *
 * NOW (list variant): the parent (ObligationRegister.tsx) renders only the FIRST PAGE (LIST_FIRST_PAGE_SIZE
 * rows, soonest-due-first, no filters) plus the corpus-wide `total`. A filter change fires a request to
 * `/api/obligations/register` (offset 0, the new filters) and REPLACES `rows`; "Load more" fires the same
 * route at `offset = rows.length` with the CURRENT filters and APPENDS. Every request runs the exact same
 * `filterJoinedRowsPage`/`fetchObligationRegisterPage` server-side logic — filter correctness is never
 * approximated client-side, and no surface here is ever emptied by a fetch in flight: a `loading` state
 * keeps the LAST GOOD rows on screen with a "Loading…" affordance rather than blanking to empty (the same
 * honest-loading-state rule FIRSTPAGE's band-header fix established for the ledger).
 *
 * DETAIL VARIANT IS UNCHANGED: itemId-scoped, always small, no filter UI, no network round trip here — it
 * still renders whatever `rows` the parent passed synchronously, same as before this lane.
 *
 * FILTER OPTIONS are `jurisdictionOptions`/`modeOptions` PROPS (ObligationRegister.tsx's
 * `fetchRegisterFacetOptions`, sourced independently of the loaded page so the dropdowns stay complete
 * even though the row payload no longer is) — falls back to deriving from the currently-loaded `rows` when
 * the props are omitted/empty (defensive; also what the detail variant's now-unused dropdown UI would see
 * if it were ever rendered).
 *
 * HYDRATION-418 (PERF-MERGE, 2026-09-04): both toLocaleString calls below now pin `"en-US"`
 * explicitly, mirroring the `timeZone: "UTC"` pin format-fixed-date.ts already established for the
 * date-side instance of this same defect class. [CONFIRMED root cause, this lane] — on train 43
 * (PERF-11, pre-PERF-MERGE) `ObligationRegister.tsx` was an ASYNC SERVER COMPONENT that rendered this
 * component synchronously into the SSR HTML with real data (`git show 995d82e3:.../ObligationRegister.tsx`),
 * so the "Load more (${(total - rows.length)} more)" text (line ~327, NEW in PERF-11 — confirmed absent
 * at d60124b9 via `git diff d60124b9 a58478cc -- ObligationRegisterFilterBar.tsx`) rendered once
 * server-side using the Node runtime's default `Intl` locale (measured this session:
 * `new Intl.NumberFormat().resolvedOptions().locale` → `"en-US"` in this environment) and again
 * client-side during hydration ("use client" components still hydrate over their SSR HTML) using the
 * BROWSER's default locale, which is independent of the server's and ordinarily reads from the
 * viewer's OS/browser language setting. Measured this session (`node -e`, the exact live value
 * 1141 - 60 = 1081): `"en-US"` → `"1,081"`, `"de-DE"` → `"1.081"`, `"fr-FR"` → `"1 081"`,
 * `"pl-PL"` → `"1081"` — a genuinely different DOM text node for any non-`en-US`-locale browser, every
 * single load (this register always has more rows than the first page — "Load more" is not a rare or
 * empty-state path), which is exactly React's minified error #418 (hydration text mismatch). This is
 * DETERMINISTIC per viewer locale, not the probabilistic class RegulationsLedger.tsx's `useState(() =>
 * Date.now())` comment nearby represents — it reproduces on every load for every non-en-US-locale
 * browser, which is the "returned again" the coordinator saw live. NOTE: PERF-MERGE's own convergence
 * (see ObligationRegister.tsx's header) separately converts the parent to a client component that fetches
 * on mount and does not render this component during SSR at all, which independently prevents this
 * specific dual-render path going forward — the locale pin here is kept anyway, both belt-and-suspenders
 * and because the SAME unpinned-locale defect pattern exists ~30 more places repo-wide (see this lane's
 * final report) and the convention (pin explicitly, never rely on runtime default) is worth being
 * unambiguously correct at its origin, not just accidentally inert.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { UNCLASSIFIED, DUE_WINDOWS } from "@/lib/obligations/read-register.mjs";
import { formatEventDate } from "@/lib/connections/forward-event-format.mjs";
import { BINDING_POSITION, TRANSPORT_MODES, orderedValues } from "@/lib/contracts/vocabularies.mjs";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import { itemDetailHref } from "@/lib/item-links";
import { formatNumber } from "@/lib/format";

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

const PAGE_SIZE = 60; // mirrors LIST_FIRST_PAGE_SIZE (list-pagination.ts) — kept as a local literal so
// this plain client component needs no path alias beyond the ones it already imports.

interface Props {
  /** The currently-loaded page of rows — the first page on initial render (list variant: no filters,
   *  offset 0), replaced on a filter change and appended to on "Load more". Always the full set for the
   *  detail variant (unchanged, no pagination there). */
  rows: ObligationRow[];
  /** Corpus-wide count for the ACTIVE filter set (list variant) or simply `rows.length` (detail variant,
   *  where no server-side total beyond what's loaded exists). Drives the "N of M" header and whether
   *  "Load more" renders at all. */
  total?: number;
  variant?: "list" | "detail";
  /** Live count of `item_forward_events` (migration 274), fetched by the parent ONLY when `total` is
   *  0 on the list variant — see ObligationRegister.tsx / fetchForwardEventCount's own header. Null
   *  when not fetched (detail variant, or non-empty rows) or when the count read itself failed; the
   *  empty-state copy degrades to the generic message in either case, never a fabricated number. */
  sourceEventCount?: number | null;
  /** Complete jurisdiction/mode option lists (ObligationRegister.tsx's fetchRegisterFacetOptions),
   *  sourced independently of the loaded page so the dropdowns stay complete even on a first-page-only
   *  load. Falls back to deriving from `rows` when omitted/empty. */
  jurisdictionOptions?: string[];
  modeOptions?: string[];
}

interface RegisterFilters {
  jurisdiction: string;
  mode: string;
  bindingPosition: string;
  dueWindow: string;
}

async function fetchRegisterPage(
  filters: RegisterFilters,
  offset: number
): Promise<{ rows: ObligationRow[]; total: number }> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
  if (filters.jurisdiction !== ALL) params.set("jurisdiction", filters.jurisdiction);
  if (filters.mode !== ALL) params.set("mode", filters.mode);
  if (filters.bindingPosition !== ALL) params.set("bindingPosition", filters.bindingPosition);
  if (filters.dueWindow !== "all") params.set("dueWindow", filters.dueWindow);
  const res = await fetch(`/api/obligations/register?${params.toString()}`);
  if (!res.ok) throw new Error(`/api/obligations/register responded ${res.status}`);
  const data = await res.json();
  return { rows: Array.isArray(data.rows) ? (data.rows as ObligationRow[]) : [], total: typeof data.total === "number" ? data.total : 0 };
}

export function ObligationRegisterFilterBar({
  rows: initialRows,
  total: initialTotal,
  variant = "list",
  sourceEventCount = null,
  jurisdictionOptions: jurisdictionOptionsProp,
  modeOptions: modeOptionsProp,
}: Props) {
  const [jurisdiction, setJurisdiction] = useState<string>(ALL);
  const [mode, setMode] = useState<string>(ALL);
  const [bindingPosition, setBindingPosition] = useState<string>(ALL);
  const [dueWindow, setDueWindow] = useState<string>("all");

  // The set of rows currently on screen, the total behind the active filter set, and network state.
  // `rows`/`total` start from what the server rendered (the honest first paint) and are only ever
  // replaced/appended by a successful fetch — a fetch IN FLIGHT never blanks what's already shown (Law:
  // no surface may show an empty or false state while more loads).
  const [rows, setRows] = useState<ObligationRow[]>(initialRows);
  const [total, setTotal] = useState<number>(initialTotal ?? initialRows.length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards a stale response (a fast second filter change resolving after a slower first one) from
  // clobbering newer state — the same "ignore anything but the latest request" pattern RegulationsLedger's
  // own remainder fetch uses.
  const requestIdRef = useRef(0);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (variant !== "list") return; // detail variant: static, no network, unchanged from before this lane
    if (isFirstRender.current) {
      // The initial `rows`/`total` are already the correct "no filter, offset 0" page — server-rendered,
      // no fetch needed on mount.
      isFirstRender.current = false;
      return;
    }
    const myId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    fetchRegisterPage({ jurisdiction, mode, bindingPosition, dueWindow }, 0)
      .then((page) => {
        if (requestIdRef.current !== myId) return; // superseded by a newer filter change
        setRows(page.rows);
        setTotal(page.total);
      })
      .catch(() => {
        if (requestIdRef.current !== myId) return;
        setError("Could not refresh the register for these filters — showing the last loaded set.");
      })
      .finally(() => {
        if (requestIdRef.current === myId) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jurisdiction, mode, bindingPosition, dueWindow, variant]);

  const loadMore = useCallback(() => {
    const myId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    fetchRegisterPage({ jurisdiction, mode, bindingPosition, dueWindow }, rows.length)
      .then((page) => {
        if (requestIdRef.current !== myId) return;
        setRows((prev) => prev.concat(page.rows));
        setTotal(page.total);
      })
      .catch(() => {
        if (requestIdRef.current !== myId) return;
        setError("Could not load more obligations — try again.");
      })
      .finally(() => {
        if (requestIdRef.current === myId) setLoading(false);
      });
  }, [jurisdiction, mode, bindingPosition, dueWindow, rows.length]);

  const jurisdictionOptions = useMemo(() => {
    if (jurisdictionOptionsProp && jurisdictionOptionsProp.length > 0) return jurisdictionOptionsProp;
    const set = new Set<string>();
    for (const r of rows) for (const j of r.jurisdiction ?? []) set.add(j);
    return [...set].sort();
  }, [jurisdictionOptionsProp, rows]);

  const modeOptions = useMemo(() => {
    if (modeOptionsProp && modeOptionsProp.length > 0) return modeOptionsProp;
    const set = new Set<string>();
    for (const r of rows) for (const m of r.modes ?? []) set.add(m);
    return [...set].sort((a, b) => (MODE_META[a]?.order ?? 99) - (MODE_META[b]?.order ?? 99));
  }, [modeOptionsProp, rows]);

  if (total === 0 && rows.length === 0 && !loading) {
    return variant === "detail" ? null : (
      <section style={sectionStyle}>
        <Header total={0} />
        <p style={emptyTextStyle}>
          {typeof sourceEventCount === "number" ? (
            <>
              No obligations classified into the register yet. It is derived from{" "}
              <strong>{formatNumber(sourceEventCount)}</strong> dated forward event
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

  const canLoadMore = variant === "list" && rows.length < total;

  return (
    <section style={sectionStyle}>
      <Header total={total} shown={rows.length} />
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

      {error && (
        <p role="status" style={{ ...emptyTextStyle, color: "var(--accent, #E8610A)" }}>
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p role="status" style={emptyTextStyle}>
          {loading ? "Loading obligations for these filters…" : "No obligations match these filters."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="cl-table-cards" style={tableStyle}>
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
              {rows.map((r) => (
                <Row key={r.id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {variant === "list" && (canLoadMore || loading) && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          style={loadMoreButtonStyle}
        >
          {loading ? "Loading…" : `Load more (${formatNumber(total - rows.length)} more)`}
        </button>
      )}
    </section>
  );
}

function Row({ row }: { row: ObligationRow }) {
  const href = itemDetailHref({ id: row.item.legacy_id || row.item.id });
  const bp = row.binding_position ? BINDING_POSITION[row.binding_position] : null;
  return (
    <tr style={{ borderTop: "1px solid var(--border-sub, rgba(0,0,0,0.08))" }}>
      <td data-label="Due" style={tdStyle}>
        {row.due_date ? (
          <span style={{ fontWeight: 700 }}>{formatEventDate(row.due_date, row.date_precision ?? "day")}</span>
        ) : (
          <span style={{ color: "var(--muted, #7A6E6C)", fontStyle: "italic" }}>No date on file</span>
        )}
      </td>
      <td data-label="Kind" style={tdStyle}>{EVENT_KIND_LABELS[row.event_kind] ?? row.event_kind}</td>
      <td data-label="Regulation" style={tdStyle}>
        {/* Law-2 floor: the anchor's own box was just its text line (~15px) — `inline-flex` +
            `minHeight: 24` reaches the 24px-with-clearance alternative to 44px without changing
            the cell's padding or the table's row height visually (the cell's own 9px vertical
            padding already keeps rows apart). */}
        <Link href={href} style={{ display: "inline-flex", alignItems: "center", minHeight: 24, color: "var(--accent, #E8610A)", fontWeight: 700, textDecoration: "none" }}>
          {row.item.title}
        </Link>
      </td>
      <td data-label="Binding" style={tdStyle}>
        {bp ? (
          <span title={bp.note} style={bindingChipStyle(row.binding_position!)}>
            {bp.label}
          </span>
        ) : (
          <span style={{ color: "var(--muted, #7A6E6C)", fontStyle: "italic" }}>Not classified</span>
        )}
      </td>
      <td data-label="Jurisdiction" style={tdStyle}>{(row.jurisdiction ?? []).map(isoToDisplayLabel).join(", ") || "—"}</td>
      <td data-label="Mode" style={tdStyle}>{(row.modes ?? []).map((m) => MODE_META[m]?.label ?? m).join(", ") || "—"}</td>
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
// Law-2 floor: 44px tap target (a text button, no icon-only affordance to shrink below it).
const loadMoreButtonStyle: React.CSSProperties = {
  marginTop: 12,
  minHeight: 44,
  padding: "0 16px",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--color-text-primary, #1A1A1A)",
  background: "var(--color-surface, #fff)",
  border: "1px solid var(--color-border, rgba(0,0,0,0.18))",
  borderRadius: 8,
  cursor: "pointer",
};

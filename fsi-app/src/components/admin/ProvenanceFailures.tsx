"use client";

/**
 * ProvenanceFailures — Sprint 4 Block 1 task 1.11.
 *
 * Surfaces, on a staged_updates row, the specific provenance-gate failure modes
 * that quarantined / staged the item. Reads the `failures` jsonb array produced
 * by public.validate_item_provenance (shape: [{ criterion, reason, ...payload }])
 * and groups it into the five reviewer-facing modes from the task spec:
 *
 *   1. Ungrounded URLs                 (criterion 2 · ungrounded_url)
 *   2. Unverified FACT spans           (criterion 3 · fact_missing_source_span /
 *                                        fact_span_not_in_source / fact_below_authority_floor)
 *   3. Unlabeled / mislabeled analysis (criterion 4 · analysis_missing_label_syntax /
 *                                        unlabeled_assertion)
 *   4. Missing required slots          (criterion 5 · missing_required_slot)
 *   5. Legal conclusions not routed    (criterion 4 · legal_not_routed_to_callout)
 *
 * Block 1 ships the surface; the Vercel workflow's routeOnValidation step
 * (Block 4) populates the payload on real staged rows. Render-verified in Block 1
 * against sentinel-marked synthetic rows (one per mode).
 */

export interface ProvenanceFailure {
  criterion: number;
  reason: string;
  url?: string;
  claim?: string;
  source_span?: string;
  source_tier_at_grounding?: number | null;
  priority?: string;
  slot_key?: string;
  item_type?: string;
  section_row_id?: string;
  [k: string]: unknown;
}

type ModeKey = "ungrounded_url" | "unverified_span" | "unlabeled" | "missing_slot" | "legal";

interface ModeDef {
  key: ModeKey;
  label: string;
  match: (f: ProvenanceFailure) => boolean;
  describe: (f: ProvenanceFailure) => string;
}

const MODES: ModeDef[] = [
  {
    key: "ungrounded_url",
    label: "Ungrounded URLs",
    match: (f) => f.criterion === 2 && f.reason === "ungrounded_url",
    describe: (f) => f.url || "(url missing)",
  },
  {
    key: "unverified_span",
    label: "Unverified FACT spans",
    match: (f) => f.criterion === 3,
    describe: (f) => {
      const r =
        f.reason === "fact_missing_source_span"
          ? "no source span"
          : f.reason === "fact_span_not_in_source"
            ? "span not found in cited source"
            : f.reason === "fact_below_authority_floor"
              ? `below Tier 1-2 floor (tier ${f.source_tier_at_grounding ?? "?"}, ${f.priority ?? "?"})`
              : f.reason;
      return `${f.claim ? `"${truncate(f.claim, 90)}" — ` : ""}${r}`;
    },
  },
  {
    key: "unlabeled",
    label: "Unlabeled / mislabeled analysis",
    match: (f) => f.criterion === 4 && (f.reason === "analysis_missing_label_syntax" || f.reason === "unlabeled_assertion"),
    describe: (f) =>
      f.reason === "unlabeled_assertion"
        ? `unlabeled strong-modal assertion${f.section_row_id ? ` (section ${shortId(f.section_row_id)})` : ""}`
        : `ANALYSIS without a closed-set label${f.claim ? `: "${truncate(f.claim, 90)}"` : ""}`,
  },
  {
    key: "missing_slot",
    label: "Missing required slots",
    match: (f) => f.criterion === 5 && f.reason === "missing_required_slot",
    describe: (f) => `${f.slot_key ?? "(slot?)"}${f.item_type ? ` · ${f.item_type}` : ""}`,
  },
  {
    key: "legal",
    label: "Legal conclusions not routed",
    match: (f) => f.criterion === 4 && f.reason === "legal_not_routed_to_callout",
    describe: (f) => (f.claim ? `"${truncate(f.claim, 110)}"` : "LEGAL claim missing *Legal Confirmation Required:* callout"),
  },
];

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** Pull the failures array from a staged_updates row, tolerant of where it lives. */
export function extractFailures(update: unknown): ProvenanceFailure[] {
  const u = update as Record<string, any> | null;
  if (!u) return [];
  const raw =
    u.provenance_failures ??
    u.proposed_data?.provenance_failures ??
    u.proposed_changes?.provenance_failures ??
    null;
  return Array.isArray(raw) ? (raw as ProvenanceFailure[]) : [];
}

export function ProvenanceFailures({ failures }: { failures: ProvenanceFailure[] }) {
  if (!failures || failures.length === 0) return null;

  const groups = MODES.map((m) => ({ mode: m, items: failures.filter(m.match) })).filter((g) => g.items.length > 0);
  // A failure whose (criterion, reason) matches no known mode still shows under "Other".
  const matched = new Set(groups.flatMap((g) => g.items));
  const other = failures.filter((f) => !matched.has(f));

  return (
    <div
      className="rounded-md border p-3 space-y-2"
      style={{
        borderColor: "var(--color-critical-border, rgba(220,38,38,0.25))",
        backgroundColor: "var(--color-critical-bg, rgba(220,38,38,0.05))",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded"
          style={{ color: "var(--color-critical)", border: "1px solid var(--color-critical-border, rgba(220,38,38,0.25))" }}
        >
          Provenance gate · {failures.length} failure{failures.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="space-y-1.5" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {groups.map((g) => (
          <li key={g.mode.key}>
            <p className="text-[11px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {g.mode.label}
              <span style={{ color: "var(--color-text-muted)" }}> · {g.items.length}</span>
            </p>
            <ul className="mt-0.5 space-y-0.5" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {g.items.map((f, i) => (
                <li key={i} className="text-[11px] pl-3" style={{ color: "var(--color-text-secondary)" }}>
                  {g.mode.key === "ungrounded_url" ? (
                    <a href={g.mode.describe(f)} target="_blank" rel="noopener noreferrer" className="hover:underline break-all" style={{ color: "var(--color-primary)" }}>
                      {g.mode.describe(f)}
                    </a>
                  ) : (
                    <span className="break-words">{g.mode.describe(f)}</span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
        {other.length > 0 && (
          <li>
            <p className="text-[11px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Other<span style={{ color: "var(--color-text-muted)" }}> · {other.length}</span>
            </p>
            <ul className="mt-0.5 space-y-0.5" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {other.map((f, i) => (
                <li key={i} className="text-[11px] pl-3" style={{ color: "var(--color-text-secondary)" }}>
                  criterion {f.criterion} · {f.reason}
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>
    </div>
  );
}

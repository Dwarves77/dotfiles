/**
 * /admin/factors — WO-18 first reader for `emission_factors` (master execution plan v2, Stage 7).
 *
 * WHY THIS PAGE EXISTS. Migration 258 shipped `emission_factors` applied and empty, and WO-18's own
 * text says the table must not go "populated-but-invisible" between the seeders landing and WO-24's
 * carbon overlay consuming it. This is that first reader: read-only, no mutation controls (rule per
 * the WO-18 lane contract — inserts/corrections belong to the seeders and the append-only trigger,
 * never a screen).
 *
 * CONVENTIONS MATCHED FROM THE EXISTING /admin SURFACE (read in full before writing this file):
 *   - src/app/admin/page.tsx: `requirePlatformAdmin()` gate before any query, `createSupabaseServerClient()`
 *     for the RLS-scoped read (emission_factors + data_sources both grant SELECT TO authenticated —
 *     migration 258 — so the platform-admin's own session reads without a service-role key).
 *   - src/components/admin/AdminDashboard.tsx's `<PageMasthead eyebrow title meta />` header block.
 *   - src/components/admin/ErrorGroupsView.tsx's read-only table shape: `var(--surface)` /
 *     `var(--color-border)` card, uppercase 10.5px column heads, dashed-border empty state. This page
 *     inlines the same shape rather than adding a new shared component, matching WO-18's write set
 *     (src/app/admin/factors/** only — no src/components/admin/** edit).
 *
 * NOT the eligibility view. This reads the raw `emission_factors` table, not
 * `emission_factor_candidates` — an admin diagnostic screen needs to see every row (including any
 * future-dated or non-licence-clear one), not only what a customer surface would ever serve.
 */
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { formatDate } from "@/lib/format";

interface FactorRow {
  factor_id: string;
  tier: string;
  scope_kind: string;
  mode: string;
  vehicle_class: string | null;
  energy_carrier: string | null;
  jurisdiction: string | null;
  operator_key: string | null;
  corridor_id: string | null;
  quantity_basis: string;
  wtt_co2e: number | null;
  ttw_co2e: number | null;
  wtw_co2e: number | null;
  gwp_basis: string;
  derivation: string;
  origin_class: string;
  pedigree: number;
  method_version: string;
  as_at_date: string;
  valid_from: string;
  valid_to: string | null;
  superseded_by: string | null;
  source_key: string;
  data_sources: { name: string; licence: string | null; redistribution: string; embeddable: boolean } | null;
}

const TIER_LABEL: Record<string, string> = {
  carrier_primary: "Carrier primary",
  verified_operator_avg: "Verified operator avg",
  programme_lane_avg: "Programme lane avg",
  modal_default: "Modal default",
  proxy_estimate: "Proxy estimate",
};

function kindLabel(f: FactorRow): string {
  const parts = [f.mode];
  if (f.vehicle_class) parts.push(f.vehicle_class);
  if (f.energy_carrier) parts.push(f.energy_carrier);
  if (f.jurisdiction) parts.push(f.jurisdiction);
  if (f.operator_key) parts.push(`operator:${f.operator_key}`);
  if (f.corridor_id) parts.push(`corridor:${f.corridor_id.slice(0, 20)}…`);
  return parts.join(" · ");
}

/** The value column shows every populated CO2e leg (a source may state one, two or all three). */
function valueCell(f: FactorRow): string {
  const legs: string[] = [];
  if (f.wtt_co2e !== null) legs.push(`WTT ${f.wtt_co2e}`);
  if (f.ttw_co2e !== null) legs.push(`TTW ${f.ttw_co2e}`);
  if (f.wtw_co2e !== null) legs.push(`WTW ${f.wtw_co2e}`);
  return legs.join(" · ") || "—";
}

export default async function AdminFactorsPage() {
  await requirePlatformAdmin("/admin/factors");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("emission_factors")
    .select(
      "factor_id, tier, scope_kind, mode, vehicle_class, energy_carrier, jurisdiction, operator_key, " +
        "corridor_id, quantity_basis, wtt_co2e, ttw_co2e, wtw_co2e, gwp_basis, derivation, origin_class, " +
        "pedigree, method_version, as_at_date, valid_from, valid_to, superseded_by, source_key, " +
        "data_sources(name, licence, redistribution, embeddable)"
    )
    .order("tier")
    .order("mode")
    .order("valid_from", { ascending: false });

  const rows = (error ? [] : (data as unknown as FactorRow[]) || []);
  const live = rows.filter((r) => !r.superseded_by);
  const superseded = rows.length - live.length;

  return (
    <>
      <PageMasthead
        eyebrow="Platform admin · emission factors"
        title="Emission factors"
        meta={
          error
            ? "Could not read emission_factors — see server log."
            : `${rows.length} row${rows.length === 1 ? "" : "s"} · ${live.length} live` +
              (superseded ? ` · ${superseded} superseded` : "") +
              " · read-only (WO-18)"
        }
      />

      <div style={{ padding: "28px 36px 80px" }}>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              background: "var(--raised)",
              borderBottom: "1px solid var(--color-border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 12,
            }}
          >
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 800,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--text)",
              }}
            >
              emission_factors
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-2)" }}>
              migration 258 · append-only · candidates resolve via factor-tier.mjs resolveActiveFactor()
            </span>
          </div>

          {error ? (
            <div style={{ margin: 16, border: "1px dashed var(--sev-critical, #c0392b)", background: "var(--color-background)", borderRadius: 8, padding: "14px 16px" }}>
              <p style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", margin: "0 0 4px" }}>
                Could not read emission_factors.
              </p>
              <p style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--text-2)", margin: 0 }}>{error.message}</p>
            </div>
          ) : rows.length === 0 ? (
            <div
              style={{
                margin: 16,
                border: "1px dashed var(--color-border-strong)",
                background: "var(--color-background)",
                borderRadius: 8,
                padding: "14px 16px",
              }}
            >
              <p style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", margin: "0 0 4px" }}>
                No emission factors seeded yet.
              </p>
              <p style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--text-2)", margin: 0 }}>
                Migration 258 applied the table and the licence register; no factor rows exist until a
                seeder runs with <code>--apply</code> (WO-18: <code>scripts/gen/emission-factors-desnz.mjs</code>,{" "}
                <code>scripts/gen/emission-factors-epa.mjs</code>). Empty here is the honest state, not a
                broken page.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-2)" }}>
                    <th style={thStyle}>Tier</th>
                    <th style={thStyle}>Kind</th>
                    <th style={thStyle}>Value (kg CO2e)</th>
                    <th style={thStyle}>Unit</th>
                    <th style={thStyle}>Envelope</th>
                    <th style={thStyle}>As-at</th>
                    <th style={thStyle}>Licence</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => (
                    <tr
                      key={f.factor_id}
                      style={{
                        borderTop: "1px solid var(--color-border-subtle)",
                        opacity: f.superseded_by ? 0.55 : 1,
                      }}
                    >
                      <td style={tdStyle}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: "1px 7px",
                            borderRadius: 999,
                            background: "var(--raised)",
                            border: "1px solid var(--color-border)",
                            color: "var(--text)",
                          }}
                        >
                          {TIER_LABEL[f.tier] ?? f.tier}
                        </span>
                        {f.superseded_by && (
                          <div style={{ fontSize: 10, color: "var(--text-2)", marginTop: 3 }}>superseded</div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--text)" }}>{kindLabel(f)}</td>
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                        {valueCell(f)}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--text-2)" }}>{f.quantity_basis}</td>
                      <td style={{ ...tdStyle, color: "var(--text-2)" }}>
                        {f.origin_class} · {f.derivation} · pedigree {f.pedigree} · {f.gwp_basis}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--text-2)" }}>{formatDate(f.as_at_date)}</td>
                      <td style={tdStyle}>
                        <span
                          title={f.data_sources?.licence ?? undefined}
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: "1px 7px",
                            borderRadius: 999,
                            background: "var(--raised)",
                            border: "1px solid var(--color-border)",
                            color: f.data_sources?.embeddable ? "var(--color-primary)" : "var(--sev-critical)",
                          }}
                        >
                          {f.data_sources?.name ?? f.source_key}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: "9px 16px",
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const tdStyle: React.CSSProperties = {
  padding: "9px 16px",
  verticalAlign: "middle",
};

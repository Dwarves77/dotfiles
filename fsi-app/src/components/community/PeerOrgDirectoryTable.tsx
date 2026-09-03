/**
 * PeerOrgDirectoryTable — the peer-org directory (spec 05 §5 component 3: "peer-org directory,
 * aggregate, pseudonymous"). Renders COUNTS ONLY, grouped by org type, region, and sector — never a
 * row per person, never a name, never a company. Fed by directory/page.tsx's server-side aggregation
 * over `profiles.affiliation_type` / `profiles.region` / `profiles.sector_overrides` /
 * `profiles.verifier_status` (the legacy schema's closest real fields to the spec's orgType/region/
 * sector/verified projection — [INFERRED], documented in this lane's report: no `organizations.type`
 * column exists, so "role" from the spec's identity shape is intentionally NOT reproduced here —
 * `profiles.job_title` is free text a member entered themselves and is close enough to a name-bearing
 * field that this directory does not read it at all).
 *
 * Pure presentational: takes pre-aggregated rows, renders nothing when there is nothing to show.
 */

export interface OrgTypeRegionRow {
  orgType: string;
  region: string;
  members: number;
  verified: number;
}

export interface SectorRow {
  sector: string;
  members: number;
}

interface PeerOrgDirectoryTableProps {
  byOrgTypeAndRegion: OrgTypeRegionRow[];
  bySector: SectorRow[];
  totalMembers: number;
}

export function PeerOrgDirectoryTable({
  byOrgTypeAndRegion,
  bySector,
  totalMembers,
}: PeerOrgDirectoryTableProps) {
  if (totalMembers === 0) {
    return (
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: "1px dashed var(--color-border)",
          borderRadius: 6,
          padding: "32px 20px",
          textAlign: "center",
          fontSize: 13,
          color: "var(--color-text-secondary)",
        }}
      >
        No peer-org data yet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          overflowX: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              <Th>Org type</Th>
              <Th>Region</Th>
              <Th align="right">Members</Th>
              <Th align="right">Verified</Th>
            </tr>
          </thead>
          <tbody>
            {byOrgTypeAndRegion.map((row) => (
              <tr
                key={`${row.orgType}::${row.region}`}
                style={{ borderBottom: "1px solid var(--color-border-subtle, var(--color-border))" }}
              >
                <Td>{row.orgType}</Td>
                <Td>{row.region}</Td>
                <Td align="right">{row.members}</Td>
                <Td align="right">{row.verified}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bySector.length > 0 && (
        <div
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                <Th>Sector</Th>
                <Th align="right">Members</Th>
              </tr>
            </thead>
            <tbody>
              {bySector.map((row) => (
                <tr
                  key={row.sector}
                  style={{ borderBottom: "1px solid var(--color-border-subtle, var(--color-border))" }}
                >
                  <Td>{row.sector}</Td>
                  <Td align="right">{row.members}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "8px 12px",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <td
      style={{
        textAlign: align,
        padding: "7px 12px",
        color: "var(--color-text-primary)",
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </td>
  );
}

"use client";

/**
 * PortfolioIndexView: /dashboard/portfolio, the list of the workspace's portfolios (lane S8-D, 2026-10-07;
 * spec 00 section 5; migration 362).
 *
 * WHAT IT IS. A workspace view UNDER the dashboard, not a sixth surface and not a nav entry (PI-1): a
 * portfolio is a SELECTION of already-held items, corridors and entities the workspace chose to watch
 * together (ADR-042: nothing the reader types is analysed; the only typed text is the portfolio name).
 *
 * BUILT FROM SHARED PARTS ONLY: Masthead, PageFrame, SectionCard, SectionHeading, RowTable (the one tabular
 * row anatomy), RailCard, StateNote, CardFoot, Button. No new row part.
 *
 * Reader's goal: open a portfolio, or make one. Shortest path: click its name (one step); to make one,
 * type a name and press Create (two steps, and the new portfolio opens). One primary action: Create
 * portfolio. Feedback: the button reads "Creating..." while the request is in flight, a failure shows an
 * inline banner naming what went wrong with the typed name kept, success navigates to the new portfolio.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Masthead } from "@/components/ui/Masthead";
import { PageFrame } from "@/components/layout/PageFrame";
import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { RowTable } from "@/components/ui/RowTable";
import { RailCard } from "@/components/ui/RailCard";
import { StateNote } from "@/components/ui/StateNote";
import { CardFoot } from "@/components/ui/CardFoot";
import { Button } from "@/components/ui/Button";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { formatLocaleDate, countNoun } from "@/lib/format";
import { nowFrom } from "@/lib/render-now";
import { createPortfolioRequest } from "@/lib/portfolio/client";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { PortfolioSummary } from "@/lib/portfolio/types";

export type PortfolioIndexState = "ok" | "signed-out" | "unavailable";

export interface PortfolioIndexViewProps {
  state: PortfolioIndexState;
  portfolios: PortfolioSummary[];
  /** True when the member-count read hit its bound, so a count may be low. Stated, never hidden. */
  countsTruncated?: boolean;
  /** The server render instant (render-now.ts); every date derives from it. */
  nowIso?: string;
}

const NAME_MAX = 80;

export function PortfolioIndexView({ state, portfolios, countsTruncated = false, nowIso }: PortfolioIndexViewProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // SEC-3b (migration 370): creating a portfolio is a shared workspace write and role viewer reads but
  // does not write, so a viewer sees the list without the create form.
  const isViewer = useWorkspaceStore((s) => s.userRole) === "viewer";

  async function create() {
    const clean = name.trim();
    if (!clean || pending) return;
    setPending(true);
    setError(null);
    const res = await createPortfolioRequest(clean);
    if (!res.ok) {
      setError(res.error ?? "That did not go through. Try again.");
      setPending(false);
      return;
    }
    router.push(`/dashboard/portfolio/${res.body?.portfolio.id ?? ""}`);
  }

  const now = nowFrom(nowIso);
  const dateLabel = formatLocaleDate(now, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <>
      <div style={{ padding: "20px 40px 0" }}>
        <Masthead
          title="Portfolios"
          dateLabel={dateLabel}
          nowIso={nowIso}
          dek={
            <span>
              A portfolio is a selection of items, corridors and entities your workspace holds together. It
              filters nothing and analyses nothing you type; the figures shown for it come from held data only.
            </span>
          }
        />
      </div>
      <PageFrame
        rail={
          <RailCard title="How portfolios work">
            <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-2)", margin: 0, lineHeight: 1.5 }}>
              Add an item, corridor or entity from the page that shows it. Adding the same thing again from
              anywhere is the same record. Everyone in your workspace sees the same portfolios; members, admins and owners can change them.
            </p>
          </RailCard>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <SectionCard>
            <SectionHeading title={`Portfolios · ${portfolios.length}`} aside="Newest first" />

            {state === "signed-out" ? (
              <div style={{ padding: 16 }}>
                <StateNote action={{ label: "Sign in →", href: "/login" }}>Sign in to see your workspace&apos;s portfolios.</StateNote>
              </div>
            ) : state === "unavailable" ? (
              <div style={{ padding: 16 }}>
                <StateNote action={{ label: "Back to the dashboard →", href: "/" }}>
                  Portfolios could not be read just now. Nothing was lost; try again in a moment.
                </StateNote>
              </div>
            ) : (
              <>
                {!isViewer && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void create();
                  }}
                  style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "0 16px 14px" }}
                >
                  <input
                    id="portfolio-name"
                    aria-label="Portfolio name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={NAME_MAX}
                    placeholder="Name a new portfolio, for example Asia to Europe lanes"
                    autoComplete="off"
                    style={{
                      flex: "1 1 240px",
                      minWidth: 0,
                      minHeight: 44,
                      padding: "0 12px",
                      fontSize: "var(--fs-13)",
                      border: "1px solid var(--line-1)",
                      borderRadius: 6,
                      background: "var(--card)",
                      color: "var(--ink)",
                    }}
                  />
                  <Button type="submit" variant="primary" disabled={pending || name.trim().length === 0} style={{ minHeight: 44 }}>
                    {pending ? "Creating..." : "Create portfolio"}
                  </Button>
                </form>
                )}
                {error && (
                  <div style={{ padding: "0 16px 14px" }}>
                    <InlineErrorBanner message={error} />
                  </div>
                )}

                {portfolios.length === 0 ? (
                  <div style={{ padding: "0 16px 16px" }}>
                    <StateNote>
                      {isViewer
                        ? "No portfolios yet. Your role in this workspace can read portfolios but not create them; a member, admin or owner can."
                        : "No portfolios yet. Name one above to start; it opens straight away and you can add items, corridors and entities from there."}
                    </StateNote>
                  </div>
                ) : (
                  <RowTable
                    columns={[
                      { label: "Portfolio", width: "minmax(0, 1fr)" },
                      { label: "Members", width: "88px" },
                      { label: "Created", width: "120px" },
                    ]}
                    rows={portfolios.map((p) => ({
                      key: p.id,
                      cells: [
                        <Link
                          key="n"
                          href={`/dashboard/portfolio/${p.id}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            minHeight: 44,
                            fontWeight: 600,
                            color: "var(--ink)",
                            textDecoration: "none",
                          }}
                        >
                          <span data-guard-title style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                            {p.name}
                          </span>
                        </Link>,
                        <span key="m" style={{ color: "var(--ink-2)" }}>
                          {countNoun(p.memberCount, "member")}
                        </span>,
                        <span key="c" style={{ color: "var(--ink-2)" }}>
                          {formatLocaleDate(new Date(p.createdAt), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                        </span>,
                      ],
                    }))}
                  />
                )}
                <CardFoot
                  left={countsTruncated ? "Member counts are a lower bound for the largest portfolios." : "Open a portfolio to see its roll-ups."}
                  right={null}
                />
              </>
            )}
          </SectionCard>
        </div>
      </PageFrame>
    </>
  );
}

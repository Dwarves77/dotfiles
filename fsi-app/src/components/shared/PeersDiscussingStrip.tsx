"use client";

/**
 * PeersDiscussingStrip — the cross-surface "peers are discussing this" strip (wave3 plan,
 * COMMUNITY-B's paragraph: "PeersDiscussing strip on the three detail pages (regulations/market/
 * research [slug]), fed by the entity threads endpoint; renders nothing (no empty box) when there
 * are no threads"). This is also the acceptance-criterion-4 surface: "Community items surfaced on
 * other surfaces carry the unverified label in that context too" (spec 05 §6.4) — every thread row
 * below carries its PromotionStateBadge, exactly as it would inside Community itself.
 *
 * Fetches GET /api/community/entities/[entityId]/threads ONCE on mount via
 * api-client.getEntityThreads (client-side: a server component can't hit its own app's relative API
 * route without reconstructing an absolute origin, and this keeps the payload on the three detail
 * pages small — no polling). The caller (regulations/market/research [slug] page.tsx, all outside
 * this lane's other write-set restrictions but each insert exactly one of these) resolves the
 * item's bound spine entity server-side (via `intelligence_items.instrument_entity_id`, migration
 * 283) and passes it as `entityId`; when that resolution finds nothing, the caller doesn't render
 * this component at all rather than mounting it with a null entityId.
 *
 * Renders NOTHING (no empty box, no loading skeleton left behind) once it's established there are
 * no threads — the wave3 plan's explicit requirement — so a detail page with no community activity
 * looks exactly as it did before this component existed.
 */

import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { getEntityThreads, type EntityThread } from "@/components/community/api-client";
import { AuthorIdentityChip } from "@/components/community/AuthorIdentityChip";
import { PromotionStateBadge } from "@/components/community/PromotionStateBadge";
import { EvidenceAgeChip } from "@/components/community/EvidenceAgeChip";

interface PeersDiscussingStripProps {
  /** The spine entity this item is bound to. Omit (or pass null/undefined) when the caller could
   * not resolve one — the strip renders nothing rather than mounting to fetch with a bad id. */
  entityId: string | null | undefined;
  /** How many threads to show. Kept small — this is a cross-surface teaser, not the feed. */
  limit?: number;
}

export function PeersDiscussingStrip({ entityId, limit = 3 }: PeersDiscussingStripProps) {
  const [threads, setThreads] = useState<EntityThread[] | null>(null);

  useEffect(() => {
    if (!entityId) {
      setThreads(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await getEntityThreads(entityId, { limit });
      if (!cancelled) setThreads(result?.threads ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [entityId, limit]);

  if (!entityId) return null;
  if (threads === null) return null; // still loading — no skeleton, per this component's contract
  if (threads.length === 0) return null; // no threads — render nothing, no empty box

  return (
    <section
      aria-label="Peers are discussing this"
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        padding: "16px 18px",
        marginTop: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <h3
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          margin: 0,
          fontFamily: "var(--font-display)",
          fontSize: 13,
          fontWeight: 400,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
        }}
      >
        <MessageSquare size={13} aria-hidden="true" />
        Peers are discussing this
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {threads.map((t) => (
          <article
            key={t.id}
            style={{
              borderTop: "1px solid var(--color-border)",
              paddingTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <p
              data-guard-title
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--color-text-primary)",
                overflowWrap: "anywhere",
                minWidth: 0,
              }}
            >
              {t.title || t.body.slice(0, 140)}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {t.author_identity && <AuthorIdentityChip identity={t.author_identity} />}
              <PromotionStateBadge state={t.promotion_state} originClass={t.origin_class} />
              <EvidenceAgeChip chip={t.evidence_chip} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

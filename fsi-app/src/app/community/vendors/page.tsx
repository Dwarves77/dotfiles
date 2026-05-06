"use client";

/**
 * /community/vendors — Phase C visual stub.
 *
 * Moved from /vendors to /community/vendors as part of PR-D IA refactor
 * (2026-05-06). The original /vendors route now 308-redirects here.
 *
 * Static directory of curated freight vendors mentioned in community
 * discussions and intelligence briefs. Backend (mention/intro flows,
 * mention counts, vendor profiles) ships in Phase D — until then both
 * CTAs surface a "Coming soon" toast.
 *
 * Row pattern lifted from design_handoff_2026-04/preview/community.html
 * (".side-card" + ".vendor-row" — verified ✓ + specialty descriptor),
 * promoted from a sidebar list into a 3-column grid of cl-card tiles.
 * Masthead matches dashboard-v3.html via shared PageMasthead.
 */

import { useState } from "react";
import { Check } from "lucide-react";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";

interface Vendor {
  name: string;
  verified: boolean;
  tags: string[];
  description: string;
}

// Seeded from design_handoff_2026-04/preview/community.html "EU vendors
// mentioned this week" rail (Chenue, Mtec Fine Art) plus brief-supplied
// reference vendors (Earthcrate, Rokbox) and 6 plausible peers in
// adjacent fine-art / sustainable-packaging / high-value freight bands.
const VENDORS: Vendor[] = [
  {
    name: "Chenue",
    verified: true,
    tags: ["EU + UK", "EV art transport", "Biofuel logistics"],
    description: "Electric-vehicle fine art transport with HVO biofuel long-haul fleet.",
  },
  {
    name: "Mtec Fine Art",
    verified: true,
    tags: ["UK / EU", "Sustainable crating", "Recycled packaging"],
    description: "Sustainable crating and recycled packaging for museum-grade shipments.",
  },
  {
    name: "Earthcrate",
    verified: false,
    tags: ["Global", "Reusable crating", "Exhibition logistics"],
    description: "Reusable exhibition crating system reducing single-use timber waste.",
  },
  {
    name: "Rokbox",
    verified: false,
    tags: ["Global", "Reusable cases", "Artwork shipping"],
    description: "Reusable hard-shell shipping cases engineered for artwork in transit.",
  },
  {
    name: "Crown Fine Art",
    verified: true,
    tags: ["Global", "Museum logistics", "Climate-controlled"],
    description: "Climate-controlled museum logistics network with bonded storage hubs.",
  },
  {
    name: "Constantine",
    verified: true,
    tags: ["UK / EU", "Fine art handling", "Touring exhibitions"],
    description: "End-to-end touring-exhibition logistics with on-site installation crews.",
  },
  {
    name: "Hasenkamp",
    verified: true,
    tags: ["EU", "Art handling", "Climate transport"],
    description: "Pan-European art transport with climate-controlled trucks and vault storage.",
  },
  {
    name: "Atelier 4",
    verified: false,
    tags: ["North America", "Fine art shipping", "Custom crating"],
    description: "New York-based fine art shipper with bespoke crating and gallery installation.",
  },
  {
    name: "Dietl International",
    verified: false,
    tags: ["Global", "High-value freight", "Customs brokerage"],
    description: "High-value cargo freight forwarding with integrated customs brokerage.",
  },
  {
    name: "Momart",
    verified: true,
    tags: ["UK / EU", "Museum transport", "Storage"],
    description: "Specialist museum and gallery transport with secure climate-controlled storage.",
  },
];

export default function VendorsPage() {
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });

  const showComingSoon = () => {
    setToast({
      message: "Vendor directory backend launches in Phase D",
      visible: true,
    });
  };

  return (
    <>
      <PageMasthead
        eyebrow="Vendor directory"
        title="Vendors"
        meta="Curated freight vendors mentioned in community discussions and intelligence briefs"
      />

      <div style={{ padding: "28px 36px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {VENDORS.map((vendor) => (
            <div
              key={vendor.name}
              className="cl-card"
              style={{
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 className="cl-card-title" style={{ margin: 0 }}>
                  {vendor.name}
                </h3>
                {vendor.verified && (
                  <span
                    aria-label="Verified vendor"
                    title="Verified vendor"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      color: "var(--color-low)",
                    }}
                  >
                    <Check size={14} strokeWidth={2.5} />
                  </span>
                )}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {vendor.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      background: "var(--color-bg-raised)",
                      border: "1px solid var(--color-border-subtle)",
                      borderRadius: "999px",
                      fontSize: "11px",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <p className="cl-card-body" style={{ margin: 0, flex: 1 }}>
                {vendor.description}
              </p>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Button variant="secondary" size="sm" onClick={showComingSoon}>
                  Mention this vendor
                </Button>
                <Button variant="ghost" size="sm" onClick={showComingSoon}>
                  Request introduction
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onDismiss={() => setToast({ message: "", visible: false })}
      />
    </>
  );
}

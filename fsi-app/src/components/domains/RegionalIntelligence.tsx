"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  Globe, Sun, Zap, Users, Building, ChevronDown,
  AlertCircle, CheckCircle, HelpCircle,
} from "lucide-react";

// ── Regional Data Structure ──

interface RegionalProfile {
  id: string;
  jurisdiction: string;
  region: string;
  priority: "high" | "medium" | "low";
  data: {
    solar: { status: string; details: string; confidence: "confirmed" | "unconfirmed" };
    electricity: { tariff: string; details: string; confidence: "confirmed" | "unconfirmed" };
    labor: { benchmark: string; details: string; confidence: "confirmed" | "unconfirmed" };
    ev_charging: { status: string; details: string; confidence: "confirmed" | "unconfirmed" };
    green_building: { standard: string; details: string; confidence: "confirmed" | "unconfirmed" };
    active_regulations: string[];
  };
  open_questions: string[];
}

const REGIONAL_PROFILES: RegionalProfile[] = [
  {
    id: "uae-dubai",
    jurisdiction: "Dubai / UAE",
    region: "Middle East & Africa",
    priority: "high",
    data: {
      solar: {
        status: "Permitted — DEWA Shams Dubai",
        details: "DEWA Shams Dubai program (Version 4, June 2022) explicitly permits commercial and industrial rooftop solar with net metering. Contradicts prior claim that commercial solar is prohibited. REQUIRES LIVE VERIFICATION.",
        confidence: "unconfirmed",
      },
      electricity: {
        tariff: "AED 0.23-0.38/kWh commercial",
        details: "DEWA commercial tariff varies by consumption slab. Free zone tariffs may differ from mainland.",
        confidence: "confirmed",
      },
      labor: {
        benchmark: "AED 3,000-5,000/month (logistics roles)",
        details: "Labor costs for warehouse and monitoring roles. Subject to visa and labor law requirements.",
        confidence: "confirmed",
      },
      ev_charging: {
        status: "DEWA Green Charger initiative",
        details: "DEWA operates public charging network. Commercial fleet charging infrastructure expanding.",
        confidence: "confirmed",
      },
      green_building: {
        standard: "Estidama Pearl (Abu Dhabi), Al Sa'fat (Dubai)",
        details: "Abu Dhabi requires Estidama Pearl for government buildings. Dubai Municipality Al Sa'fat system for new buildings.",
        confidence: "confirmed",
      },
      active_regulations: [
        "DEWA Shams Dubai rooftop solar (verify current status)",
        "UAE Net Zero 2050 strategy",
        "Dubai Clean Energy Strategy 2050",
      ],
    },
    open_questions: [
      "DEWA Shams Dubai: verify current program terms and any amendments since Version 4 (June 2022)",
      "Free zone vs mainland electricity tariff differential for warehouse operations",
      "Commercial fleet EV charging infrastructure in Jebel Ali Free Zone",
    ],
  },
  {
    id: "uk",
    jurisdiction: "United Kingdom",
    region: "Europe",
    priority: "high",
    data: {
      solar: {
        status: "Permitted — feed-in tariff ended, SEG active",
        details: "Smart Export Guarantee (SEG) replaced feed-in tariff. Commercial rooftop solar permitted with planning permission. ROI varies by region.",
        confidence: "confirmed",
      },
      electricity: {
        tariff: "£0.25-0.35/kWh commercial (2024)",
        details: "Electricity prices elevated post-energy crisis. Regional variation. Industrial contracts lower.",
        confidence: "confirmed",
      },
      labor: {
        benchmark: "£25,000-35,000/year (warehouse/logistics)",
        details: "National Living Wage £11.44/hr (2024). London premium ~15-20%.",
        confidence: "confirmed",
      },
      ev_charging: {
        status: "Expanding — ZEV mandate driving fleet adoption",
        details: "UK ZEV mandate requires increasing zero-emission vehicle sales. Rapid charging network growing. Workplace charging scheme available.",
        confidence: "confirmed",
      },
      green_building: {
        standard: "BREEAM",
        details: "BREEAM is the primary green building standard. Not mandatory for all buildings but increasingly required by institutional investors.",
        confidence: "confirmed",
      },
      active_regulations: [
        "UK ETS (post-Brexit, separate from EU ETS)",
        "UK SAF mandate (2% from 2025)",
        "ZEV mandate (trucks)",
        "UK EPR packaging",
        "Environment Act 2021",
      ],
    },
    open_questions: [
      "UK-EU ETS linkage negotiations — status and timeline",
      "Impact of UK SAF mandate on air cargo surcharges ex-UK",
    ],
  },
  {
    id: "eu-core",
    jurisdiction: "EU (Germany, Netherlands, Belgium, France, Italy)",
    region: "Europe",
    priority: "high",
    data: {
      solar: {
        status: "Permitted — varying incentive structures",
        details: "Germany: EEG feed-in. Netherlands: SDE++ subsidy. Belgium: green certificates (regional). France: feed-in premium. Italy: tax deduction.",
        confidence: "confirmed",
      },
      electricity: {
        tariff: "€0.15-0.35/kWh (varies by country)",
        details: "Germany highest (~€0.30), France lower (~€0.20 nuclear base). Network charges significant component.",
        confidence: "confirmed",
      },
      labor: {
        benchmark: "€30,000-45,000/year (warehouse/logistics)",
        details: "Germany and Netherlands highest. Southern/Eastern EU significantly lower.",
        confidence: "confirmed",
      },
      ev_charging: {
        status: "AFIR mandates minimum infrastructure",
        details: "EU Alternative Fuels Infrastructure Regulation requires charging every 60km on TEN-T by 2025. Member state implementation varies.",
        confidence: "confirmed",
      },
      green_building: {
        standard: "BREEAM / DGNB / HQE",
        details: "BREEAM in NL/BE, DGNB in Germany, HQE in France. EPBD recast driving minimum performance standards.",
        confidence: "confirmed",
      },
      active_regulations: [
        "EU ETS (Phase 4, maritime included)",
        "FuelEU Maritime (from 2025)",
        "ReFuelEU Aviation",
        "CBAM (transitional, full 2026)",
        "CSRD/ESRS reporting",
        "EU PPWR packaging",
        "EUDR deforestation",
        "AFIR infrastructure",
      ],
    },
    open_questions: [
      "PPWR delegated acts for recyclability criteria — timeline for Art. 6",
      "CSRD Omnibus scope changes — verify post-Omnibus thresholds",
    ],
  },
  {
    id: "us-federal",
    jurisdiction: "US (Federal + California, New York)",
    region: "Americas",
    priority: "high",
    data: {
      solar: {
        status: "Permitted — IRA 30% ITC",
        details: "Inflation Reduction Act provides 30% Investment Tax Credit for commercial solar. State incentives additive. Net metering rules vary by state and utility.",
        confidence: "confirmed",
      },
      electricity: {
        tariff: "$0.08-0.20/kWh (varies by state)",
        details: "California highest (~$0.20). Texas/Southeast lowest (~$0.08). Industrial rates lower.",
        confidence: "confirmed",
      },
      labor: {
        benchmark: "$35,000-55,000/year (warehouse/logistics)",
        details: "California/NY significantly higher. Federal minimum $7.25/hr but most states higher. Prevailing wage requirements for IRA-funded projects.",
        confidence: "confirmed",
      },
      ev_charging: {
        status: "CARB mandates; federal NEVI program",
        details: "California CARB Advanced Clean Trucks mandate. Federal NEVI program building national charging network. State waiver uncertainty.",
        confidence: "confirmed",
      },
      green_building: {
        standard: "LEED",
        details: "LEED is dominant US standard. Various local codes (NYC Local Law 97). California Title 24 is de facto performance standard.",
        confidence: "confirmed",
      },
      active_regulations: [
        "EPA vehicle GHG standards (volatile — state divergence)",
        "CARB Advanced Clean Trucks (Section 177 states follow)",
        "IRA clean energy tax credits",
        "SEC climate disclosure rule (litigation ongoing)",
      ],
    },
    open_questions: [
      "EPA Phase 3 rule survival — political review risk",
      "CARB waiver status — federal challenge outcome",
      "SEC climate disclosure rule litigation outcome",
    ],
  },
  {
    id: "singapore",
    jurisdiction: "Singapore",
    region: "Asia-Pacific",
    priority: "medium",
    data: {
      solar: {
        status: "Permitted — limited rooftop area, high ROI",
        details: "EMA allows solar leasing models. HDB and JTC rooftops increasingly utilized. Space constraints drive efficiency focus.",
        confidence: "confirmed",
      },
      electricity: {
        tariff: "S$0.25-0.30/kWh commercial",
        details: "Open electricity market. Carbon tax S$25/tCO2e (2024), rising to S$50-80 by 2030.",
        confidence: "confirmed",
      },
      labor: {
        benchmark: "S$2,500-4,000/month (logistics roles)",
        details: "Foreign worker levy applies. Progressive Wage Model for some sectors.",
        confidence: "confirmed",
      },
      ev_charging: {
        status: "60,000 charging points target by 2030",
        details: "Singapore Green Plan 2030 target. LTA and URA rolling out charging infrastructure.",
        confidence: "confirmed",
      },
      green_building: {
        standard: "BCA Green Mark (mandatory)",
        details: "Mandatory for new buildings above 5,000 sqm. Singapore leads ASEAN in green building certification.",
        confidence: "confirmed",
      },
      active_regulations: [
        "Singapore carbon tax (rising trajectory)",
        "MPA Green Shipping Programme",
        "Singapore Green Plan 2030",
        "BCA Green Mark mandatory threshold",
      ],
    },
    open_questions: [
      "Shore power infrastructure at PSA terminals — current status",
      "MPA green corridor partnerships — latest bilateral agreements",
    ],
  },
  {
    id: "hk",
    jurisdiction: "Hong Kong",
    region: "Asia-Pacific",
    priority: "medium",
    data: {
      solar: {
        status: "Feed-in tariff available",
        details: "CLP and HK Electric offer feed-in tariffs for renewable energy. Limited rooftop space in commercial districts.",
        confidence: "confirmed",
      },
      electricity: {
        tariff: "HK$1.0-1.3/kWh commercial",
        details: "Two utilities: CLP (Kowloon, NT) and HK Electric (HK Island). Tariff includes fuel cost adjustment.",
        confidence: "confirmed",
      },
      labor: {
        benchmark: "HK$15,000-25,000/month (logistics roles)",
        details: "Statutory minimum wage HK$40/hr. Labor market tight in logistics sector.",
        confidence: "confirmed",
      },
      ev_charging: {
        status: "EV First Registration Tax waiver extended",
        details: "Government extending EV incentives. Charging infrastructure in public car parks expanding.",
        confidence: "confirmed",
      },
      green_building: {
        standard: "BEAM Plus",
        details: "Hong Kong Green Building Council BEAM Plus certification. Voluntary but increasingly adopted.",
        confidence: "confirmed",
      },
      active_regulations: [
        "Hong Kong Climate Action Plan 2050",
        "Waste charging scheme (pending implementation)",
        "EV policy framework",
      ],
    },
    open_questions: [
      "Warehouse EV charging infrastructure in Kwai Tsing container port area",
      "Cross-border trucking EV feasibility (HK-Shenzhen)",
    ],
  },
];

// ── Regional Profile Card ──

function RegionalProfileCard({ profile }: { profile: RegionalProfile }) {
  const [expanded, setExpanded] = useState(false);

  const priorityColors = {
    high: "var(--color-error)",
    medium: "var(--color-warning)",
    low: "var(--color-text-muted)",
  };

  const confidenceIcon = (c: "confirmed" | "unconfirmed") =>
    c === "confirmed"
      ? <CheckCircle size={10} style={{ color: "var(--color-success)" }} />
      : <HelpCircle size={10} style={{ color: "var(--color-warning)" }} />;

  return (
    <div
      className="border rounded-lg overflow-hidden transition-all duration-200"
      style={{
        borderColor: expanded ? "var(--color-border-strong)" : "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-[var(--color-surface-raised)] transition-colors duration-150"
      >
        <Globe size={16} style={{ color: "var(--color-primary)" }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {profile.jurisdiction}
            </h3>
            <span
              className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md"
              style={{
                color: priorityColors[profile.priority],
                backgroundColor: `${priorityColors[profile.priority]}12`,
                border: `1px solid ${priorityColors[profile.priority]}30`,
              }}
            >
              {profile.priority}
            </span>
          </div>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{profile.region}</span>
        </div>
        <ChevronDown
          size={14}
          className={cn("shrink-0 transition-transform duration-200", expanded && "rotate-180")}
          style={{ color: "var(--color-text-muted)" }}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          {/* Data Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            <DataCell icon={Sun} label="Solar" value={profile.data.solar.status} details={profile.data.solar.details} confidence={profile.data.solar.confidence} />
            <DataCell icon={Zap} label="Electricity" value={profile.data.electricity.tariff} details={profile.data.electricity.details} confidence={profile.data.electricity.confidence} />
            <DataCell icon={Users} label="Labor" value={profile.data.labor.benchmark} details={profile.data.labor.details} confidence={profile.data.labor.confidence} />
            <DataCell icon={Zap} label="EV Charging" value={profile.data.ev_charging.status} details={profile.data.ev_charging.details} confidence={profile.data.ev_charging.confidence} />
            <DataCell icon={Building} label="Green Building" value={profile.data.green_building.standard} details={profile.data.green_building.details} confidence={profile.data.green_building.confidence} />
          </div>

          {/* Active Regulations */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Active Regulations
            </span>
            <ul className="mt-1 space-y-1">
              {profile.data.active_regulations.map((reg, i) => (
                <li key={i} className="text-xs flex items-start gap-2" style={{ color: "var(--color-text-secondary)" }}>
                  <span style={{ color: "var(--color-primary)" }}>•</span>
                  {reg}
                </li>
              ))}
            </ul>
          </div>

          {/* Open Questions */}
          {profile.open_questions.length > 0 && (
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: "rgba(217, 119, 6, 0.06)",
                border: "1px solid rgba(217, 119, 6, 0.15)",
              }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-warning)" }}>
                <AlertCircle size={10} className="inline mr-1" />
                Open Questions
              </span>
              <ul className="mt-1 space-y-1">
                {profile.open_questions.map((q, i) => (
                  <li key={i} className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DataCell({
  icon: Icon,
  label,
  value,
  details,
  confidence,
}: {
  icon: typeof Sun;
  label: string;
  value: string;
  details: string;
  confidence: "confirmed" | "unconfirmed";
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      className="p-3 rounded-lg"
      style={{ backgroundColor: "var(--color-surface-raised)" }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={12} style={{ color: "var(--color-primary)" }} />
        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>
          {label}
        </span>
        {confidence === "unconfirmed" && (
          <HelpCircle size={10} style={{ color: "var(--color-warning)" }} />
        )}
      </div>
      <p className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
        {value}
      </p>
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="text-[11px] mt-1 cursor-pointer"
        style={{ color: "var(--color-primary)" }}
      >
        {showDetails ? "Less" : "More"}
      </button>
      {showDetails && (
        <p className="text-[11px] mt-1" style={{ color: "var(--color-text-secondary)" }}>
          {details}
        </p>
      )}
    </div>
  );
}

// ── Main Component ──

export function RegionalIntelligence() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Regional Operations Intelligence
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Energy tariffs, labor costs, solar permitting, EV infrastructure, and green building requirements by jurisdiction.
        </p>
      </div>

      <div className="space-y-3">
        {REGIONAL_PROFILES.map((profile) => (
          <RegionalProfileCard key={profile.id} profile={profile} />
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  Globe, Sun, Zap, Users, Building, ChevronDown,
  AlertCircle, CheckCircle, HelpCircle, ExternalLink,
} from "lucide-react";

// ── Regional Data Structure ──

interface DataPoint {
  status: string;
  details: string;
  confidence: "confirmed" | "unconfirmed";
  source: string;
  source_url: string;
  last_updated: string;
  update_frequency: string;
}

interface RegionalProfile {
  id: string;
  jurisdiction: string;
  region: string;
  priority: "high" | "medium" | "low";
  data: {
    solar: DataPoint;
    electricity: DataPoint;
    labor: DataPoint;
    ev_charging: DataPoint;
    green_building: DataPoint;
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
        source: "DEWA",
        source_url: "https://www.dewa.gov.ae/en/consumers/innovation/shams-dubai",
        last_updated: "June 2022 (Version 4)",
        update_frequency: "Ad hoc regulatory updates",
      },
      electricity: {
        status: "AED 0.23-0.38/kWh commercial",
        details: "DEWA commercial tariff varies by consumption slab. Free zone tariffs may differ from mainland. Slab structure: 0-2000 kWh, 2001-4000 kWh, 4001-6000 kWh, 6000+ kWh.",
        confidence: "confirmed",
        source: "DEWA Tariff Schedule",
        source_url: "https://www.dewa.gov.ae/en/consumer/billing/slab-tariff",
        last_updated: "2024",
        update_frequency: "Annual tariff review",
      },
      labor: {
        status: "AED 3,000-5,000/month (logistics roles)",
        details: "Labor costs for warehouse and monitoring roles. Subject to visa and labor law requirements. UAE Labour Law Federal Decree-Law No. 33 of 2021.",
        confidence: "confirmed",
        source: "UAE MOHRE",
        source_url: "https://www.mohre.gov.ae",
        last_updated: "2024",
        update_frequency: "Annual wage surveys",
      },
      ev_charging: {
        status: "DEWA Green Charger initiative",
        details: "DEWA operates public charging network. Commercial fleet charging infrastructure expanding. Dubai Green Mobility Strategy targets 42% green trips by 2030.",
        confidence: "confirmed",
        source: "DEWA / RTA Dubai",
        source_url: "https://www.dewa.gov.ae/en/consumer/ev-green-charger",
        last_updated: "2024",
        update_frequency: "Quarterly infrastructure updates",
      },
      green_building: {
        status: "Estidama Pearl (Abu Dhabi), Al Sa'fat (Dubai)",
        details: "Abu Dhabi requires Estidama Pearl for government buildings. Dubai Municipality Al Sa'fat system for new buildings.",
        confidence: "confirmed",
        source: "Abu Dhabi UPC / Dubai Municipality",
        source_url: "https://www.abudhabi.ae/en/infrastructure-environment/environment/estidama",
        last_updated: "2024",
        update_frequency: "Ad hoc standard updates",
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
        details: "Smart Export Guarantee (SEG) replaced feed-in tariff. Commercial rooftop solar permitted with planning permission. ROI varies by region and DNO capacity.",
        confidence: "confirmed",
        source: "Ofgem",
        source_url: "https://www.ofgem.gov.uk/environmental-and-social-schemes/smart-export-guarantee-seg",
        last_updated: "2024",
        update_frequency: "Annual Ofgem review",
      },
      electricity: {
        status: "£0.25-0.35/kWh commercial (2024)",
        details: "Electricity prices elevated post-energy crisis. Regional variation significant. Industrial contracts typically lower than published rates.",
        confidence: "confirmed",
        source: "Ofgem / DESNZ",
        source_url: "https://www.gov.uk/government/statistical-data-sets/industrial-energy-prices",
        last_updated: "Q4 2024",
        update_frequency: "Quarterly",
      },
      labor: {
        status: "£25,000-35,000/year (warehouse/logistics)",
        details: "National Living Wage £11.44/hr (April 2024). London premium ~15-20%. Warehouse operative median ~£26,000/yr.",
        confidence: "confirmed",
        source: "ONS Annual Survey of Hours and Earnings",
        source_url: "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours",
        last_updated: "November 2024",
        update_frequency: "Annual (November release)",
      },
      ev_charging: {
        status: "Expanding — ZEV mandate driving fleet adoption",
        details: "UK ZEV mandate requires increasing zero-emission vehicle sales. Rapid charging network growing. Workplace Charging Scheme provides up to £350/socket.",
        confidence: "confirmed",
        source: "UK DfT / OZEV",
        source_url: "https://www.gov.uk/government/organisations/office-for-zero-emission-vehicles",
        last_updated: "2024",
        update_frequency: "Quarterly deployment stats",
      },
      green_building: {
        status: "BREEAM",
        details: "BREEAM is the primary green building standard. Not mandatory for all buildings but increasingly required by institutional investors and large tenants.",
        confidence: "confirmed",
        source: "BRE Global",
        source_url: "https://www.breeam.com",
        last_updated: "2024",
        update_frequency: "Ad hoc standard updates",
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
        status: "Permitted — varying incentive structures by member state",
        details: "Germany: EEG feed-in. Netherlands: SDE++ subsidy. Belgium: green certificates (regional). France: feed-in premium. Italy: tax deduction.",
        confidence: "confirmed",
        source: "IEA Policies and Measures Database",
        source_url: "https://www.iea.org/policies/about",
        last_updated: "2024",
        update_frequency: "Quarterly policy database updates",
      },
      electricity: {
        status: "€0.15-0.35/kWh (varies by country)",
        details: "Germany highest (~€0.30), France lower (~€0.20 nuclear base). Network charges are a significant component. Industrial rates lower than commercial.",
        confidence: "confirmed",
        source: "IEA Energy Prices Database",
        source_url: "https://www.iea.org/data-and-statistics/data-product/energy-prices",
        last_updated: "Q3 2024",
        update_frequency: "Quarterly (OECD countries)",
      },
      labor: {
        status: "€30,000-45,000/year (warehouse/logistics)",
        details: "Germany and Netherlands highest. Southern/Eastern EU significantly lower. Minimum wages vary: Germany €12.82/hr, France €11.65/hr, Netherlands €13.27/hr.",
        confidence: "confirmed",
        source: "Eurostat Labour Cost Index",
        source_url: "https://ec.europa.eu/eurostat/web/labour-market/labour-costs",
        last_updated: "2024",
        update_frequency: "Quarterly",
      },
      ev_charging: {
        status: "AFIR mandates minimum infrastructure",
        details: "EU Alternative Fuels Infrastructure Regulation requires charging every 60km on TEN-T core network by 2025. Member state implementation varies significantly.",
        confidence: "confirmed",
        source: "European Alternative Fuels Observatory",
        source_url: "https://alternative-fuels-observatory.ec.europa.eu/",
        last_updated: "2024",
        update_frequency: "Quarterly deployment statistics",
      },
      green_building: {
        status: "BREEAM / DGNB / HQE (varies by country)",
        details: "BREEAM dominant in NL/BE, DGNB in Germany, HQE in France. EPBD recast driving mandatory minimum energy performance standards across all member states.",
        confidence: "confirmed",
        source: "European Commission EPBD",
        source_url: "https://energy.ec.europa.eu/topics/energy-efficiency/energy-efficient-buildings_en",
        last_updated: "2024",
        update_frequency: "Ad hoc (directive transposition deadlines)",
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
        details: "Inflation Reduction Act provides 30% Investment Tax Credit for commercial solar. State incentives are additive. Net metering rules vary by state and utility — check state PUC for specific terms.",
        confidence: "confirmed",
        source: "US DOE / IRS",
        source_url: "https://www.energy.gov/eere/solar/federal-solar-tax-credits-businesses",
        last_updated: "2024",
        update_frequency: "Annual IRS guidance updates",
      },
      electricity: {
        status: "$0.08-0.20/kWh (varies by state)",
        details: "California highest (~$0.20/kWh). Texas/Southeast lowest (~$0.08/kWh). Industrial rates lower than commercial. Rates published by EIA Form 861.",
        confidence: "confirmed",
        source: "US EIA Electric Power Monthly",
        source_url: "https://www.eia.gov/electricity/monthly/",
        last_updated: "Monthly",
        update_frequency: "Monthly (state-level data)",
      },
      labor: {
        status: "$35,000-55,000/year (warehouse/logistics)",
        details: "California/NY significantly higher. Federal minimum $7.25/hr but most states have higher minimums. Prevailing wage requirements apply to IRA-funded projects.",
        confidence: "confirmed",
        source: "US Bureau of Labor Statistics",
        source_url: "https://www.bls.gov/oes/current/oes_nat.htm",
        last_updated: "May 2024 (annual release)",
        update_frequency: "Annual (May survey, November release)",
      },
      ev_charging: {
        status: "CARB mandates; federal NEVI program",
        details: "California CARB Advanced Clean Trucks mandate effective. Federal NEVI program deploying $7.5B for national EV charging network. 12+ states follow CARB via Section 177 waiver.",
        confidence: "confirmed",
        source: "US DOT FHWA / CARB",
        source_url: "https://www.fhwa.dot.gov/environment/alternative_fuel_corridors/",
        last_updated: "2024",
        update_frequency: "Quarterly deployment updates",
      },
      green_building: {
        status: "LEED",
        details: "LEED is dominant US standard with 100,000+ certified projects. NYC Local Law 97 mandates emissions limits for buildings >25,000 sqft. California Title 24 is a de facto performance standard.",
        confidence: "confirmed",
        source: "USGBC",
        source_url: "https://www.usgbc.org/projects",
        last_updated: "2024",
        update_frequency: "Continuous project database updates",
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
        details: "EMA allows solar leasing models. HDB and JTC rooftops increasingly utilized. Space constraints drive efficiency focus. SolarNova programme aggregates government rooftop demand.",
        confidence: "confirmed",
        source: "Energy Market Authority (EMA)",
        source_url: "https://www.ema.gov.sg/our-energy-story/energy-supply/solar",
        last_updated: "2024",
        update_frequency: "Annual capacity reports",
      },
      electricity: {
        status: "S$0.25-0.30/kWh commercial",
        details: "Open electricity market since 2019. Carbon tax S$25/tCO2e (2024), legislated to rise to S$50-80 by 2030. Published quarterly by SP Group.",
        confidence: "confirmed",
        source: "SP Group / EMA",
        source_url: "https://www.spgroup.com.sg/our-services/utilities/tariff-information",
        last_updated: "Q4 2024",
        update_frequency: "Quarterly tariff review",
      },
      labor: {
        status: "S$2,500-4,000/month (logistics roles)",
        details: "Foreign worker levy applies at S$300-950/month depending on tier. Progressive Wage Model covers cleaning, security, and some logistics roles.",
        confidence: "confirmed",
        source: "Singapore MOM",
        source_url: "https://www.mom.gov.sg/employment-practices/salary",
        last_updated: "2024",
        update_frequency: "Annual wage surveys",
      },
      ev_charging: {
        status: "60,000 charging points target by 2030",
        details: "Singapore Green Plan 2030 target. LTA and URA rolling out charging infrastructure. EV Early Adoption Incentive provides 45% rebate on ARF.",
        confidence: "confirmed",
        source: "Land Transport Authority",
        source_url: "https://www.lta.gov.sg/content/ltagov/en/industry_innovations/technologies/electric_vehicles.html",
        last_updated: "2024",
        update_frequency: "Quarterly deployment updates",
      },
      green_building: {
        status: "BCA Green Mark (mandatory >5,000 sqm)",
        details: "Mandatory for new buildings above 5,000 sqm. Singapore leads ASEAN in green building certification. Super Low Energy programme for best-in-class buildings.",
        confidence: "confirmed",
        source: "Building and Construction Authority",
        source_url: "https://www1.bca.gov.sg/buildsg/sustainability/green-mark-certification-scheme",
        last_updated: "2024",
        update_frequency: "Ad hoc standard updates",
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
        details: "CLP and HK Electric offer feed-in tariffs for renewable energy at HK$3-5/kWh depending on system size. Limited rooftop space in commercial districts.",
        confidence: "confirmed",
        source: "CLP / HK Electric",
        source_url: "https://www.clpgroup.com/en/sustainability/feed-in-tariff",
        last_updated: "2024",
        update_frequency: "Annual tariff review",
      },
      electricity: {
        status: "HK$1.0-1.3/kWh commercial",
        details: "Two utilities: CLP (Kowloon, NT) and HK Electric (HK Island). Tariff includes fuel cost adjustment clause that fluctuates quarterly.",
        confidence: "confirmed",
        source: "CLP / HK Electric published tariffs",
        source_url: "https://www.clp.com.hk/en/customer-service/tariff",
        last_updated: "2024",
        update_frequency: "Annual (with quarterly fuel clause adjustments)",
      },
      labor: {
        status: "HK$15,000-25,000/month (logistics roles)",
        details: "Statutory minimum wage HK$40/hr (May 2023). Labor market tight in logistics sector. Warehouse operatives typically HK$16,000-20,000/month.",
        confidence: "confirmed",
        source: "HK Census and Statistics Department",
        source_url: "https://www.censtatd.gov.hk/en/scode200.html",
        last_updated: "2024",
        update_frequency: "Annual earnings survey",
      },
      ev_charging: {
        status: "EV First Registration Tax waiver extended",
        details: "Government extending EV incentives through 2026. Charging infrastructure in public car parks expanding. EV roadmap targets 150,000+ private chargers by 2027.",
        confidence: "confirmed",
        source: "HK Environment and Ecology Bureau",
        source_url: "https://www.eeb.gov.hk/en/ev.htm",
        last_updated: "2024",
        update_frequency: "Annual policy review",
      },
      green_building: {
        status: "BEAM Plus",
        details: "Hong Kong Green Building Council BEAM Plus certification. Voluntary but increasingly adopted by major landlords and new developments.",
        confidence: "confirmed",
        source: "HK Green Building Council",
        source_url: "https://www.hkgbc.org.hk/eng/beam-plus/",
        last_updated: "2024",
        update_frequency: "Ad hoc standard updates",
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
            <DataCell icon={Sun} label="Solar" dataPoint={profile.data.solar} />
            <DataCell icon={Zap} label="Electricity" dataPoint={profile.data.electricity} />
            <DataCell icon={Users} label="Labor" dataPoint={profile.data.labor} />
            <DataCell icon={Zap} label="EV Charging" dataPoint={profile.data.ev_charging} />
            <DataCell icon={Building} label="Green Building" dataPoint={profile.data.green_building} />
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
  dataPoint,
}: {
  icon: typeof Sun;
  label: string;
  dataPoint: DataPoint;
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
        {dataPoint.confidence === "unconfirmed" && (
          <HelpCircle size={10} style={{ color: "var(--color-warning)" }} />
        )}
      </div>
      <p className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
        {dataPoint.status}
      </p>
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="text-[11px] mt-1 cursor-pointer"
        style={{ color: "var(--color-primary)" }}
      >
        {showDetails ? "Less" : "More"}
      </button>
      {showDetails && (
        <div className="mt-1.5 space-y-1.5">
          <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
            {dataPoint.details}
          </p>
          <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            <a
              href={dataPoint.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline flex items-center gap-1"
              style={{ color: "var(--color-primary)" }}
            >
              <ExternalLink size={8} />
              {dataPoint.source}
            </a>
            <span>Updated: {dataPoint.last_updated}</span>
          </div>
          <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            Refresh: {dataPoint.update_frequency}
          </div>
        </div>
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

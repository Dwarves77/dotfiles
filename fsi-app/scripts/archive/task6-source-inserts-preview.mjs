/**
 * _task6-source-inserts-preview.mjs
 *
 * READ-ONLY check of which Task 6 sources already exist in the registry,
 * plus the SQL INSERT preview. No INSERT issued. Outputs to stdout for
 * the doc generator.
 *
 * Per dispatch v2 Task 6: register 11 immediate + 2 deferred sources with
 * the 5-axis classification. Default auto_run_enabled=FALSE regardless of
 * Task 5 status.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FSI_APP_ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(FSI_APP_ROOT, ".env.local"));

const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const candidates = [
  { name: "European Commission DG FISMA (finance)", url: "https://finance.ec.europa.eu/", role: "primary_legal_authority", tier: 1, jurisdictions: ["eu"], topics: ["regulatory","finance","environmental","social","governance"], modes: ["none"], verticals: ["all"], expected: { Regulatory: 0.5, Research: 0.4, Market_Intel: 0.05, Operations: 0, Out_of_Scope: 0.05 } },
  { name: "European Securities and Markets Authority (ESMA)", url: "https://www.esma.europa.eu/", role: "primary_legal_authority", tier: 1, jurisdictions: ["eu"], topics: ["regulatory","finance","governance"], modes: ["none"], verticals: ["all"], expected: { Regulatory: 0.6, Research: 0.25, Market_Intel: 0.05, Operations: 0.05, Out_of_Scope: 0.05 } },
  { name: "European Banking Authority (EBA)", url: "https://www.eba.europa.eu/", role: "primary_legal_authority", tier: 1, jurisdictions: ["eu"], topics: ["regulatory","finance","governance"], modes: ["none"], verticals: ["all"], expected: { Regulatory: 0.6, Research: 0.25, Market_Intel: 0.05, Operations: 0.05, Out_of_Scope: 0.05 } },
  { name: "UK Financial Conduct Authority (FCA)", url: "https://www.fca.org.uk/", role: "primary_legal_authority", tier: 1, jurisdictions: ["uk"], topics: ["regulatory","finance","governance"], modes: ["none"], verticals: ["all"], expected: { Regulatory: 0.55, Research: 0.3, Market_Intel: 0.05, Operations: 0.05, Out_of_Scope: 0.05 } },
  { name: "US Securities and Exchange Commission (SEC)", url: "https://www.sec.gov/", role: "primary_legal_authority", tier: 1, jurisdictions: ["us-federal"], topics: ["regulatory","finance","governance"], modes: ["none"], verticals: ["all"], expected: { Regulatory: 0.55, Research: 0.3, Market_Intel: 0.05, Operations: 0.05, Out_of_Scope: 0.05 } },
  { name: "Carbon Pulse", url: "https://carbon-pulse.com/", role: "trade_press", tier: 5, jurisdictions: ["global"], topics: ["regulatory","finance","environmental"], modes: ["none"], verticals: ["all"], expected: { Regulatory: 0.25, Research: 0.05, Market_Intel: 0.6, Operations: 0, Out_of_Scope: 0.1 } },
  { name: "Gallery Climate Coalition (about + resources)", url: "https://galleryclimatecoalition.org/about/", role: "industry_association", tier: 5, jurisdictions: ["global"], topics: ["environmental","regulatory","finance"], modes: ["none"], verticals: ["fine_art"], expected: { Regulatory: 0.05, Research: 0.2, Market_Intel: 0.55, Operations: 0.15, Out_of_Scope: 0.05 } },
  { name: "Gallery Climate Coalition (research)", url: "https://galleryclimatecoalition.org/research/", role: "academic_research", tier: 3, jurisdictions: ["global"], topics: ["environmental","materials_science","conservation"], modes: ["none"], verticals: ["fine_art"], expected: { Regulatory: 0, Research: 0.85, Market_Intel: 0.1, Operations: 0, Out_of_Scope: 0.05 } },
  { name: "American Alliance of Museums (AAM)", url: "https://www.aam-us.org/", role: "industry_association", tier: 5, jurisdictions: ["us-federal"], topics: ["environmental","conservation"], modes: ["none"], verticals: ["fine_art"], expected: { Regulatory: 0, Research: 0.3, Market_Intel: 0.5, Operations: 0.15, Out_of_Scope: 0.05 } },
  { name: "ICOM Committee for Conservation (ICOM-CC)", url: "https://www.icom-cc.org/", role: "industry_association", tier: 5, jurisdictions: ["global"], topics: ["conservation","materials_science","environmental"], modes: ["none"], verticals: ["fine_art"], expected: { Regulatory: 0, Research: 0.6, Market_Intel: 0.3, Operations: 0.05, Out_of_Scope: 0.05 } },
  { name: "International Institute for Conservation (IIC)", url: "https://www.iiconservation.org/", role: "industry_association", tier: 5, jurisdictions: ["global"], topics: ["conservation","materials_science"], modes: ["none"], verticals: ["fine_art"], expected: { Regulatory: 0, Research: 0.7, Market_Intel: 0.2, Operations: 0.05, Out_of_Scope: 0.05 } },
];

const deferred = [
  { name: "Bizot Group climate strategy", reason: "no canonical fetch URL; output via member museum sites" },
  { name: "Kim Kraczon body of work", reason: "publication via H&W and conservation journal channels; could resolve to GCC research as already-registered if her work publishes there" },
];

function hostOf(u) { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } }

console.log("=== Existence check against current sources ===");
for (const cand of candidates) {
  const host = hostOf(cand.url);
  const { data: matches } = await c.from("sources").select("id, name, url, status, auto_run_enabled").or(`url.ilike.%${host}%,name.ilike.%${cand.name.split(" ")[0]}%`).limit(5);
  const sameHost = (matches || []).filter(m => { try { return new URL(m.url).host.replace(/^www\./, "") === host; } catch { return false; } });
  if (sameHost.length > 0) console.log("  ALREADY PRESENT:", cand.name, "→", sameHost.map(m => `${m.id} ${m.url} (status=${m.status}, auto=${m.auto_run_enabled})`).join("; "));
  else console.log("  NEW:", cand.name, "→", cand.url);
}
console.log("");
console.log("=== Deferred (access-method triage required) ===");
for (const d of deferred) console.log("  DEFER:", d.name, "—", d.reason);

console.log("");
console.log("=== SQL INSERT preview (DO NOT RUN; requires migration 063 applied first) ===");
console.log("BEGIN;");
for (const cand of candidates) {
  console.log(`INSERT INTO sources (
  name, url, status, admin_only, auto_run_enabled,
  source_role, tier, tier_at_creation, jurisdictions,
  scope_topics, scope_modes, scope_verticals,
  expected_output, classification_assigned_at,
  access_method
) VALUES (
  ${escSql(cand.name)},
  ${escSql(cand.url)},
  'active',
  false,
  false,    -- parked per dispatch v2 default
  ${escSql(cand.role)},
  ${cand.tier},
  ${cand.tier},
  ARRAY[${cand.jurisdictions.map(escSql).join(", ")}]::text[],
  ARRAY[${cand.topics.map(escSql).join(", ")}]::text[],
  ARRAY[${cand.modes.map(escSql).join(", ")}]::text[],
  ARRAY[${cand.verticals.map(escSql).join(", ")}]::text[],
  '${JSON.stringify(cand.expected)}'::jsonb,
  now(),
  'scrape'
);`);
  console.log("");
}
console.log("-- Expected: INSERT 11 (or fewer if any URL already exists; ON CONFLICT DO NOTHING).");
console.log("-- COMMIT or ROLLBACK.");

function escSql(s) { return `'${String(s).replace(/'/g, "''")}'`; }

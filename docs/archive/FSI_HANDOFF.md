# Freight Sustainability Intelligence (FSI) — Complete Build Specification

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Business Context](#2-business-context)
3. [System Architecture](#3-system-architecture)
4. [Database Schema (Supabase)](#4-database-schema)
5. [Backend API (Railway)](#5-backend-api)
6. [Automated Pipeline Worker](#6-automated-pipeline-worker)
7. [Claude API Prompts](#7-claude-api-prompts)
8. [Frontend (Vercel + React)](#8-frontend)
9. [Skill File Regeneration](#9-skill-file-regeneration)
10. [Data Seed](#10-data-seed)
11. [Deployment Guide](#11-deployment-guide)
12. [Update Workflow](#12-update-workflow)

---

## 1. Project Overview

FSI is a regulatory intelligence dashboard for a freight forwarding company specializing in high-value, specialized cargo. It tracks ESG regulations, environmental policies, and sustainability standards that affect international freight operations across air, road, and ocean transport.

### What exists today
- A React component (`freight_sustainability_dashboard.jsx`, 1697 lines) that renders as a Claude artifact
- A Claude skill file at `/mnt/skills/user/environmental-policy-and-innovation/SKILL.md` with source registry and prompt templates
- 119 verified regulatory resources with metadata, scoring, timelines, disputes, cross-references, and changelogs
- Export system generating downloadable HTML reports and Slack-format text files
- Weekly briefing with client talking points, priority overrides, disputed items

### What needs to be built
- Supabase database to persist all resource data
- Railway backend API serving the frontend and running the automated pipeline
- Vercel-hosted React frontend (migrate from artifact)
- Weekly cron worker that calls Claude API to search regulatory sources, diff against database, and stage updates
- Admin panel for reviewing/approving staged updates
- Automated skill file regeneration

---

## 2. Business Context

### Company Profile
- **Industry:** International freight forwarding
- **Cargo verticals:** Live events, artwork, luxury goods, film & TV production, high-value automotive (classic cars, supercars, prototypes), humanitarian shipments
- **Transport mode priority:** Air freight (primary) → Trucking/road (secondary) → Ocean (tertiary) → Rail (rarely used)
- **Trade lanes:** Americas, Europe, Asia — English-first with selective non-English source coverage

### Why This Matters
Every regulation tracked in this system directly affects one or more of:
- **Freight pricing** — ETS surcharges, SAF mandates, carbon taxes passed through by carriers
- **Compliance obligations** — reporting deadlines, documentation requirements, customs procedures
- **Client relationships** — tender requirements, Scope 3 data requests, sustainability claims
- **Operational routing** — emission zones, vehicle mandates, packaging restrictions, port requirements

### User Roles
1. **Jason (admin)** — Reviews staged updates, approves/rejects, manages priorities, generates skill files
2. **Team members (read-only)** — View dashboard, download reports, use briefings for client conversations
3. **Automated worker** — Runs weekly, stages proposed updates, never writes directly to production data

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VERCEL (Frontend)                          │
│  React dashboard — reads from Supabase via API               │
│  Admin panel — approve/reject staged updates                 │
│  Export system — downloadable HTML + Slack text               │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST / Supabase client
┌──────────────────────▼──────────────────────────────────────┐
│                   SUPABASE (Database)                         │
│  resources, changelog, disputes, sources, staged_updates,    │
│  briefings, archive, cross_references, supersessions         │
│  Row Level Security: admin = write, team = read              │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  RAILWAY (Backend + Worker)                   │
│                                                              │
│  ┌─────────────┐  ┌──────────────────────────────────┐      │
│  │  REST API    │  │  Weekly Cron Worker               │      │
│  │  /api/...    │  │  1. Read source registry          │      │
│  │              │  │  2. Call Claude API w/ web search  │      │
│  │              │  │  3. Diff against Supabase          │      │
│  │              │  │  4. Write to staged_updates        │      │
│  │              │  │  5. Notify via Slack/email         │      │
│  └─────────────┘  └──────────────────────────────────┘      │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │  Skill File Generator                             │       │
│  │  Reads approved resources → generates SKILL.md    │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
                       │
            Claude API (Sonnet 4)
            + web_search tool
```

### Tech Stack
| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | React + Vite on Vercel | Dashboard UI, admin panel, exports |
| Database | Supabase (PostgreSQL) | Persistent data, auth, RLS |
| Backend | Node.js on Railway | API routes, cron worker, skill generator |
| AI | Claude API (Sonnet) + web_search | Weekly intelligence sweep |
| Auth | Supabase Auth | Admin vs read-only team roles |
| Notifications | Slack webhook or email | Alert when updates are staged |

---

## 4. Database Schema

### `resources` (primary table)
```sql
CREATE TABLE resources (
  id TEXT PRIMARY KEY,                    -- e.g., "o1", "t1", "a3"
  category TEXT NOT NULL,                 -- ocean, air, land, trade, compliance, global, research
  subcategory TEXT,                       -- "IMO Regulations", "Fuels & Technology", etc.
  title TEXT NOT NULL,
  url TEXT,                               -- primary source URL
  note TEXT,                              -- one-line summary
  type TEXT NOT NULL,                     -- regulation, framework, standard, tool, data, initiative, industry, certification, news, academic
  priority TEXT NOT NULL DEFAULT 'MODERATE', -- CRITICAL, HIGH, MODERATE, LOW
  reasoning TEXT,                         -- why this priority was assigned
  tags TEXT[],                            -- keyword array for search/scoring
  what_is_it TEXT,                        -- full paragraph: what this regulation/resource is
  why_matters TEXT,                       -- full paragraph: why it matters for freight operations
  key_data TEXT[],                        -- bullet-point array of key facts/numbers
  modes TEXT[] NOT NULL,                  -- ["air"], ["road"], ["ocean"], or combinations
  topic TEXT NOT NULL,                    -- emissions, fuels, transport, reporting, packaging, corridors, research
  jurisdiction TEXT NOT NULL,             -- eu, us, uk, latam, asia, hk, meaf, global
  added_date DATE NOT NULL DEFAULT CURRENT_DATE,
  modified_date DATE,
  is_archived BOOLEAN DEFAULT FALSE,
  archived_date DATE,
  archive_reason TEXT,                    -- Superseded, Expired, Repealed, Consolidated, Manual
  archive_note TEXT,
  archive_replacement TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `timelines` (milestone events per resource)
```sql
CREATE TABLE timelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
  milestone_date DATE NOT NULL,
  label TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_timelines_resource ON timelines(resource_id);
```

### `changelog` (what changed and when)
```sql
CREATE TABLE changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
  change_date DATE NOT NULL DEFAULT CURRENT_DATE,
  field TEXT NOT NULL,                    -- "Timeline", "Scope", "Priority", "Status", etc.
  previous_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  impact TEXT,                            -- "HIGH — registration is now the immediate action"
  impact_level TEXT DEFAULT 'MODERATE',   -- CRITICAL, HIGH, MODERATE, LOW
  source TEXT,                            -- where the change was detected
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_changelog_resource ON changelog(resource_id);
```

### `disputes` (conflicting information)
```sql
CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  note TEXT NOT NULL,                     -- what's disputed and why
  sources TEXT[],                         -- ["EU Commission", "WTO", "India/China trade ministries"]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_disputes_resource ON disputes(resource_id);
```

### `cross_references` (links between resources)
```sql
CREATE TABLE cross_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
  target_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
  relationship TEXT DEFAULT 'related',    -- related, supersedes, implements, conflicts
  UNIQUE(source_id, target_id)
);
```

### `supersessions` (regulation replacements)
```sql
CREATE TABLE supersessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_title TEXT NOT NULL,
  old_url TEXT,
  new_title TEXT NOT NULL,
  new_resource_id TEXT REFERENCES resources(id),
  severity TEXT NOT NULL,
  supersession_date DATE NOT NULL,
  description TEXT NOT NULL,             -- what changed and why
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `source_registry` (URLs the worker checks weekly)
```sql
CREATE TABLE source_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                     -- "IMO MEPC", "EUR-Lex OJ", "EPA Regulations"
  url TEXT NOT NULL,
  region TEXT,                            -- EU, US, UK, Global, Asia, LatAm
  type TEXT,                              -- api, rss, gazette, regulator_page, industry
  check_frequency TEXT DEFAULT 'weekly',  -- daily, weekly, monthly
  last_checked TIMESTAMPTZ,
  last_change_detected TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `staged_updates` (worker proposals awaiting approval)
```sql
CREATE TABLE staged_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,                   -- create, update, archive, dispute, new_source
  resource_id TEXT,                       -- null for new resources
  proposed_data JSONB NOT NULL,           -- full resource object or diff
  reason TEXT NOT NULL,                   -- why the worker is proposing this
  source_url TEXT,                        -- where the worker found the info
  confidence TEXT DEFAULT 'MEDIUM',       -- HIGH, MEDIUM, LOW
  status TEXT DEFAULT 'pending',          -- pending, approved, rejected
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  batch_id TEXT                           -- groups updates from same worker run
);
CREATE INDEX idx_staged_status ON staged_updates(status);
```

### `briefings` (generated weekly briefings)
```sql
CREATE TABLE briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_date DATE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,                           -- executive summary paragraph
  talking_points JSONB,                   -- array of {title, text, resource_id, published_date}
  new_resources TEXT[],                   -- resource IDs added this week
  modified_resources TEXT[],              -- resource IDs changed this week
  html_content TEXT,                      -- pre-rendered HTML for export
  slack_content TEXT,                     -- pre-rendered Slack markdown
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `users` (Supabase Auth integration)
```sql
-- Use Supabase Auth. Add a profiles table:
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'viewer',    -- admin, viewer
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read resources" ON resources FOR SELECT USING (true);
CREATE POLICY "Admins can modify resources" ON resources FOR ALL USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
);
-- Repeat pattern for all tables
```

---

## 5. Backend API (Railway)

### Routes

```
GET    /api/resources                    — list all active resources (with filters)
GET    /api/resources/:id                — single resource with timeline, disputes, changelog, xrefs
POST   /api/resources                    — create resource (admin)
PATCH  /api/resources/:id                — update resource (admin)
POST   /api/resources/:id/archive        — archive resource (admin)
POST   /api/resources/:id/restore        — restore from archive (admin)

GET    /api/changelog                    — recent changes across all resources
GET    /api/changelog/:resource_id       — changes for specific resource

GET    /api/disputes                     — all active disputes
POST   /api/disputes                     — create dispute (admin)
PATCH  /api/disputes/:id                 — resolve dispute (admin)

GET    /api/staged                       — pending staged updates
POST   /api/staged/:id/approve           — approve staged update → writes to resources
POST   /api/staged/:id/reject            — reject staged update

GET    /api/briefings                    — list briefings
GET    /api/briefings/latest             — most recent briefing
GET    /api/briefings/:id/export/:format — export briefing as html or slack

GET    /api/sources                      — source registry
POST   /api/sources                      — add source (admin)

POST   /api/worker/run                   — manually trigger worker (admin, API key protected)

GET    /api/skill/generate               — generate current SKILL.md file for download
```

### Scoring Functions (port from frontend)

These must be server-side so the worker can score proposed resources:

```javascript
// Impact scoring — 0-3 per dimension
function scoreResource(resource) {
  const pri = {CRITICAL:3, HIGH:2, MODERATE:1, LOW:0}[resource.priority] || 1;
  const tags = (resource.tags || []).join(" ").toLowerCase();
  const isReg = ["regulation","standard","legal","rule","certification"].includes(resource.type);

  let cost = 0;
  if (tags.match(/ets|surcharge|penalty|fuel cost|carbon tax|carbon border|cbam|saf|pricing/)) cost = 3;
  else if (tags.match(/carbon|cost|fee|allowance|pricing|finance/)) cost = 2;
  else if (pri >= 2 && (resource.category === "ocean" || resource.category === "air")) cost = 1;

  let compliance = 0;
  if (isReg && pri >= 2) compliance = 3;
  else if (isReg) compliance = 2;
  else if (resource.type === "standard" || resource.type === "certification") compliance = 2;
  else if (tags.match(/mandatory|reporting|regulation|directive|mandate/)) compliance = 2;

  let client = 0;
  if (tags.match(/scope 3|cdp|ecovadis|reporting|disclosure|rfq|rfp|tender|csrd|issb|glec|iso 14083/)) client = 3;
  else if (resource.category === "compliance") client = 2;
  else if (tags.match(/rating|target|sbti|ghg protocol|data request/)) client = 2;
  else if (pri >= 2 && isReg) client = 1;

  let operational = 0;
  if (tags.match(/drayage|port|routing|packaging|customs|carb|zev|fleet|infrastructure|dwell/)) operational = 3;
  else if (tags.match(/truck|vessel|corridor|bunkering|charging|shore power/)) operational = 2;
  else if (isReg) operational = 1;

  return {
    cost: Math.min(cost, 3),
    compliance: Math.min(compliance, 3),
    client: Math.min(client, 3),
    operational: Math.min(operational, 3)
  };
}

// Urgency scoring — composite weighted score
function urgencyScore(resource, timelines) {
  const sc = scoreResource(resource);
  const total = sc.cost + sc.compliance + sc.client + sc.operational;
  const priW = {CRITICAL:4, HIGH:3, MODERATE:2, LOW:1}[resource.priority] || 1;

  const jurWeights = {eu:3, us:2, uk:2, global:3, asia:1, latam:1};
  const jurW = (jurWeights[resource.jurisdiction] || 1) / 3;

  let timeW = 1;
  if (timelines?.length) {
    const now = new Date();
    const future = timelines
      .map(m => new Date(m.milestone_date))
      .filter(d => d > now)
      .sort((a, b) => a - b);
    if (future.length) {
      const days = Math.max(1, Math.floor((future[0] - now) / 86400000));
      timeW = Math.min(5, 365 / days);
    }
  }

  return Math.round((total * priW * timeW * (0.5 + jurW * 0.5)) * 10) / 10;
}
```

---

## 6. Automated Pipeline Worker

### Cron Schedule
Run every Monday at 06:00 UTC via Railway cron or node-cron.

### Worker Flow

```javascript
async function runWeeklyUpdate() {
  const batchId = `batch_${Date.now()}`;
  const sources = await supabase.from('source_registry').select('*').eq('is_active', true);
  const existingResources = await supabase.from('resources').select('*').eq('is_archived', false);

  // 1. Build context for Claude
  const resourceSummary = existingResources.data.map(r =>
    `[${r.id}] ${r.title} | Priority: ${r.priority} | Last modified: ${r.modified_date || r.added_date} | URL: ${r.url}`
  ).join('\n');

  const sourceList = sources.data.map(s =>
    `${s.name}: ${s.url} (${s.region}, last checked: ${s.last_checked || 'never'})`
  ).join('\n');

  // 2. Call Claude API with web search enabled
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    system: WORKER_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: buildWorkerUserPrompt(resourceSummary, sourceList)
    }]
  });

  // 3. Parse Claude's structured response
  const updates = parseClaudeResponse(response);

  // 4. Write staged updates
  for (const update of updates) {
    await supabase.from('staged_updates').insert({
      action: update.action,
      resource_id: update.resource_id,
      proposed_data: update.data,
      reason: update.reason,
      source_url: update.source_url,
      confidence: update.confidence,
      batch_id: batchId
    });
  }

  // 5. Update source registry last_checked timestamps
  for (const source of sources.data) {
    await supabase.from('source_registry')
      .update({ last_checked: new Date().toISOString() })
      .eq('id', source.id);
  }

  // 6. Notify admin
  await sendNotification({
    text: `🌍 FSI Weekly Update: ${updates.length} proposed changes staged for review.`,
    batch_id: batchId
  });

  return { batch_id: batchId, updates_count: updates.length };
}
```

### Approval Flow

```javascript
async function approveUpdate(stagedId, adminId) {
  const { data: staged } = await supabase
    .from('staged_updates')
    .select('*')
    .eq('id', stagedId)
    .single();

  if (staged.action === 'create') {
    // Insert new resource
    await supabase.from('resources').insert(staged.proposed_data);
    // Insert timelines if present
    if (staged.proposed_data.timelines) {
      for (const t of staged.proposed_data.timelines) {
        await supabase.from('timelines').insert({
          resource_id: staged.proposed_data.id,
          milestone_date: t.date,
          label: t.label
        });
      }
    }
  } else if (staged.action === 'update') {
    // Record changelog
    for (const change of staged.proposed_data.changes || []) {
      await supabase.from('changelog').insert({
        resource_id: staged.resource_id,
        field: change.field,
        previous_value: change.prev,
        new_value: change.now,
        impact: change.impact,
        source: staged.source_url
      });
    }
    // Apply update
    await supabase.from('resources')
      .update(staged.proposed_data.resource_updates)
      .eq('id', staged.resource_id);
  } else if (staged.action === 'archive') {
    await supabase.from('resources')
      .update({
        is_archived: true,
        archived_date: new Date().toISOString(),
        archive_reason: staged.proposed_data.reason,
        archive_note: staged.proposed_data.note
      })
      .eq('id', staged.resource_id);
  } else if (staged.action === 'new_source') {
    await supabase.from('source_registry').insert(staged.proposed_data);
  } else if (staged.action === 'dispute') {
    await supabase.from('disputes').insert({
      resource_id: staged.resource_id,
      note: staged.proposed_data.note,
      sources: staged.proposed_data.sources
    });
  }

  // Mark as approved
  await supabase.from('staged_updates')
    .update({ status: 'approved', reviewed_by: adminId, reviewed_at: new Date().toISOString() })
    .eq('id', stagedId);
}
```

---

## 7. Claude API Prompts

### Worker System Prompt

```
You are the Freight Sustainability Intelligence Worker for a global freight forwarding company specializing in: live events, artwork, luxury goods, film & TV production, high-value automotive (classic cars, supercars, prototypes), and humanitarian cargo.

Transport mode priority: Air freight (primary), trucking/road (secondary), ocean (tertiary), rail (rarely used).

Your job is to search regulatory sources, identify what has changed since the last check, and produce structured update proposals.

RULES:
1. Ground every claim in a specific source URL. Never speculate.
2. Distinguish: (a) binding law/regulation, (b) regulator guidance, (c) political announcement, (d) analysis/opinion.
3. For each change detected, specify: what changed, previous state, new state, impact level (CRITICAL/HIGH/MODERATE/LOW), and affected transport modes.
4. If you discover a NEW credible primary source not in the existing registry, flag it as action: "new_source".
5. If sources conflict, flag as action: "dispute" with all conflicting source URLs.
6. Prioritize changes that affect the cargo verticals listed above.
7. Assign impact scores for each dimension: cost (0-3), compliance (0-3), client (0-3), operational (0-3).

OUTPUT FORMAT — respond ONLY with a JSON array:
[
  {
    "action": "update|create|archive|dispute|new_source",
    "resource_id": "o1 or null for new",
    "data": {
      // For updates: { changes: [{field, prev, now, impact}], resource_updates: {modified_date, priority, note, ...} }
      // For creates: full resource object matching schema
      // For archives: { reason, note }
      // For disputes: { note, sources: [] }
      // For new_source: { name, url, region, type, notes }
    },
    "reason": "why this change matters",
    "source_url": "primary URL where change was found",
    "confidence": "HIGH|MEDIUM|LOW"
  }
]
```

### Worker User Prompt Template

```
Run the weekly regulatory intelligence sweep for {date}.

EXISTING RESOURCES ({count} tracked):
{resource_summary}

SOURCE REGISTRY ({source_count} sources):
{source_list}

LAST UPDATE: {last_update_date}

INSTRUCTIONS:
1. Search each source category for changes since {last_update_date}.
2. For existing resources: check if timelines have shifted, priorities changed, new milestones emerged, or status updated.
3. For the regulatory landscape: identify any NEW regulations, frameworks, or industry standards not yet tracked.
4. Specifically check:
   - IMO: MEPC sessions, Net-Zero Framework status, CII updates, MARPOL amendments
   - EU: CBAM implementation, FuelEU Maritime, ReFuelEU SAF, EUDR, PPWR, CSRD Omnibus, EU ETS shipping, ICS2
   - US: EPA vehicle GHG rules, CARB mandates, DOT freight initiatives, SmartWay
   - ICAO: CORSIA updates, SAF mandates
   - Global: ISO 14083, GLEC Framework, GHG Protocol, SBTi transport, ISSB/IFRS S2
5. Flag any source conflicts or disputed information.
6. If you find a credible new source (regulator portal, industry body, research institute) not in the registry, propose it.

Respond ONLY with the JSON array. No preamble, no markdown fences.
```

### Briefing Generation Prompt

```
Generate a weekly sustainability briefing for freight forwarding leadership.

CONTEXT:
- Company specializes in: live events, artwork, luxury goods, film & TV production, high-value automotive, humanitarian cargo
- Transport priority: air → road → ocean
- Date: {date}

RECENT CHANGES:
{new_resources_json}
{modified_resources_json}

TOP URGENCY:
{top_urgency_json}

UPCOMING DEADLINES (90 days):
{upcoming_deadlines_json}

ACTIVE DISPUTES:
{disputes_json}

INSTRUCTIONS:
1. Write an executive summary paragraph (100-150 words) synthesizing the most important developments this week.
2. Generate 3-5 client talking points, each with:
   - title: short headline
   - text: 3-5 sentence paragraph explaining what happened, what it means for the cargo verticals, and what action to take
   - resource_id: linked resource
   - published_date: when the source was published
   - source: citation
   - url: source link
3. Organize by transport mode priority (air first, then road, then ocean, then cross-modal).

Respond ONLY with JSON:
{
  "summary": "executive summary paragraph",
  "talking_points": [
    { "title": "", "text": "", "resource_id": "", "published_date": "", "source": "", "url": "" }
  ]
}
```

### Skill File Generation Prompt

```
Generate an updated SKILL.md file for the Freight Sustainability Intelligence skill.

CURRENT RESOURCES ({count}):
{resources_json}

SOURCE REGISTRY ({source_count}):
{sources_json}

ACTIVE DISPUTES:
{disputes_json}

RECENT CHANGES:
{changelog_json}

The skill file should contain:
1. YAML frontmatter with name and description
2. Changelog section showing the last 5 update dates and what changed
3. Current regulatory landscape summary (500 words max) organized by transport mode
4. Source registry with all active sources, URLs, and regions
5. Impact scoring methodology
6. Prompt templates for: daily briefing, regulatory alert, deep dive analysis
7. Cargo vertical context (live events, artwork, luxury goods, film/TV, automotive, humanitarian)
8. Transport mode priority (air → road → ocean)

Output the complete SKILL.md file content. No explanation, just the file.
```

---

## 8. Frontend (Vercel + React)

### Component Structure

Migrate the existing 1697-line artifact component into a proper React app:

```
src/
├── App.jsx                    — routing, auth wrapper
├── components/
│   ├── Dashboard.jsx          — main layout, tab navigation
│   ├── HomeTab.jsx            — weekly briefing, what changed, urgency, due soon
│   ├── ExploreTab.jsx         — filterable resource list with expand/collapse
│   ├── SettingsTab.jsx        — preferences, archive viewer, admin controls
│   ├── FocusView.jsx          — filtered resource list (by mode, topic, jurisdiction)
│   ├── ResourceCard.jsx       — individual resource with expand, share, archive
│   ├── ResourceDetail.jsx     — full detail panel: what, why, key data, timeline, scores
│   ├── WeeklyBriefing.jsx     — briefing with talking points, disputes
│   ├── ExportBuilder.jsx      — multi-select, reorder, format choose, download
│   ├── ShareMenu.jsx          — detail level selector + download buttons
│   ├── AdminPanel.jsx         — staged updates review, approve/reject
│   ├── TimelineBar.jsx        — horizontal milestone timeline
│   ├── ImpactScores.jsx       — 4-dimension score display with legend
│   ├── NavigationStack.jsx    — back button + history management
│   └── ui/                    — reusable: Button, Badge, FilterBar, SearchBar, Toast
├── hooks/
│   ├── useResources.js        — fetch/filter/sort resources from Supabase
│   ├── useAuth.js             — Supabase auth wrapper
│   ├── useExport.js           — HTML/Slack export generation + blob download
│   └── useNavigation.js       — navigation stack state management
├── lib/
│   ├── supabase.js            — Supabase client init
│   ├── scoring.js             — scoreResource, urgencyScore functions
│   ├── exportHTML.js           — HTML report template builder
│   ├── exportSlack.js          — Slack markdown builder
│   └── constants.js           — MODES, TOPICS, JURS, PRIORITY_COLORS, etc.
└── styles/
    └── globals.css            — iOS-inspired light theme, 12px minimum font
```

### Key UI Specifications (from current artifact)

**Typography:**
- Minimum font size: 12px (4 exceptions at 11px for micro-labels)
- Section headings: 20px, weight 800
- Focus view titles: 24px, weight 800
- Sub-section headers (WHAT THIS IS, WHY IT MATTERS): 15px, weight 800, uppercase, letterSpacing 1.2

**Color System:**
```javascript
const PRIORITY_COLORS = { CRITICAL: "#FF3B30", HIGH: "#FF9500", MODERATE: "#8e8e93", LOW: "#aeaeb2" };
const TOPIC_COLORS = { emissions: "#5856D6", fuels: "#A2845E", transport: "#34C759", reporting: "#AF52DE", packaging: "#FF2D55", corridors: "#007AFF", research: "#5AC8FA" };
const IMPACT_DIM_COLORS = { cost: "#FFD60A", compliance: "#E040FB", client: "#00C7BE", operational: "#64D2FF" };
```

**Navigation:**
- 3 tabs: Home, Explore, Settings
- Navigation stack with back button — maintains history through drill-downs
- Focus views for filtered resource lists (by mode, topic, jurisdiction, urgency)
- Cross-reference links push to navigation stack

**Export System:**
- All exports use Blob download (no clipboard API, no window.open — both blocked in some environments)
- HTML reports: fully formatted, all hyperlinks live, styled with inline CSS
- Slack text: markdown formatted `.txt` file
- Single resource share: 3 detail levels (Summary, Standard, Full)
- Batch export builder: multi-select with drag reorder

**Expand/Collapse:**
- Top chevron: 18px, turns blue when open
- Bottom collapse bar: full-width gray bar with "▲ Collapse" text
- Auto-scroll to card top on expand (80ms delay)
- Back to top floating button (bottom-right)

---

## 9. Skill File Regeneration

After each approved update batch, the system generates a new SKILL.md:

1. Query all active resources, source registry, active disputes, recent changelog
2. Call Claude API with the skill generation prompt (Section 7)
3. Save the output as a downloadable file
4. Notify admin: "New SKILL.md ready for upload"

The admin downloads the file and uploads it to their Claude account at:
`Settings → Features → Skills → environmental-policy-and-innovation → Replace SKILL.md`

Future: If Claude's skill API supports programmatic uploads, automate this step.

---

## 10. Data Seed

### Initial Resources (119)
The current artifact contains 119 resources organized as:

| Category | Count | ID prefix | Examples |
|----------|-------|-----------|----------|
| Ocean Shipping | 13 | o1-o13 | IMO GHG Strategy, FuelEU Maritime, EU ETS Shipping, CII, Net-Zero Framework |
| Air Freight | 12 | a1-a12 | EU ETS Aviation, CORSIA, ReFuelEU SAF, ICAO SAF Dashboard |
| Road/Land | 10 | l1-l10 | Euro 7, EU CO2 Trucks, CARB ACT/ACF, EPA Phase 3, AFIR |
| Trade/CBAM | 7 | t1-t7 | CBAM, WTO Rules, FTAs with environmental provisions |
| Compliance/Reporting | 11 | c1-c11 | CSRD, ISSB, ISO 14083, GLEC, GHG Protocol, CDP, SBTi |
| Global/Cross-modal | 34 | g1-g34 | Fit for 55, PPWR, EUDR, EPA Endangerment, ICS2, CountEmissions EU |
| Research/Intelligence | 36 | r1-r36 | FIATA, ICCT, ITF, NREL, Sabin Center, Maritime Carbon Intelligence |

The full seed data is in the source file `freight_sustainability_dashboard.jsx` — extract the `SEED` array, `REMAP` object, `CHANGE_LOG`, `SEED_DISPUTES`, `XREF_PAIRS`, `SUPERSESSIONS`, and `SEED_ARC` for database seeding.

### Initial Source Registry (seed from skill file)
The current skill file contains 80+ source URLs organized by region. Extract all URLs and seed into `source_registry` table.

Priority sources for weekly checking:
```
IMO:        imo.org/en/mediacentre, imo.org/en/ourwork/environment
EUR-Lex:    eur-lex.europa.eu/oj/daily-view
EU CLIMA:   climate.ec.europa.eu/eu-action/transport-decarbonisation
CBAM:       taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en
FuelEU:     transport.ec.europa.eu/transport-modes/maritime/fueleu-maritime_en
ReFuelEU:   transport.ec.europa.eu/transport-modes/air/refueleu-aviation_en
EUDR:       environment.ec.europa.eu/topics/forests/deforestation/regulation_en
EPA:        epa.gov/regulations-emissions-vehicles-and-engines
CARB:       ww2.arb.ca.gov
ICAO:       icao.int/CORSIA
UNFCCC:     unfccc.int/NDCREG
World Bank: carbonpricingdashboard.worldbank.org
EMSA MRV:   mrv.emsa.europa.eu
FIATA:      fiata.org
ICCT:       theicct.org/sector/freight
Smart Freight: smartfreightcentre.org
GHG Protocol: ghgprotocol.org
SBTi:       sciencebasedtargets.org
ISSB/IFRS:  ifrs.org/sustainability
```

---

## 11. Deployment Guide

### Prerequisites
- Supabase project (free tier works initially)
- Railway account with Pro plan (for cron jobs)
- Vercel account (free tier works)
- Anthropic API key (for Claude API calls in worker)
- Slack webhook URL (optional, for notifications)

### Step 1: Supabase Setup
1. Create project
2. Run all SQL from Section 4
3. Enable Row Level Security on all tables
4. Create admin user via Supabase Auth
5. Run seed script to populate resources, timelines, disputes, cross_references, supersessions, source_registry

### Step 2: Railway Backend
1. Create Node.js service
2. Add environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `SLACK_WEBHOOK_URL`
3. Deploy API routes from Section 5
4. Set up cron job: `0 6 * * 1` (Mondays 06:00 UTC)
5. Wire cron to `runWeeklyUpdate()` function

### Step 3: Vercel Frontend
1. Create Vite + React project
2. Add environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
3. Migrate components from Section 8
4. Deploy

### Step 4: Seed Data
1. Extract SEED array from `freight_sustainability_dashboard.jsx`
2. Transform to database format (flatten REMAP into resources)
3. Insert via Supabase client or SQL
4. Verify all 119 resources, timelines, disputes, cross-references load correctly

### Step 5: Test Worker
1. Call `POST /api/worker/run` manually
2. Verify staged_updates table populates
3. Test approve/reject flow in admin panel
4. Verify resources update correctly after approval

---

## 12. Update Workflow

### Weekly Automated Cycle
```
Monday 06:00 UTC — Worker runs
  ├── Searches all sources in registry
  ├── Calls Claude API with web search
  ├── Diffs against current database state
  ├── Writes proposed changes to staged_updates
  └── Sends Slack/email notification

Monday ~morning — Jason reviews
  ├── Opens admin panel
  ├── Reviews each staged update
  ├── Approves or rejects
  ├── Approved changes write to production tables
  └── System generates new SKILL.md

Monday ~afternoon — Jason uploads
  └── Downloads SKILL.md → uploads to Claude skill
```

### Manual Trigger
Jason can say "update the skill" in any Claude conversation. Claude will:
1. Web search all priority sources
2. Identify changes since last update
3. Generate updated SKILL.md
4. Deliver as downloadable file

This manual path works independently of the automated pipeline and is always available as a fallback.

---

## Source Files

The following files should be included with this handoff:

1. **`freight_sustainability_dashboard.jsx`** — Current working React component (1697 lines) containing all seed data, scoring logic, UI components, export system. This is the source of truth for:
   - All 119 resource definitions (SEED array)
   - Mode/topic/jurisdiction mappings (REMAP object)
   - Change log entries (CHANGE_LOG)
   - Disputes (SEED_DISPUTES)
   - Cross-references (XREF_PAIRS)
   - Supersessions (SUPERSESSIONS)
   - Archive seeds (SEED_ARC)
   - Impact scoring functions (scoreResource, urgencyScore)
   - Export templates (toEmailHTML, toBriefingEmail, toSlack, toBriefingSlack)
   - Share templates (buildShareHTML, buildShareSlack)

2. **`SKILL.md`** — Current Claude skill file (20 pages) containing source registry, prompt templates, architecture description. Extract the source URL list for database seeding.

3. **This document (`FSI_HANDOFF.md`)** — Complete build specification.

---

## Key Decisions Log

| Decision | Rationale |
|----------|-----------|
| Supabase over raw PostgreSQL | Jason already uses Supabase for Pet Pursuit; auth + RLS built in |
| Railway over AWS Lambda | Jason already has Railway; supports cron natively; simpler for single worker |
| Vercel over Railway for frontend | Jason already has Vercel for Pet Pursuit; optimized for React |
| Claude Sonnet over Opus for worker | Cost efficiency for weekly batch job; Sonnet handles structured extraction well |
| Staged updates (not auto-apply) | Human review required — regulatory data can't have false positives |
| Blob download over clipboard | Clipboard API blocked in many sandboxed environments; Blob works universally |
| Single admin initially | Jason is sole user with write access; team gets read-only |
| SKILL.md manual upload | Claude doesn't have programmatic skill upload API yet |
| HTML export format | Renders in any browser, prints clean to PDF, all hyperlinks preserved |
| No real-time/websocket | Weekly update cadence doesn't justify persistent connections |

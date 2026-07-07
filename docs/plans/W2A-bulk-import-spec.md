# W2.A — Bulk-add tooling

## Purpose

Admin can upload a CSV or paste a JSON array of candidate sources, the system
validates them via HEAD requests + ISO/URL shape checks, runs each through the
W2.F verification pipeline when present, and inserts approved candidates into
either `sources` (auto-approve) or `provisional_sources` (queue for review).

## API surface

`POST /api/admin/sources/bulk-import`

Auth: `requireAuth` + `isPlatformAdmin`. Authenticated non-admins receive 403.
Rate limit: 60 req/min/user (a single bulk-import call counts as 1 request
even when it processes hundreds of rows).

### Request

```ts
type BulkImportRequest = {
  format: 'csv' | 'json';
  data: string;                               // raw CSV text or JSON string
  options?: {
    dryRun?: boolean;                         // default: true (preview-first)
    autoVerify?: boolean;                     // default: true (use W2.F when present)
    defaultJurisdictionIso?: string[];        // applied to rows without iso
  };
};
```

### CSV schema

Header row required. Column order is fixed, but only `url` and `name` are
strictly required:

```
url,name,type,jurisdiction_iso,language,notes
```

- `url` (required) — http or https URL
- `name` (required) — human-readable label
- `type` (optional) — one of: `regulator`, `standards-body`,
  `industry-association`, `gazette`, `intergovernmental`, `academic`, `ngo`,
  `trade-press`, `law-firm`, `other`
- `jurisdiction_iso` (optional) — pipe-, comma-, semicolon-, or
  whitespace-separated list of ISO codes; the value should be quoted in the
  CSV when it contains commas (`"US|EU"` or `"US,EU"` quoted)
- `language` (optional) — ISO 639-1 (two letters)
- `notes` (optional) — free-text, copied to the source row's `description`
  on insert

Quoted fields, embedded commas, and double-quote escapes (`""`) are handled
by an inlined CSV parser in the route. Papa Parse is intentionally not added
as a dependency — the dataset is small and the parser is ~40 lines.

### JSON schema

Body is a flat array of `BulkImportRow` objects:

```ts
type BulkImportRow = {
  url: string;
  name: string;
  type?: string;
  jurisdiction_iso?: string[];
  language?: string;       // ISO 639-1
  notes?: string;
};
```

### Validation rules

Per row:

- `url` must be present and well-formed (parses as URL with `http:` or
  `https:` protocol)
- `name` must be present
- `type`, when supplied, must be in the allowed set listed above
- Each `jurisdiction_iso` entry must match
  `/^([A-Z]{2}|[A-Z]{2}-[A-Z0-9]{1,3}|EU|GLOBAL|IMO|ICAO)$/`
- `language`, when supplied, must be exactly two ASCII letters
- HEAD reachability: 8s timeout. 405 / 501 trigger a GET retry. 4xx/5xx and
  network failures map to `proposed_action: "reject"`.
- Duplicate detection: candidate URL exact-match against `sources.url`. When
  matched, `proposed_action: "duplicate"` and the existing source ID is
  returned in `duplicate_of_source_id`.
- Hard limit: 500 rows per call. Exceeding returns 400.

### Verification integration

The W2.F verification pipeline lives at `fsi-app/src/lib/sources/verification.ts`
and was **present** when this route was authored. Its public function is:

```ts
export async function verifyCandidate(
  candidate: VerificationCandidate,
  opts?: { skipDuplicateCheck?: boolean; dryRun?: boolean; supabase?: SupabaseClient }
): Promise<VerificationResult>;
```

This route imports it dynamically (`await import("@/lib/sources/verification")`)
so that a future code-state where the module is missing or renamed degrades
gracefully — every valid+non-duplicate row falls back to a safe-default
`provisional_sources` insert.

Behaviour during `dryRun=true` preview:
- HEAD check runs. On 2xx-3xx and `autoVerify=true`, the verification
  pipeline runs with `dryRun: true, skipDuplicateCheck: true` to predict
  the H/M/L tier without writing audit rows. (The route's own duplicate
  pre-check has already filtered duplicates.)
- The pipeline's tier maps to `proposed_action`:
  - H → `auto-approve`
  - M → `queue-provisional`
  - L → `reject`

Behaviour during `dryRun=false` apply:
- Each non-duplicate, non-rejected row is run through `verifyCandidate`
  with `dryRun: false`. The pipeline performs the full check (including
  duplicate check, content fetch, language detection, Haiku call, and
  the source / provisional_source insert).
- A row in `source_verifications` is written by the pipeline regardless
  of outcome (W2.F migration 037 contract). The bulk-import route writes
  one row in `bulk_imports` summarizing the apply outcome.

### Response

```ts
type BulkImportResponse = {
  preview: Array<{
    row_index: number;
    url: string;
    name: string;
    head_status: number | 'error';
    head_reason?: string;
    duplicate_of_source_id: string | null;
    validation_errors: string[];
    proposed_action: 'auto-approve' | 'queue-provisional' | 'reject' | 'duplicate';
  }>;
  summary: {
    total_rows: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
  applied?: {                      // only when dryRun=false
    sources_inserted: number;
    provisional_inserted: number;
    rejected: number;
  };
};
```

## Audit table — migration 038

`bulk_imports` is added by `fsi-app/supabase/migrations/038_bulk_import_audit.sql`.
One row per `dryRun=false` call. Captures who imported what, the raw payload
(truncated at 100K chars at the API layer), the per-row preview summary,
and the apply counters. `verification_present` is also stamped into
`preview_summary` so an auditor can tell whether W2.F's pipeline ran.

The route never writes to `bulk_imports` on dry-run calls — that table is
purely an apply-action audit trail.

RLS: read-only for authenticated users (matches the `IntegrityFlagsView`
read pattern); writes go through the service-role client in the route handler.

## UI — `BulkImportView.tsx`

Self-contained component, no props. Mounted by the orchestrator into
`AdminDashboard.tsx`.

Surface:

1. Two-tab toggle: CSV upload / JSON paste. Switching tabs clears the
   preview but preserves both text buffers.
2. CSV tab: file input (sets the textarea contents) + textarea showing
   parsed contents + "Insert template" button.
3. JSON tab: textarea + "Insert template" button.
4. Options panel: comma-separated `defaultJurisdictionIso` text input,
   `autoVerify` checkbox (default checked).
5. "Preview" button → calls API with `dryRun=true`. Renders preview table
   and summary stat strip.
6. "Commit" button (disabled until preview ran and at least one valid row
   exists) → calls API with `dryRun=false`. Surfaces apply counters in a
   toast (`"3 sources imported, 12 queued for review, 0 rejected."`).
7. Preview table columns: row index, name, URL, HEAD status pill (green
   2xx-3xx, red 4xx-5xx, grey ERR), duplicate ID badge, validation errors,
   proposed-action badge.
8. Error state inline above the preview when the API returns non-200.

Visual idiom mirrors `IntegrityFlagsView.tsx` — same `cl-card` surface
treatment, semantic `var(--color-*)` tokens only, no raw hex, 8pt grid,
WCAG AA contrast on every state.

UI assumptions:
- Uses `Button` from `@/components/ui/Button` (verified present).
- Uses inline toast block (mirrors the pattern in `IntegrityFlagsView.tsx`
  and `AdminDashboard.tsx`) — does NOT depend on a separate `Toast`
  component.
- Uses `lucide-react` icons already in deps: `Upload`, `FileText`,
  `AlertTriangle`, `CheckCircle`, `XCircle`, `Copy`, `Eye`.

## Integration point — wiring into `AdminDashboard.tsx`

The orchestrator should add a new admin tab. The pattern to follow is the
existing `integrity-flags` tab wiring (added in W2.C). Three concrete
edits to `fsi-app/src/components/admin/AdminDashboard.tsx`:

1. Add `"bulk-import"` to the `AdminTab` type union (around line 60-68).
2. Add `"bulk-import"` to `KNOWN_RENDERED_TABS` (around line 69-77).
3. Add a tab entry to the `tabs` array (around line 221-229), e.g.:

   ```ts
   { id: "bulk-import", label: "Bulk add sources", count: 0 },
   ```

4. Add the tab body block alongside the other `activeTab === ...` blocks,
   matching the `integrity-flags` pattern at lines 644-654:

   ```tsx
   {activeTab === "bulk-import" && (
     <div className="space-y-4">
       <BulkImportView />
     </div>
   )}
   ```

5. Add the import at the top of the file:

   ```ts
   import { BulkImportView } from "@/components/admin/BulkImportView";
   ```

The component is self-contained; no props, no callbacks, no parent state.
It owns its own data fetching against `/api/admin/sources/bulk-import`.

## Constraints honoured

- No emojis in any file (route, component, migration, spec).
- Auth + rate limit on the API route.
- Platform-admin gate via `isPlatformAdmin` (matches `/api/admin/attention`).
- `AdminDashboard.tsx` is NOT modified by this work — orchestrator wires.
- `Sidebar.tsx`, `iso.ts`, `intelligence.ts`, `source.ts` are NOT touched.
- Migrations 033-037 are NOT modified; migration 038 is the only new one.
- No new npm dependencies; CSV parsing inlined.

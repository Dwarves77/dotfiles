// BindingBanner.test.mjs, lane OBL-2 (2026-10-08): static proof of the item-level binding banner and its wiring,
// by reading source (no JSX runtime in the no-npm suite). The behaviour of the data it renders is proven in
// src/lib/workspace/obligation-gate.test.mjs; the 375 px layout is held here by construction (no fixed widths,
// flex-wrap, overflow-wrap) and measured by the rendering guard's UX smoke slot once the coordinator registers a
// spec for it (the smoke spec and ux-smoke-specs.mjs are outside this lane's write set).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { summariseObligationBinding } from "../../lib/workspace/relevance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(HERE, "..", "..", ...p), "utf8");
const BANNER = read("components", "regulations", "BindingBanner.tsx");
const PAGE = read("app", "regulations", "[slug]", "page.tsx");
const ROUTE = read("app", "api", "detail", "relevance", "route.ts");

test("the banner says 'Obligations not yet decomposed' for an item with no objects, and never renders an empty section", () => {
  assert.match(BANNER, /Obligations not yet decomposed/);
  assert.match(BANNER, /!binding\.decomposed \|\| binding\.lines\.length === 0/);
  // the data side agrees: no objects means decomposed false and no lines
  assert.deepEqual(summariseObligationBinding([], {}), { decomposed: false, objectCount: 0, applicability: null, lines: [] });
});

test("one line per binding position: the line renders the position label, duty holders, and the trigger that put the customer in scope", () => {
  assert.match(BANNER, /binding\.lines\.map\(\(line\) => \(\s*<LineView key=\{line\.position\}/);
  assert.match(BANNER, /Duty holders: /);
  assert.match(BANNER, /In scope because: /);
  assert.match(BANNER, /line\.triggers\.map\(\(t\) => t\.label\)/);
});

test("each cost slot is rendered by its own name from the data, separately, and the banner never sums or merges them", () => {
  assert.match(BANNER, /line\.costSlots\.map\(\(slot\) => \(/);
  assert.match(BANNER, /\{slot\.label\}: /);
  assert.doesNotMatch(BANNER, /total|sum\(|reduce\(/i);
  const b = summariseObligationBinding(
    [{ obligation_id: "cl:obligation:0000000000000001", binding_position: "direct_duty", duty_holder_class: ["forwarder"],
       applicability_trigger: { attribute: "org_role", value: "forwarder" }, statutory_maximum: "x",
       direct_compliance_cost: { amount: 1, currency: "EUR", basis: "b", source: "s" }, effort: { person_days: 1, recurrence: "annual" } }],
    { orgRoles: ["forwarder"], orgSize: {} },
  );
  assert.deepEqual(b.lines[0].costSlots.map((s) => s.label), ["Penalty exposure", "Direct compliance cost", "Effort (person-days, not money)"]);
});

test("every applicability status the gate can return has banner text", () => {
  for (const s of ["applies", "does_not_apply", "needs_profile_input"]) assert.match(BANNER, new RegExp(`${s}: "`));
});

test("UX laws: loading, failure with retry, completion in every branch; targets at least 44 px; title carries data-guard-title", () => {
  assert.match(BANNER, /data-guard-title/);
  assert.match(BANNER, /role="status"/); // loading acknowledgement (law 6)
  assert.match(BANNER, /role="alert"/); // plain-language failure (law 15)
  assert.match(BANNER, /Try again/);
  assert.match(BANNER, /minHeight: 44/);
  // the profile link is the only other action and appears only when an answer needs profile input
  assert.match(BANNER, /needsInput && \(/);
  assert.match(BANNER, /href="\/settings"/);
  // a failed load is its own state, not "no obligations"
  assert.match(BANNER, /body\.binding\.loadFailed|binding\.loadFailed/);
});

test("375 px: no fixed widths, wrapping flex rows, long words break; no horizontal scroll container", () => {
  assert.doesNotMatch(BANNER, /\bwidth:\s*\d/);
  assert.doesNotMatch(BANNER, /overflowX|overflow-x|whiteSpace:\s*"nowrap"/);
  assert.match(BANNER, /flexWrap: "wrap"/);
  assert.match(BANNER, /overflowWrap: "anywhere"/);
  assert.match(BANNER, /maxWidth: 1180/); // the same container the sibling detail sections use
  assert.match(BANNER, /var\(--cl-detail-pad-x/); // the page gutter token (16 px at phone width, globals.css)
});

test("no raw colour literals outside a var() fallback, no dash glyphs", () => {
  const stripped = BANNER.replace(/var\([^)]*\)/g, "");
  assert.doesNotMatch(stripped, /#[0-9A-Fa-f]{3,8}\b/);
  assert.doesNotMatch(BANNER, new RegExp("[" + String.fromCharCode(0x2013, 0x2014, 0xa7) + "]"));
});

test("the detail page mounts the banner ABOVE the obligation register section", () => {
  const banner = PAGE.indexOf("<BindingBanner itemId={r.id} />");
  const register = PAGE.indexOf('<ObligationRegister variant="detail" itemId={r.id} />');
  assert.ok(banner > 0 && register > 0, "both are mounted");
  assert.ok(banner < register, "banner is above the register");
  assert.match(PAGE, /import \{ BindingBanner \} from "@\/components\/regulations\/BindingBanner"/);
});

test("the relevance route reads the item's obligation objects, hands them to the gate, and returns the banner data", () => {
  assert.match(ROUTE, /fetchObligationObjectsForItem\(supabase, itemId\)/);
  assert.match(ROUTE, /obligation_objects: objects/);
  assert.match(ROUTE, /createSupabaseServerClient/); // request-scoped client, RLS applies
  assert.doesNotMatch(ROUTE, /SERVICE_ROLE/);
  assert.match(ROUTE, /NextResponse\.json\(\{ relevance, binding \}/);
  assert.match(ROUTE, /loadFailed/);
  // the fetch failure path never claims "no obligations"
  assert.match(ROUTE, /loadFailed = true/);
});

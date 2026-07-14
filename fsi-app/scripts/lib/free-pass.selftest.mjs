// Goldens for the free-pass re-attribution decision (operator constraint 2026-07-13). The three named cases
// MUST hold: span-in-primary ACCEPTED, span-in-furniture REJECTED, span-in-excluded-capture REJECTED — plus
// the tier/length/exemption edges. A matched span is NEVER sufficient on its own; officialness (path a) and the
// error-body partition gate it. Pure, no I/O.
import { test } from "node:test";
import assert from "node:assert/strict";
import { freeReattributeDecision, MIN_REATTRIB_SPAN } from "./free-pass.mjs";

// A realistic enacted-text FACT span (> MIN_REATTRIB_SPAN, a full clause).
const SPAN = "each operator shall report annual emissions by 31 March of the following year";

// (a) PRIMARY-INSTRUMENT body: >=200 clean chars past the nav, carries Article/shall markers, contains the span.
const PRIMARY_BODY =
  "Article 5. Reporting obligations. Under this Regulation, each operator shall report annual emissions by 31 March of the following year to the competent authority. The report shall include the methodology and the verification statement. Article 6 sets out the penalties for non-compliance, including administrative fines proportionate to the tonnage.";

// (b) FURNITURE body: the SAME span verbatim, but nav/portal chrome — NO instrument markers (no Article/Annex/
// CELEX, no Section+obligation). Officialness must route this to path 'b' (never a floor re-home target).
const FURNITURE_BODY =
  "Home | Regulations | About us | Contact | Search this site. Related guidance: each operator shall report annual emissions by 31 March of the following year. Sign up for our newsletter to stay informed. Cookie preferences and privacy settings. Follow us on social media for updates and news.";

// (c) EXCLUDED CAPTURE: an error/bot-block body. It even carries the span + instrument markers, so the ONLY
// reason it is rejected is the error-body partition (gate 3 fires before officialness).
const ERROR_BODY =
  "403 Forbidden. Access Denied. You do not have permission to access this resource on this server. Request blocked by the security policy. Article 5 each operator shall report annual emissions by 31 March of the following year to the competent authority.";

const cap = (body, host, hostTier) => ({ host, hostTier, url: `https://${host}/x`, body });

test("span-in-PRIMARY at floor tier is ACCEPTED", () => {
  const d = freeReattributeDecision(SPAN, null, [cap(PRIMARY_BODY, "eur-lex.europa.eu", 1)], 2);
  assert.equal(d.accept, true);
  assert.equal(d.tier, 1);
  assert.match(d.reason, /path=a/);
});

test("span-in-FURNITURE (verbatim match, but portal chrome / no instrument markers) is REJECTED", () => {
  const d = freeReattributeDecision(SPAN, null, [cap(FURNITURE_BODY, "example.gov", 2)], 2);
  assert.equal(d.accept, false, "a matched span in non-authoritative furniture must NOT flip (fake-cert guard)");
  assert.equal(d.reason, "no_floor_qualifying_primary_capture");
});

test("span-in-EXCLUDED-CAPTURE (error/bot-block body) is REJECTED even with markers + verbatim span", () => {
  const d = freeReattributeDecision(SPAN, null, [cap(ERROR_BODY, "eur-lex.europa.eu", 1)], 2);
  assert.equal(d.accept, false, "no re-attribution into a capture the error-body gate excluded");
  assert.equal(d.reason, "no_floor_qualifying_primary_capture");
});

test("best-tier-first: a clean PRIMARY wins even when furniture is also present", () => {
  const d = freeReattributeDecision(SPAN, null, [cap(FURNITURE_BODY, "example.gov", 2), cap(PRIMARY_BODY, "eur-lex.europa.eu", 1)], 2);
  assert.equal(d.accept, true);
  assert.equal(d.target.host, "eur-lex.europa.eu");
});

test("span already AT/ABOVE the floor keeps its attribution (no needless re-point)", () => {
  const d = freeReattributeDecision(SPAN, 2, [cap(PRIMARY_BODY, "eur-lex.europa.eu", 1)], 2);
  assert.equal(d.accept, false);
  assert.equal(d.reason, "already_at_floor");
});

test("too-short span is never re-homed (coincidental-fragment guard)", () => {
  const short = "shall report";
  assert.ok(short.length < MIN_REATTRIB_SPAN);
  const d = freeReattributeDecision(short, null, [cap(PRIMARY_BODY.replace(SPAN, short), "eur-lex.europa.eu", 1)], 2);
  assert.equal(d.accept, false);
  assert.equal(d.reason, "span_too_short");
});

test("exempt item type (floorTier null) never re-attributes", () => {
  const d = freeReattributeDecision(SPAN, null, [cap(PRIMARY_BODY, "eur-lex.europa.eu", 1)], null);
  assert.equal(d.accept, false);
  assert.equal(d.reason, "exempt_item_type");
});

test("sub-floor-only candidate (host tier below the floor) yields no re-home", () => {
  const d = freeReattributeDecision(SPAN, null, [cap(PRIMARY_BODY, "loadstar.com", 6)], 2);
  assert.equal(d.accept, false);
  assert.equal(d.reason, "no_floor_qualifying_primary_capture");
});

test("verbatim-absent from every floor source → honest wall (4c: never forced)", () => {
  const d = freeReattributeDecision(SPAN, null, [cap(PRIMARY_BODY.replace(SPAN, "some other clause entirely about vessels"), "eur-lex.europa.eu", 1)], 2);
  assert.equal(d.accept, false);
  assert.equal(d.reason, "no_floor_qualifying_primary_capture");
});

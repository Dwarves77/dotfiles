// identity-format.test.mjs, proves the identity and entity-binding formatting
// rules independent of any component render (see identity-format.ts's header for why this split
// exists). R8.7 (2026-09-25, migration 336) amended the identity rule: name/company are shown by
// default (identity shown unless anonymous), so the case that matters most here is now the opposite
// of the pre-R8.7 one, formatAuthorIdentity must show name/company when given, and must NOT show
// them when the identity is anonymous (name/company already withheld upstream by
// projectAuthorIdentity, per that module's header).

import test from "node:test";
import assert from "node:assert/strict";
import {
  formatAuthorIdentity,
  validateEntityBinding,
} from "./identity-format.ts";

test("formatAuthorIdentity joins org type, role, sector, region in order", () => {
  const line = formatAuthorIdentity({
    orgType: "Freight forwarder",
    role: "Trade lane manager",
    sector: "Apparel",
    region: "EU",
    verified: true,
  });
  assert.equal(line, "Freight forwarder · Trade lane manager · Apparel · EU");
});

test("formatAuthorIdentity drops blank fields without leaving stray separators", () => {
  const line = formatAuthorIdentity({ orgType: "Carrier", role: "", sector: null, region: "APAC" });
  assert.equal(line, "Carrier · APAC");
});

test("formatAuthorIdentity returns null for null/undefined/all-blank input, never an empty string a caller might render as a stray dot", () => {
  assert.equal(formatAuthorIdentity(null), null);
  assert.equal(formatAuthorIdentity(undefined), null);
  assert.equal(formatAuthorIdentity({}), null);
});

test("formatAuthorIdentity (R8.7): name and company lead the line, before org type/role/sector/region", () => {
  const line = formatAuthorIdentity({
    name: "Jane Forwarder",
    company: "Acme Forwarding Ltd",
    orgType: "Shipper",
    role: "Ops lead",
    sector: "Electronics",
    region: "US",
  });
  assert.equal(line, "Jane Forwarder · Acme Forwarding Ltd · Shipper · Ops lead · Electronics · US");
});

test("formatAuthorIdentity (R8.7): an anonymous identity (name/company already null upstream) falls back to the pseudonymous line unchanged", () => {
  // The withholding decision happens in identity.mjs projectAuthorIdentity, not here, this function
  // only ever renders what it is given, so an anonymous identity simply arrives with name/company null.
  const line = formatAuthorIdentity({
    name: null,
    company: null,
    anonymous: true,
    orgType: "Shipper",
    role: "Ops lead",
    sector: "Electronics",
    region: "US",
  });
  assert.equal(line, "Shipper · Ops lead · Electronics · US");
});

test("validateEntityBinding refuses zero/undefined/null entity ids with the spine-entity message", () => {
  assert.match(validateEntityBinding([]), /spine entity/);
  assert.match(validateEntityBinding(undefined), /spine entity/);
  assert.match(validateEntityBinding(null), /spine entity/);
});

test("validateEntityBinding refuses a MALFORMED entity id (the composer-400 class fix, 2026-09-29): the client now catches what only the server used to", () => {
  const err = validateEntityBinding(["not-a-real-entity-id"]);
  assert.match(err ?? "", /malformed/);
});

test("validateEntityBinding accepts one or more WELL-FORMED entity ids (cl:<kind>:<16 hex>)", () => {
  // Updated for the entity-binding.mjs unification (composer-400 investigation, 2026-09-29): this
  // check now also validates the id SHAPE, matching the server, not only "at least one", see that
  // module's own header for why. The old fixtures ("cl:corridor:abc") were never well-formed 16-hex
  // ids; only the "at least one, any string" case was being proven before.
  assert.equal(validateEntityBinding(["cl:corridor:0123456789abcdef"]), null);
  assert.equal(
    validateEntityBinding(["cl:corridor:0123456789abcdef", "cl:jurisdiction:fedcba9876543210"]),
    null
  );
});

// SEC-5 (migration 372): an anonymous author is labelled, and the verified marker never depends on a line existing.
import { authorIdentityLabel, ANONYMOUS_LABEL } from "./identity-format.ts";

test("authorIdentityLabel: an anonymous author with nothing else to show is labelled, never blank", () => {
  assert.equal(authorIdentityLabel({ anonymous: true, verified: true, name: null, company: null }), ANONYMOUS_LABEL);
});

test("authorIdentityLabel: an anonymous author with org fields leads with the label so the withheld name is explicit", () => {
  assert.equal(
    authorIdentityLabel({ anonymous: true, name: null, company: null, orgType: "Shipper", role: "Ops lead" }),
    `${ANONYMOUS_LABEL} · Shipper · Ops lead`
  );
});

test("authorIdentityLabel: a non-anonymous author is unchanged from formatAuthorIdentity", () => {
  assert.equal(authorIdentityLabel({ name: "Jane Forwarder", company: "Acme", orgType: "Shipper" }), "Jane Forwarder · Acme · Shipper");
  assert.equal(authorIdentityLabel({}), null);
  assert.equal(authorIdentityLabel(null), null);
});

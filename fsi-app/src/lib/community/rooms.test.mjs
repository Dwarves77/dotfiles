// rooms.test.mjs — P1 fix (2026-09-06): the room-membership single source of truth.
//
// Repro of the reported defect: an EU tile showed "YOU'RE HERE" while the room panel's
// Join button showed "Join room" for the same room, because the tile's chip was computed
// as `youHere || joined` (home-jurisdiction hint OR real membership) while the panel's
// Join/Leave control read `joined` alone. This test pins `isRoomMember` — the one function
// every membership-claiming surface must call — against exactly that state combination.
import { test } from "node:test";
import assert from "node:assert/strict";

const mod = await import("./rooms.ts");
const { isRoomMember, homeJurisdictionsInRoom, roomForJurisdiction } = mod;

test("isRoomMember: home-jurisdiction match alone is NOT membership (the reported P1 bug)", () => {
  // The exact state that produced the defect: org home jurisdiction is EU (youHere would be
  // true) but the user never joined the EU room (no community_group_members row).
  const eutile = { joined: false };
  assert.equal(
    isRoomMember(eutile),
    false,
    "a room the user has not joined must never read as 'you're here'"
  );
});

test("isRoomMember: real membership reads true regardless of jurisdiction", () => {
  assert.equal(isRoomMember({ joined: true }), true);
});

test("isRoomMember is membership-only: youHere on the input object cannot leak through", () => {
  // Even if a caller accidentally passes youHere alongside joined:false, isRoomMember must
  // ignore it — it only reads .joined. This is what makes it safe as the single shared source
  // of truth for both the tile chip and the room panel's Join button.
  const room = { joined: false, youHere: true };
  assert.equal(isRoomMember(room), false);
});

test("homeJurisdictionsInRoom / roomForJurisdiction still classify EU correctly (sanity, unchanged)", () => {
  assert.equal(roomForJurisdiction("de"), "EU");
  assert.equal(homeJurisdictionsInRoom(["de"], "EU"), true);
  assert.equal(homeJurisdictionsInRoom(["de"], "US"), false);
});

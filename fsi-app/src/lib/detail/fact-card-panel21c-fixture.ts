// src/lib/detail/fact-card-panel21c-fixture.ts
//
// Panel 21c sign-off fixture (lane w10-factcard-d, 2026-09-21, build item 5: "the fixture ... two
// groups, five cards, two strips, the same content as the artboard"). A SEPARATE file from
// fact-card-fixtures.ts rather than an addition to it: fact-card-fixtures.ts and its own
// .npmtest.mjs are BOTH already at 2 of the last 30 first-parent commits of origin/master (this
// lane's premise check, `git log --first-parent -30` + per-commit `git diff-tree`), and the
// coordinator's dated HOTSPOT_ALLOWLIST clearance in this lane's brief names only two OTHER files
// (fact-card-model.ts / .test.mjs) as the serial-lane exception, F51-no-shared-append.mjs's own
// rule is "any OTHER file of yours at two master touches is a STOP with its name." Landing this
// data in a new file (0 prior touches) avoids that hotspot entirely rather than requesting a
// ruling this lane isn't authorized to grant itself; fact-card-fixtures.ts stays untouched.
//
// Reuses the SAME hand-authored KIND_FIXTURES content (fact-card-fixtures.ts) - not a re-
// invention - grouped exactly as the artboard draws them, plus the group-level title/qualifier/
// band/actionStrip text the artboard itself shows. This group-level copy is FIXTURE PROSE (per
// fact-card-fixtures.ts's own header: "hand-built, never derived from a real corpus row...
// deliberately generic placeholders, never presented as real regulatory facts"), the one place
// ItemGroup's title/band/actionStrip are legitimately hand-authored - see ItemGroup.tsx's header
// for why a REAL call site never invents this same data.

import type { FactCardFixture } from "@/lib/detail/fact-card-fixtures";
import { KIND_FIXTURES } from "@/lib/detail/fact-card-fixtures";
import { band as urgencyBand } from "@/lib/urgency/bands";
import type { UrgencyBand } from "@/lib/urgency/bands";
import type { ItemGroupActionStrip } from "@/components/ui/ItemGroup";

export interface PanelGroupFixture {
  title: string;
  qualifier: string;
  band: UrgencyBand;
  actionStrip: ItemGroupActionStrip;
  cards: FactCardFixture[];
}

export const PANEL_21C_GROUPS: PanelGroupFixture[] = [
  {
    title: "Take-back registration — importers of filled packaging", // glyph:verbatim (artboard 21c's own title text)
    qualifier: "Belgium · binding since 1999",
    band: urgencyBand("immediate"),
    actionStrip: {
      text: "Ask each Belgium-bound client for its registration number or agreed-body contract before the next filled-packaging shipment.",
    },
    cards: [KIND_FIXTURES[0], KIND_FIXTURES[1]], // ACTION REQUIRED, LEGAL CONFIRMATION REQUIRED
  },
  {
    title: "Recovery and recycling targets",
    qualifier: "EU baseline vs Belgian national rates",
    band: urgencyBand("action"),
    actionStrip: {
      text: "Budget Belgian-market packaging at the national rate, not the EU baseline; the difference is the client's cost.",
    },
    cards: [KIND_FIXTURES[3], KIND_FIXTURES[4], KIND_FIXTURES[8]], // BASELINE TARGET, NATIONAL TARGET, ANALYTICAL INFERENCE
  },
];

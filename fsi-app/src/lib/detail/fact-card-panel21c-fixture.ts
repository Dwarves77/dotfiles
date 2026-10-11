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

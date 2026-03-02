import type { Resource, ChangeLogEntry, Dispute } from "@/types/resource";
import { scoreResource, urgencyScore } from "@/lib/scoring";
import { APP_NAME } from "@/lib/constants";

const MODE_LABELS: Record<string, string> = {
  air: "AIR",
  road: "ROAD",
  ocean: "OCEAN",
};

function modeText(modes?: string[]): string {
  if (!modes?.length) return "";
  return modes.map((m) => MODE_LABELS[m] || m.toUpperCase()).join("/");
}

// ── Multi Resource Slack Format ──
export function toSlack(
  items: Resource[],
  title: string,
  date: string,
  changelog: Record<string, ChangeLogEntry[]>,
  disputes: Record<string, Dispute>
): string {
  let s = `*${title || APP_NAME}*\n_${date} · ${items.length} items_\n\n`;

  items.forEach((r) => {
    const modes = modeText(r.modes || [r.cat]);
    const sc = scoreResource(r);
    const disp = disputes[r.id];
    const changes = changelog[r.id];

    s += `${modes} *${r.title}* \`${r.priority}\`\n`;
    if (r.whatIsIt) s += `>${r.whatIsIt.slice(0, 200)}\n`;
    if (r.whyMatters) s += `>*Why:* ${r.whyMatters.slice(0, 200)}\n`;
    if (changes?.length) {
      s += `>*Changed:*\n`;
      changes.forEach((ch) => {
        if (ch.prev && ch.now) s += `>  _${ch.fields?.join(", ") || ""}:_ ~~${ch.prev.slice(0, 60)}~~ → ${ch.now.slice(0, 80)}\n`;
      });
    }
    if (r.keyData?.length) s += r.keyData.slice(0, 4).map((dd) => `>• ${dd}`).join("\n") + "\n";
    s += `>Impact: Cost ${sc.cost}/3 · Compliance ${sc.compliance}/3 · Client ${sc.client}/3 · Ops ${sc.operational}/3\n`;
    if (disp?.note) {
      s += `>*Disputed:* ${disp.note.slice(0, 150)}\n`;
    }
    if (r.timeline?.length) {
      const now = new Date();
      const next = r.timeline
        .map((m) => ({ ...m, dt: new Date(m.date) }))
        .filter((m) => m.dt > now)
        .sort((a, b) => a.dt.getTime() - b.dt.getTime())[0];
      if (next) {
        const days = Math.floor((next.dt.getTime() - now.getTime()) / 864e5);
        s += `>Next: *${next.label}* — ${next.date} (${days}d)\n`;
      }
    }
    if (r.url) s += `>${r.url}\n`;
    s += `\n`;
  });

  s += `_Generated ${date} · ${APP_NAME}_`;
  return s;
}

// ── Weekly Briefing Slack ──
export function toBriefingSlack(
  resources: Resource[],
  date: string,
  changelog: Record<string, ChangeLogEntry[]>,
  disputes: Record<string, Dispute>,
  auditDate: string
): string {
  const critical = [...resources].sort((a, b) => urgencyScore(b) - urgencyScore(a)).slice(0, 5);
  const newR = resources.filter((r) => r.added === auditDate);
  const now = new Date();
  const q = new Date(now.getTime() + 90 * 864e5);
  const due = resources
    .filter((r) => r.timeline?.some((m) => { const d = new Date(m.date); return d >= now && d <= q; }))
    .slice(0, 5);
  const disputed = Object.entries(disputes)
    .filter(([, d]) => d.note)
    .map(([id, d]) => ({ ...d, r: resources.find((x) => x.id === id) }))
    .filter((x) => x.r);

  let s = `*Weekly Briefing — ${date}*\n_${resources.length} resources tracked · ${APP_NAME}_\n\n`;

  if (newR.length) {
    s += `*New This Week*\n`;
    newR.forEach((r) => {
      s += `• *${r.title}* \`${r.priority}\`\n  ${r.whyMatters?.slice(0, 150) || r.note}\n  ${r.url || ""}\n`;
    });
    s += `\n`;
  }

  s += `*Top Urgency*\n`;
  critical.forEach((r) => {
    s += `• \`${r.priority}\` *${r.title}*\n  ${r.whyMatters?.slice(0, 120) || r.note}\n`;
  });
  s += `\n`;

  if (due.length) {
    s += `*Due This Quarter*\n`;
    due.forEach((r) => {
      const next = r.timeline
        ?.map((m) => ({ ...m, dt: new Date(m.date) }))
        .filter((m) => m.dt >= now && m.dt <= q)
        .sort((a, b) => a.dt.getTime() - b.dt.getTime())[0];
      const days = next ? Math.floor((next.dt.getTime() - now.getTime()) / 864e5) : null;
      s += `• ${days !== null ? `*${days}d* ` : ``}${r.title}${next ? ` → ${next.label}` : ``}\n`;
    });
    s += `\n`;
  }

  if (disputed.length) {
    s += `*Disputed / Watch*\n`;
    disputed.forEach((x) => {
      s += `• *${x.r!.title}:* ${x.note.slice(0, 120)}\n`;
    });
    s += `\n`;
  }

  s += `_Generated ${date} · ${APP_NAME}_`;
  return s;
}

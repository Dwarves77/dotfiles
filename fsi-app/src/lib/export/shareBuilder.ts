import type { Resource, ChangeLogEntry, Dispute } from "@/types/resource";
import { scoreResource, urgencyScore } from "@/lib/scoring";
import { TOPIC_COLORS, APP_NAME } from "@/lib/constants";

const PRI_COLOR: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#C77700",
  MODERATE: "#6b7280",
  LOW: "#9ca3af",
};

const MODE_LABELS: Record<string, string> = {
  air: "AIR",
  road: "ROAD",
  ocean: "OCEAN",
};

function modeText(modes?: string[]): string {
  if (!modes?.length) return "";
  return modes.map((m) => MODE_LABELS[m] || m.toUpperCase()).join(" / ");
}

// ── Share Single Resource as HTML ──
export function buildShareHTML(
  r: Resource,
  level: "summary" | "standard" | "full",
  date: string,
  changelog: Record<string, ChangeLogEntry[]>,
  disputes: Record<string, Dispute>
): string {
  const tc = TOPIC_COLORS[r.topic || ""] || "#6b7280";
  const modes = modeText(r.modes || [r.cat]);

  let h = `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1f2937">`;
  h += `<div style="background:#171e19;color:#ffffff;padding:24px 28px;border-radius:8px 8px 0 0"><h1 style="margin:0;font-size:20px;letter-spacing:0.5px">${r.title}</h1><p style="margin:6px 0 0;font-size:13px;color:#b7c6c2">${date} · ${APP_NAME}</p></div>`;
  h += `<div style="padding:18px 28px;border-left:4px solid ${tc}">`;
  h += `<p style="margin:0 0 8px;font-size:14px"><span style="font-size:11px;letter-spacing:1px;color:#6b7280">${modes}</span> · <span style="color:${PRI_COLOR[r.priority] || "#6b7280"};font-weight:700">${r.priority}</span></p>`;

  // All levels: why it matters
  if (r.whyMatters)
    h += `<div style="margin:8px 0;padding:10px 14px;background:#f0fdf4;border-left:3px solid #059669;border-radius:4px"><p style="margin:0;font-size:13px;color:#059669;font-weight:600">WHY THIS MATTERS</p><p style="margin:6px 0 0;font-size:14px;color:#374151;line-height:1.7">${r.whyMatters}</p></div>`;
  if (r.url) h += `<p style="margin:6px 0;font-size:13px"><a href="${r.url}" style="color:#2563eb">Source document</a></p>`;

  if (level === "summary") {
    h += `</div></div>`;
    return h;
  }

  // Standard: add what it is, impact, timeline
  if (r.whatIsIt)
    h += `<div style="margin:12px 0"><p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827">WHAT THIS IS</p><p style="margin:0;font-size:14px;color:#374151;line-height:1.7">${r.whatIsIt}</p></div>`;

  const sc = scoreResource(r);
  h += `<div style="margin:12px 0;padding:10px 14px;background:#f9fafb;border-radius:6px"><p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#111827">IMPACT ASSESSMENT</p>`;
  h += `<table style="width:100%;font-size:13px;color:#374151;border-collapse:collapse">`;
  const dims = [
    { d: "cost" as const, l: "Cost Impact" },
    { d: "compliance" as const, l: "Compliance Obligation" },
    { d: "client" as const, l: "Client-Facing" },
    { d: "operational" as const, l: "Operational" },
  ];
  dims.forEach((x) => {
    const v = sc[x.d] || 0;
    const lbl = v === 0 ? "None" : v === 1 ? "Low" : v === 2 ? "Moderate" : "High";
    h += `<tr><td style="padding:4px 0;font-weight:600">${x.l}</td><td style="padding:4px 8px;text-align:center;font-weight:700">${v}/3</td><td style="padding:4px 0;color:#6b7280">${lbl}</td></tr>`;
  });
  h += `</table><p style="margin:6px 0 0;font-size:13px;color:#6b7280">Urgency score: <strong>${urgencyScore(r)}</strong></p></div>`;

  if (r.timeline?.length) {
    h += `<div style="margin:12px 0"><p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#111827">TIMELINE</p>`;
    r.timeline.forEach((m) => {
      const past = new Date(m.date) <= new Date();
      h += `<p style="margin:3px 0;font-size:13px;color:${past ? "#059669" : "#374151"}">${past ? "&#10003;" : "&#9675;"} <strong>${m.date}</strong> — ${m.label}</p>`;
    });
    h += `</div>`;
  }

  if (level === "standard") {
    h += `</div></div>`;
    return h;
  }

  // Full: add key data, disputes, what changed
  const changes = changelog[r.id];
  const disp = disputes[r.id];

  if (changes?.length) {
    h += `<div style="margin:12px 0;padding:10px 14px;background:#fff7ed;border-left:3px solid #C77700;border-radius:4px"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#C77700">WHAT CHANGED</p>`;
    changes.forEach((ch) => {
      h += `<div style="margin-bottom:8px"><p style="margin:0;font-size:13px;font-weight:700;color:#374151">${ch.fields?.join(", ") || ""}</p>`;
      if (ch.prev) h += `<p style="margin:3px 0;font-size:13px;color:#9ca3af;text-decoration:line-through">Was: ${ch.prev}</p>`;
      if (ch.now) h += `<p style="margin:3px 0;font-size:13px;color:#111827;font-weight:500">Now: ${ch.now}</p>`;
      if (ch.impact) h += `<p style="margin:3px 0;font-size:12px;color:#C77700">Impact: ${ch.impact}</p>`;
      h += `</div>`;
    });
    h += `</div>`;
  }

  if (r.keyData?.length)
    h += `<div style="margin:12px 0;padding:10px 14px;background:#f9fafb;border-radius:6px"><p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#111827">KEY DATA</p>${r.keyData.map((dd) => `<p style="margin:3px 0;font-size:13px;color:#374151;line-height:1.6">&bull; ${dd}</p>`).join("")}</div>`;

  if (disp?.note) {
    h += `<div style="margin:12px 0;padding:10px 14px;background:#fff8f1;border-left:3px solid #FF9500;border-radius:4px">`;
    h += `<p style="margin:0 0 4px;font-size:14px;color:#FF9500;font-weight:700">DISPUTED</p>`;
    h += `<p style="margin:0 0 4px;font-size:13px;color:#92400e;line-height:1.6">${disp.note}</p>`;
    h += `</div>`;
  }

  h += `</div></div>`;
  return h;
}

// ── Share Single Resource as Slack ──
export function buildShareSlack(
  r: Resource,
  level: "summary" | "standard" | "full",
  date: string,
  changelog: Record<string, ChangeLogEntry[]>,
  disputes: Record<string, Dispute>
): string {
  const modes = modeText(r.modes || [r.cat]);
  const sc = scoreResource(r);
  const disp = disputes[r.id];
  const changes = changelog[r.id];

  let s = `${modes} *${r.title}* \`${r.priority}\`\n`;
  if (r.whyMatters) s += `>*Why this matters:* ${r.whyMatters}\n`;
  if (r.url) s += `>${r.url}\n`;

  if (level === "summary") {
    s += `_${date} · ${APP_NAME}_\n`;
    return s;
  }

  if (r.whatIsIt) s += `>*What this is:* ${r.whatIsIt.slice(0, 250)}\n`;
  s += `>*Impact:* Cost ${sc.cost}/3 · Compliance ${sc.compliance}/3 · Client ${sc.client}/3 · Ops ${sc.operational}/3 · Urgency ${urgencyScore(r)}\n`;

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

  if (level === "standard") {
    s += `_${date} · ${APP_NAME}_\n`;
    return s;
  }

  if (changes?.length) {
    s += `>*What changed:*\n`;
    changes.forEach((ch) => {
      if (ch.prev && ch.now) s += `>  _${ch.fields?.join(", ") || ""}:_ ~~${ch.prev.slice(0, 80)}~~ → ${ch.now.slice(0, 100)}\n`;
    });
  }
  if (r.keyData?.length) s += r.keyData.slice(0, 5).map((dd) => `>• ${dd}`).join("\n") + "\n";
  if (disp?.note) {
    s += `>*Disputed:* ${disp.note.slice(0, 200)}\n`;
  }

  s += `_${date} · ${APP_NAME}_\n`;
  return s;
}

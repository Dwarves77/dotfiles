import type { Resource, ChangeLogEntry, Dispute } from "@/types/resource";
import { scoreResource, urgencyScore } from "@/lib/scoring";
import { TOPIC_COLORS } from "@/lib/constants";
import { APP_NAME } from "@/lib/constants";

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

// ── Single/Multi Resource Email HTML ──
export function toEmailHTML(
  items: Resource[],
  title: string,
  date: string,
  changelog: Record<string, ChangeLogEntry[]>,
  disputes: Record<string, Dispute>
): string {
  let h = `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1f2937">`;
  h += `<div style="background:#171e19;color:#ffffff;padding:24px 28px;border-radius:8px 8px 0 0"><h1 style="margin:0;font-size:20px;letter-spacing:1px">${title || APP_NAME}</h1><p style="margin:6px 0 0;font-size:13px;color:#b7c6c2">${date} · ${items.length} item${items.length !== 1 ? "s" : ""}</p></div>`;
  h += `<div style="padding:4px 0">`;

  items.forEach((r) => {
    const tc = TOPIC_COLORS[r.topic || ""] || "#6b7280";
    const modes = modeText(r.modes || [r.cat]);
    const sc = scoreResource(r);
    const disp = disputes[r.id];
    const changes = changelog[r.id];

    h += `<div style="padding:18px 28px;border-bottom:1px solid #e5e7eb;border-left:4px solid ${tc}">`;
    // Header
    h += `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">`;
    h += `<div><span style="font-size:12px;letter-spacing:1px;color:#6b7280">${modes}</span> <strong style="font-size:16px;color:#111827">${r.title}</strong></div>`;
    h += `<span style="font-size:12px;padding:3px 10px;border-radius:4px;background:${PRI_COLOR[r.priority] || "#6b7280"}15;color:${PRI_COLOR[r.priority] || "#6b7280"};font-weight:700">${r.priority}</span></div>`;
    // What this is
    if (r.whatIsIt) h += `<p style="margin:4px 0 8px;font-size:13px;color:#374151;line-height:1.6">${r.whatIsIt}</p>`;
    // Why it matters
    if (r.whyMatters)
      h += `<div style="margin:8px 0;padding:10px 14px;background:#f0fdf4;border-left:3px solid #059669;border-radius:4px"><p style="margin:0;font-size:13px;color:#059669;font-weight:600">WHY IT MATTERS</p><p style="margin:4px 0 0;font-size:13px;color:#374151;line-height:1.6">${r.whyMatters}</p></div>`;
    // What changed
    if (changes?.length) {
      h += `<div style="margin:8px 0;padding:10px 14px;background:#fff7ed;border-left:3px solid #C77700;border-radius:4px"><p style="margin:0 0 6px;font-size:13px;color:#C77700;font-weight:700">WHAT CHANGED</p>`;
      changes.forEach((ch) => {
        h += `<div style="margin-bottom:8px"><p style="margin:0;font-size:12px;font-weight:600;color:#374151">${ch.fields?.join(", ") || ""}</p>`;
        if (ch.prev) h += `<p style="margin:2px 0;font-size:12px;color:#9ca3af;text-decoration:line-through">Was: ${ch.prev}</p>`;
        if (ch.now) h += `<p style="margin:2px 0;font-size:12px;color:#111827;font-weight:500">Now: ${ch.now}</p>`;
        if (ch.impact) h += `<p style="margin:2px 0;font-size:11px;color:#C77700">Impact: ${ch.impact}</p>`;
        h += `</div>`;
      });
      h += `</div>`;
    }
    // Key data
    if (r.keyData?.length)
      h += `<div style="margin:8px 0;padding:10px 14px;background:#f9fafb;border-radius:4px;font-size:12px;color:#374151;line-height:1.7">${r.keyData.map((dd) => `&bull; ${dd}`).join("<br>")}</div>`;
    // Impact scores
    h += `<div style="margin:8px 0;font-size:12px;color:#6b7280">Impact: Cost ${sc.cost}/3 · Compliance ${sc.compliance}/3 · Client ${sc.client}/3 · Operational ${sc.operational}/3 · Urgency: ${urgencyScore(r)}</div>`;
    // Dispute
    if (disp?.note) {
      h += `<div style="margin:8px 0;padding:10px 14px;background:#fff8f1;border-left:3px solid #FF9500;border-radius:4px">`;
      h += `<p style="margin:0 0 4px;font-size:13px;color:#FF9500;font-weight:700">DISPUTED</p>`;
      h += `<p style="margin:0 0 4px;font-size:12px;color:#92400e;line-height:1.6">${disp.note}</p>`;
      h += `</div>`;
    }
    // Timeline
    if (r.timeline?.length) {
      const now = new Date();
      const next = r.timeline
        .map((m) => ({ ...m, dt: new Date(m.date) }))
        .filter((m) => m.dt > now)
        .sort((a, b) => a.dt.getTime() - b.dt.getTime())[0];
      if (next) {
        const days = Math.floor((next.dt.getTime() - now.getTime()) / 864e5);
        h += `<p style="margin:6px 0;font-size:13px;color:${days <= 30 ? "#dc2626" : days <= 60 ? "#C77700" : "#6b7280"}"><strong>Next milestone:</strong> ${next.label} — ${next.date} (${days} days)</p>`;
      }
    }
    // Source
    if (r.url) h += `<p style="margin:6px 0;font-size:12px"><a href="${r.url}" style="color:#2563eb">Source</a></p>`;
    h += `</div>`;
  });

  h += `</div><div style="padding:16px 28px;font-size:12px;color:#9ca3af;background:#f9fafb;border-radius:0 0 8px 8px">Generated by ${APP_NAME} · ${date}</div></div>`;
  return h;
}

// ── Weekly Briefing Email ──
export function toBriefingEmail(
  resources: Resource[],
  date: string,
  changelog: Record<string, ChangeLogEntry[]>,
  disputes: Record<string, Dispute>,
  auditDate: string
): string {
  const newR = resources.filter((r) => r.added === auditDate);
  const critical = [...resources].sort((a, b) => urgencyScore(b) - urgencyScore(a)).slice(0, 5);
  const now = new Date();
  const q = new Date(now.getTime() + 90 * 864e5);
  const due = resources
    .filter((r) =>
      r.timeline?.some((m) => {
        const d = new Date(m.date);
        return d >= now && d <= q;
      })
    )
    .slice(0, 5);
  const disputedEntries = Object.entries(disputes)
    .filter(([, d]) => d.note)
    .map(([id, d]) => ({ ...d, r: resources.find((x) => x.id === id) }))
    .filter((x) => x.r);

  let h = `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1f2937">`;
  h += `<div style="background:#171e19;color:#ffffff;padding:24px 28px;border-radius:8px 8px 0 0"><h1 style="margin:0;font-size:22px;letter-spacing:1px">Weekly Briefing</h1><p style="margin:6px 0 0;font-size:13px;color:#b7c6c2">${date} · ${resources.length} resources tracked · ${APP_NAME}</p></div>`;
  h += `<div style="padding:20px 28px">`;

  // New items
  if (newR.length) {
    h += `<h2 style="font-size:17px;color:#059669;margin:0 0 12px">New This Week (${newR.length})</h2>`;
    newR.forEach((r) => {
      const modes = modeText(r.modes || [r.cat]);
      h += `<div style="margin-bottom:12px;padding:12px 14px;border-left:3px solid #059669;background:#f0fdf4;border-radius:4px">`;
      h += `<p style="margin:0;font-size:14px"><span style="font-size:11px;letter-spacing:1px;color:#6b7280">${modes}</span> <strong>${r.title}</strong> <span style="font-size:11px;padding:2px 6px;border-radius:3px;background:${PRI_COLOR[r.priority] || "#6b7280"}15;color:${PRI_COLOR[r.priority] || "#6b7280"};font-weight:700">${r.priority}</span></p>`;
      if (r.whatIsIt) h += `<p style="margin:6px 0 0;font-size:13px;color:#374151;line-height:1.6">${r.whatIsIt}</p>`;
      if (r.whyMatters) h += `<p style="margin:6px 0 0;font-size:13px;color:#059669;line-height:1.6"><strong>Why:</strong> ${r.whyMatters}</p>`;
      if (r.url) h += `<p style="margin:4px 0 0;font-size:11px"><a href="${r.url}" style="color:#2563eb">Source</a></p>`;
      h += `</div>`;
    });
    h += `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">`;
  }

  // Top urgency
  h += `<h2 style="font-size:17px;color:#dc2626;margin:0 0 12px">Top Urgency</h2>`;
  critical.forEach((r) => {
    const modes = modeText(r.modes || [r.cat]);
    h += `<div style="margin-bottom:8px;padding:8px 12px;border-left:3px solid ${PRI_COLOR[r.priority] || "#6b7280"}">`;
    h += `<p style="margin:0;font-size:13px"><span style="font-size:11px;letter-spacing:1px;color:#6b7280">${modes}</span> <span style="color:${PRI_COLOR[r.priority] || "#6b7280"};font-weight:700">[${r.priority}]</span> <strong>${r.title}</strong></p>`;
    h += `<p style="margin:4px 0 0;font-size:12px;color:#4b5563;line-height:1.5">${r.whyMatters?.slice(0, 200) || r.note}</p>`;
    h += `</div>`;
  });
  h += `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">`;

  // Due this quarter
  if (due.length) {
    h += `<h2 style="font-size:17px;color:#C77700;margin:0 0 12px">Due This Quarter</h2>`;
    due.forEach((r) => {
      const next = r.timeline
        ?.map((m) => ({ ...m, dt: new Date(m.date) }))
        .filter((m) => m.dt >= now && m.dt <= q)
        .sort((a, b) => a.dt.getTime() - b.dt.getTime())[0];
      const days = next ? Math.floor((next.dt.getTime() - now.getTime()) / 864e5) : null;
      h += `<p style="margin:4px 0;font-size:13px">${days !== null ? `<span style="color:${days <= 30 ? "#dc2626" : "#C77700"};font-weight:700">${days}d</span> ` : ""}${r.title}${next ? ` — <strong>${next.label}</strong>` : ""}</p>`;
    });
    h += `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">`;
  }

  // Disputed
  if (disputedEntries.length) {
    h += `<h2 style="font-size:17px;color:#C77700;margin:0 0 12px">Disputed / Watch</h2>`;
    disputedEntries.forEach((x) => {
      h += `<div style="margin-bottom:10px;padding:8px 12px;border-left:3px solid #FF9500;background:#fff8f1;border-radius:4px">`;
      h += `<p style="margin:0;font-size:13px;font-weight:600;color:#92400e">${x.r!.title}</p>`;
      h += `<p style="margin:4px 0;font-size:12px;color:#92400e;line-height:1.5">${x.note.slice(0, 200)}</p>`;
      h += `</div>`;
    });
  }

  h += `</div><div style="padding:16px 28px;font-size:12px;color:#9ca3af;background:#f9fafb;border-radius:0 0 8px 8px">Generated by ${APP_NAME} · ${date}</div></div>`;
  return h;
}

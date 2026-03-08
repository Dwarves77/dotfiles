import { getAdminClient } from "@/lib/supabase-admin";
import { BRIEFING_SYSTEM_PROMPT } from "./prompts";
import { toBriefingEmail } from "@/lib/export/htmlReport";
import { toBriefingSlack } from "@/lib/export/slackFormat";

interface BriefingResult {
  briefing_id: string;
  summary: string;
  talking_points_count: number;
}

export async function generateWeeklyBriefing(): Promise<BriefingResult> {
  const db = getAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

  // Fetch context data
  const [
    { data: resources },
    { data: newChangelog },
    { data: disputes },
    { data: timelines },
  ] = await Promise.all([
    db.from("resources").select("*").eq("is_archived", false),
    db.from("changelog").select("*").gte("date", weekAgo).order("date", { ascending: false }),
    db.from("disputes").select("*").eq("active", true),
    db.from("timelines").select("*"),
  ]);

  if (!resources) throw new Error("Failed to fetch resources");

  // Identify new and modified resources this week
  const newResourceIds = (newChangelog || [])
    .filter((c) => c.type === "NEW")
    .map((c) => c.resource_id);

  const modifiedResourceIds = (newChangelog || [])
    .filter((c) => c.type === "UPDATED")
    .map((c) => c.resource_id);

  // Build deadline context (next 90 days)
  const now = new Date();
  const q = new Date(now.getTime() + 90 * 864e5);
  const upcomingDeadlines = (timelines || [])
    .filter((t) => {
      const d = new Date(t.date);
      return d >= now && d <= q;
    })
    .map((t) => ({
      resource_id: t.resource_id,
      date: t.date,
      label: t.label,
    }));

  // Call Claude API for briefing
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const userPrompt = `Generate a weekly sustainability briefing for freight forwarding leadership.

Date: ${today}

RECENT CHANGES (this week):
New resources: ${JSON.stringify(newResourceIds)}
Modified resources: ${JSON.stringify(modifiedResourceIds)}
Changelog: ${JSON.stringify((newChangelog || []).slice(0, 20))}

TOP URGENCY RESOURCES:
${JSON.stringify(resources.slice(0, 10).map((r) => ({ id: r.id, title: r.title, priority: r.priority })))}

UPCOMING DEADLINES (90 days):
${JSON.stringify(upcomingDeadlines.slice(0, 15))}

ACTIVE DISPUTES:
${JSON.stringify((disputes || []).map((d) => ({ resource_id: d.resource_id, note: d.note })))}

Respond ONLY with JSON. No preamble.`;

  const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: BRIEFING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!claudeResponse.ok) {
    const errBody = await claudeResponse.text();
    throw new Error(`Claude API error: ${claudeResponse.status} ${errBody}`);
  }

  const result = await claudeResponse.json();
  let responseText = "";
  for (const block of result.content || []) {
    if (block.type === "text") responseText += block.text;
  }

  // Parse Claude's response
  let briefingData: { summary: string; talking_points: Array<Record<string, string>> };
  try {
    const cleaned = responseText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    briefingData = JSON.parse(cleaned);
  } catch {
    briefingData = {
      summary: "Briefing generation encountered a parsing issue. Review raw data.",
      talking_points: [],
    };
  }

  // Generate HTML and Slack export content using existing export functions
  // (Simplified — uses the resource data we have)
  const mappedResources = resources.map((r) => ({
    id: r.id,
    cat: r.category,
    sub: r.subcategory || "",
    title: r.title,
    url: r.url || "",
    note: r.note || "",
    type: r.type || "",
    priority: r.priority,
    added: r.added_date,
    reasoning: r.reasoning || "",
    tags: r.tags || [],
    whatIsIt: r.what_is_it || "",
    whyMatters: r.why_matters || "",
    keyData: r.key_data || [],
    modes: r.modes || [],
    topic: r.topic,
    jurisdiction: r.jurisdiction,
  }));

  const changelogMap: Record<string, Array<{ id: string; date: string; type: "NEW" | "UPDATED"; fields?: string[]; prev?: string; now?: string; impact?: string }>> = {};
  (newChangelog || []).forEach((c) => {
    if (!changelogMap[c.resource_id]) changelogMap[c.resource_id] = [];
    changelogMap[c.resource_id].push({
      id: c.resource_id,
      date: c.date,
      type: c.type,
      fields: c.fields,
      prev: c.prev_value,
      now: c.now_value,
      impact: c.impact,
    });
  });

  const disputeMap: Record<string, { resource: string; note: string; sources: { name: string; url: string }[] }> = {};
  (disputes || []).forEach((d) => {
    disputeMap[d.resource_id] = {
      resource: d.resource_id,
      note: d.note,
      sources: (d.sources || []).map((s: string | { name: string; url: string }) =>
        typeof s === "string" ? { name: s, url: "" } : s
      ),
    };
  });

  const htmlContent = toBriefingEmail(mappedResources as any, today, changelogMap, disputeMap, weekAgo);
  const slackContent = toBriefingSlack(mappedResources as any, today, changelogMap, disputeMap, weekAgo);

  // Save to database
  const { data: briefing, error } = await db
    .from("briefings")
    .insert({
      week_date: today,
      title: `Weekly Briefing — ${today}`,
      summary: briefingData.summary,
      talking_points: briefingData.talking_points,
      new_resources: newResourceIds,
      modified_resources: [...new Set(modifiedResourceIds)],
      html_content: htmlContent,
      slack_content: slackContent,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save briefing: ${error.message}`);

  return {
    briefing_id: briefing.id,
    summary: briefingData.summary,
    talking_points_count: briefingData.talking_points?.length || 0,
  };
}

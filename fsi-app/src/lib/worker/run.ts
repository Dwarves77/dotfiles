import { getAdminClient } from "@/lib/supabase-admin";
import { WORKER_SYSTEM_PROMPT, buildWorkerUserPrompt } from "./prompts";

interface WorkerResult {
  batch_id: string;
  updates_count: number;
  errors: string[];
}

// Parse Claude's response text into structured update proposals
function parseClaudeResponse(responseText: string): Array<{
  action: string;
  resource_id: string | null;
  data: Record<string, unknown>;
  reason: string;
  source_url: string;
  confidence: string;
}> {
  // Strip markdown fences if present
  let cleaned = responseText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    // Try to find a JSON array in the response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return [];
      }
    }
    return [];
  }
}

// Send notification (Slack webhook or console log)
async function sendNotification(message: string, batchId: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${message}\nBatch ID: ${batchId}`,
        }),
      });
    } catch (err) {
      console.error("Slack notification failed:", err);
    }
  } else {
    console.log(`[FSI Worker] ${message} (batch: ${batchId})`);
  }
}

export async function runWeeklyUpdate(): Promise<WorkerResult> {
  const batchId = `batch_${Date.now()}`;
  const errors: string[] = [];
  const db = getAdminClient();

  // 1. Fetch current resources and source registry
  const [{ data: resources }, { data: sources }] = await Promise.all([
    db.from("resources").select("id, title, priority, modified_date, added_date, url").eq("is_archived", false),
    db.from("source_registry").select("*").eq("is_active", true),
  ]);

  if (!resources || !sources) {
    throw new Error("Failed to fetch resources or sources from database");
  }

  // 2. Build context strings
  const resourceSummary = resources
    .map((r) => `[${r.id}] ${r.title} | Priority: ${r.priority} | Last modified: ${r.modified_date || r.added_date} | URL: ${r.url}`)
    .join("\n");

  const sourceList = sources
    .map((s) => `${s.name}: ${s.url} (${s.region}, last checked: ${s.last_checked || "never"})`)
    .join("\n");

  // Find last update date
  const { data: lastChangelog } = await db
    .from("changelog")
    .select("date")
    .order("date", { ascending: false })
    .limit(1)
    .single();

  const lastUpdateDate = lastChangelog?.date || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

  // 3. Call Claude API with web search
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const userPrompt = buildWorkerUserPrompt(
    resourceSummary,
    sourceList,
    resources.length,
    sources.length,
    lastUpdateDate
  );

  const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: WORKER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!claudeResponse.ok) {
    const errBody = await claudeResponse.text();
    throw new Error(`Claude API error: ${claudeResponse.status} ${errBody}`);
  }

  const claudeResult = await claudeResponse.json();

  // Extract text from response (may contain multiple content blocks)
  let responseText = "";
  for (const block of claudeResult.content || []) {
    if (block.type === "text") {
      responseText += block.text;
    }
  }

  // 4. Parse response into updates
  const updates = parseClaudeResponse(responseText);

  if (updates.length === 0) {
    await sendNotification("FSI Weekly Update: No changes detected this week.", batchId);
    return { batch_id: batchId, updates_count: 0, errors };
  }

  // 5. Write staged updates
  for (const update of updates) {
    const { error } = await db.from("staged_updates").insert({
      action: update.action,
      resource_id: update.resource_id || null,
      proposed_data: update.data,
      reason: update.reason,
      source_url: update.source_url,
      confidence: update.confidence || "MEDIUM",
      status: "pending",
      batch_id: batchId,
    });

    if (error) {
      errors.push(`Failed to stage ${update.action} for ${update.resource_id}: ${error.message}`);
    }
  }

  // 6. Update source registry timestamps
  const now = new Date().toISOString();
  for (const source of sources) {
    await db
      .from("source_registry")
      .update({ last_checked: now })
      .eq("id", source.id);
  }

  // 7. Notify
  await sendNotification(
    `FSI Weekly Update: ${updates.length} proposed changes staged for review.${errors.length ? ` (${errors.length} errors)` : ""}`,
    batchId
  );

  return { batch_id: batchId, updates_count: updates.length, errors };
}

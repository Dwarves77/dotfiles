"use client";

/**
 * ItemCorrectionsPanel , the admin Corrections panel for one item (lane G7-UI, 2026-10-06, plan Stage 7).
 *
 * The reader's goal: fix a wrong value on one item and know it took effect. The path: pick the thing to correct
 * (a fact, a tag, a connection, a section, the full brief), say why, save. The one primary action in each block is
 * its Save; every other action is quieter. Each block shows the current machine value, any active correction with
 * its reason, who and when, and what pressing the action does. Corrections are listed in full at the foot, where
 * each can be revoked (a separate, confirmed action that restores the machine value).
 *
 * Built on the G7-CORR API (src/lib/corrections/admin-api/logic.mjs): reads the list route, posts the create and
 * revoke routes through model.mjs. No behaviour is added here. Platform admin only: the page that mounts this runs
 * requirePlatformAdmin, and every route runs requireAdminRoute.
 */

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import { ActionButton } from "@/components/ui/ActionRow";
import { SECTION_TITLE_STYLE } from "@/components/ui/section-title-style";
import { CorrectionForm, type FormDraft } from "@/components/admin/corrections/CorrectionForm";
import { CorrectionRow } from "@/components/admin/corrections/CorrectionRow";
import {
  TAG_COLUMNS,
  activeFor,
  columnLabel,
  countByState,
  describeCorrection,
  fetchItemCorrections,
  machineValueOf,
  newestFirst,
  postCorrection,
  postRevoke,
  relationshipLabel,
} from "@/components/admin/corrections/model.mjs";
import type { CorrectionData, Fetcher, ItemTargets, TargetKind, CorrectionOp } from "@/components/admin/corrections/types";

interface OpenForm {
  key: string;
  kind: TargetKind;
  op: CorrectionOp;
  ref: string;
  tagColumn?: string;
  currentText?: string;
  heading: string;
  submitLabel: string;
}

const PAGE = 10;
const clip = (s: string, n = 240) => (s.length > n ? `${s.slice(0, n)}...` : s);

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--line-1)",
  borderRadius: "var(--radius-card)",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minWidth: 0,
};
const h2: React.CSSProperties = { ...SECTION_TITLE_STYLE, fontSize: 18, whiteSpace: "normal", overflowWrap: "anywhere" };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--ink-2)", overflowWrap: "anywhere" };
const rowBox: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8, paddingTop: 12, borderTop: "1px solid var(--line-1)", minWidth: 0 };

export interface ItemCorrectionsPanelProps {
  targets: ItemTargets;
  fetcher?: Fetcher;
}

export function ItemCorrectionsPanel({ targets, fetcher = authedFetch }: ItemCorrectionsPanelProps) {
  const [corrections, setCorrections] = useState<CorrectionData[]>([]);
  const [load, setLoad] = useState<{ state: "loading" | "ready" | "error"; message?: string }>({ state: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenForm | null>(null);
  const [factsShown, setFactsShown] = useState(PAGE);
  const [sectionsShown, setSectionsShown] = useState(PAGE);

  const refresh = useCallback(async () => {
    const out = await fetchItemCorrections(fetcher, targets.item_id);
    if (out.ok) {
      setCorrections(out.corrections as CorrectionData[]);
      setLoad({ state: "ready" });
    } else {
      setLoad({ state: "error", message: out.message });
    }
  }, [fetcher, targets.item_id]);

  useEffect(() => {
    // Initial read of the item's corrections: one synchronization with the API, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const counts = countByState(corrections);

  async function submit(draft: FormDraft): Promise<{ ok: boolean; message?: string }> {
    const out = await postCorrection(fetcher, targets.item_id, draft);
    if (!out.ok) return { ok: false, message: out.message };
    setOpen(null);
    setNotice("Saved. Customers see the corrected value now. To undo it, revoke it under All corrections below and the machine value comes back.");
    await refresh();
    return { ok: true };
  }

  async function revoke(c: CorrectionData, reason: string) {
    const out = await postRevoke(fetcher, targets.item_id, c.id, reason);
    if (!out.ok) return { ok: false, message: out.message };
    setNotice("Revoked. The machine value is back and customers see it now.");
    await refresh();
    return { ok: true };
  }

  const openForm = (f: Omit<OpenForm, "key">) => {
    setNotice(null);
    setOpen({ ...f, key: `${f.kind}|${f.op}|${f.ref}|${f.tagColumn ?? ""}` });
  };
  const isOpen = (kind: TargetKind, op: CorrectionOp, ref: string, tagColumn?: string) =>
    open?.key === `${kind}|${op}|${ref}|${tagColumn ?? ""}`;

  const formFor = (f: OpenForm) => (
    <CorrectionForm
      key={f.key}
      kind={f.kind}
      op={f.op}
      ref={f.ref}
      tagColumn={f.tagColumn}
      currentText={f.currentText}
      itemId={targets.item_id}
      heading={f.heading}
      submitLabel={f.submitLabel}
      onSubmit={submit}
      onCancel={() => setOpen(null)}
      fetcher={fetcher}
    />
  );

  /** What an active correction on a target says, in a line under the target's value. */
  const activeNote = (kind: TargetKind, ref: string) => {
    const c = activeFor(corrections, kind, ref);
    if (!c) return null;
    const machine = machineValueOf(c);
    const machineText = machine ? String((machine as Record<string, unknown>).claim_text ?? (machine as Record<string, unknown>).content_md ?? (machine as Record<string, unknown>).text ?? "") : "";
    return (
      <div role="note" style={{ ...muted, borderLeft: "3px solid var(--brand)", paddingLeft: 10 }}>
        <strong>{describeCorrection(c)}.</strong> Reason: {c.reason}
        {machineText ? ` Machine value was: ${clip(machineText, 160)}` : ""}
      </div>
    );
  };

  const history = newestFirst(corrections);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <div style={{ ...card, gap: 8 }}>
        <h1 data-guard-title style={{ ...SECTION_TITLE_STYLE, whiteSpace: "normal", overflowWrap: "anywhere" }}>
          Corrections to {targets.title}
        </h1>
        <div style={muted}>
          {load.state === "loading" && "Loading corrections..."}
          {load.state === "ready" && `${counts.active} active, ${counts.revoked} revoked, ${counts.orphaned} orphaned.`}
        </div>
        {load.state === "error" && (
          <div role="alert" style={{ fontSize: 12, color: "var(--color-error)", overflowWrap: "anywhere" }}>
            {load.message} <ActionButton onClick={() => void refresh()}>Try again</ActionButton>
          </div>
        )}
        {counts.orphaned > 0 && (
          <div role="note" style={{ ...muted, color: "var(--ink)" }}>
            {counts.orphaned} {counts.orphaned === 1 ? "correction no longer matches" : "corrections no longer match"} a fact on this item. They are listed under All corrections with what to do.
          </div>
        )}
        {notice && (
          <div role="status" style={{ fontSize: 13, color: "var(--ink)", background: "var(--tag)", padding: "9px 12px", borderRadius: 6, overflowWrap: "anywhere" }}>
            {notice}
          </div>
        )}
      </div>

      <section style={card} aria-labelledby="corr-facts">
        <h2 id="corr-facts" data-guard-title style={h2}>Facts</h2>
        <div style={muted}>Each fact can be hidden from customers or replaced with a source backed one. Nothing is deleted.</div>
        {targets.facts.length === 0 && <div style={muted}>This item has no facts that can be corrected.</div>}
        {targets.facts.slice(0, factsShown).map((f) => (
          <div key={f.id} style={rowBox}>
            <div style={{ fontSize: 13, color: "var(--ink)", overflowWrap: "anywhere" }}>{clip(f.claim_text)}</div>
            {activeNote("fact", f.id)}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <ActionButton onClick={() => openForm({ kind: "fact", op: "suppress", ref: f.id, heading: "Hide this fact from customers", submitLabel: "Hide fact" })}>Hide</ActionButton>
              <ActionButton onClick={() => openForm({ kind: "fact", op: "replace", ref: f.id, currentText: f.claim_text, heading: "Replace this fact", submitLabel: "Replace fact" })}>Replace</ActionButton>
            </div>
            {open && (isOpen("fact", "suppress", f.id) || isOpen("fact", "replace", f.id)) && formFor(open)}
          </div>
        ))}
        {targets.facts.length > factsShown && (
          <div>
            <ActionButton onClick={() => setFactsShown((n) => n + PAGE)}>Show more facts ({targets.facts.length - factsShown} left)</ActionButton>
          </div>
        )}
      </section>

      <section style={card} aria-labelledby="corr-tags">
        <h2 id="corr-tags" data-guard-title style={h2}>Tags</h2>
        {TAG_COLUMNS.map((col: string) => {
          const tags = (targets.tags as Record<string, string[]>)[col] ?? [];
          return (
            <div key={col} style={rowBox}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{columnLabel(col)}</div>
              {tags.length === 0 && <div style={muted}>None on this item.</div>}
              {tags.map((t) => (
                <div key={t} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: "var(--ink)", overflowWrap: "anywhere", minWidth: 0 }}>{t}</span>
                    <ActionButton onClick={() => openForm({ kind: "tag", op: "remove", ref: `${col}:${t}`, heading: `Remove the tag ${t}`, submitLabel: "Remove tag" })}>Remove</ActionButton>
                  </div>
                  {activeNote("tag", `${col}:${t}`)}
                  {open && isOpen("tag", "remove", `${col}:${t}`) && formFor(open)}
                </div>
              ))}
              <div>
                <ActionButton onClick={() => openForm({ kind: "tag", op: "add", ref: "", tagColumn: col, heading: `Add a tag to ${columnLabel(col).toLowerCase()}`, submitLabel: "Add tag" })}>Add a tag</ActionButton>
              </div>
              {open && isOpen("tag", "add", "", col) && formFor(open)}
            </div>
          );
        })}
      </section>

      <section style={card} aria-labelledby="corr-conn">
        <h2 id="corr-conn" data-guard-title style={h2}>Connections</h2>
        {targets.connections.length === 0 && <div style={muted}>No connections to other items yet.</div>}
        {targets.connections.map((c) => (
          <div key={c.other_item_id} style={rowBox}>
            <div style={{ fontSize: 13, color: "var(--ink)", overflowWrap: "anywhere" }}>
              {relationshipLabel(c.relationship)} {c.other_title}
            </div>
            {activeNote("connection", c.other_item_id)}
            <div>
              <ActionButton onClick={() => openForm({ kind: "connection", op: "remove", ref: c.other_item_id, heading: "Remove this connection", submitLabel: "Remove connection" })}>Remove</ActionButton>
            </div>
            {open && isOpen("connection", "remove", c.other_item_id) && formFor(open)}
          </div>
        ))}
        <div style={rowBox}>
          <div>
            <ActionButton onClick={() => openForm({ kind: "connection", op: "add", ref: "", heading: "Add a connection to another item", submitLabel: "Add connection" })}>Add a connection</ActionButton>
          </div>
          {open && isOpen("connection", "add", "") && formFor(open)}
        </div>
      </section>

      <section style={card} aria-labelledby="corr-sections">
        <h2 id="corr-sections" data-guard-title style={h2}>Section text</h2>
        {targets.sections.length === 0 && <div style={muted}>This item has no sections.</div>}
        {targets.sections.slice(0, sectionsShown).map((s) => (
          <div key={s.section_key} style={rowBox}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", overflowWrap: "anywhere" }}>{s.section_key.replace(/_/g, " ")}</div>
            <div style={{ fontSize: 13, color: "var(--ink)", overflowWrap: "anywhere" }}>{clip(s.content_md)}</div>
            {activeNote("section_text", s.section_key)}
            <div>
              <ActionButton onClick={() => openForm({ kind: "section_text", op: "replace", ref: s.section_key, currentText: s.content_md, heading: "Replace the text of this section", submitLabel: "Replace section text" })}>Replace text</ActionButton>
            </div>
            {open && isOpen("section_text", "replace", s.section_key) && formFor(open)}
          </div>
        ))}
        {targets.sections.length > sectionsShown && (
          <div>
            <ActionButton onClick={() => setSectionsShown((n) => n + PAGE)}>Show more sections ({targets.sections.length - sectionsShown} left)</ActionButton>
          </div>
        )}
      </section>

      <section style={card} aria-labelledby="corr-brief">
        <h2 id="corr-brief" data-guard-title style={h2}>Full brief</h2>
        <div style={{ fontSize: 13, color: "var(--ink)", overflowWrap: "anywhere" }}>{targets.full_brief ? clip(targets.full_brief, 400) : "This item has no full brief."}</div>
        {activeNote("full_brief", "full_brief")}
        <div>
          <ActionButton onClick={() => openForm({ kind: "full_brief", op: "replace", ref: "full_brief", currentText: targets.full_brief, heading: "Replace the full brief", submitLabel: "Replace full brief" })}>Replace the brief</ActionButton>
        </div>
        {open && isOpen("full_brief", "replace", "full_brief") && formFor(open)}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }} aria-labelledby="corr-all">
        <h2 id="corr-all" data-guard-title style={h2}>All corrections</h2>
        {load.state === "ready" && history.length === 0 && <div style={muted}>No corrections have been made on this item. Every value shown is the machine value.</div>}
        {history.map((c) => (
          <CorrectionRow key={c.id} correction={c} onRevoke={revoke} />
        ))}
      </section>
    </div>
  );
}

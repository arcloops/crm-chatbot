"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Alert, Badge, Button, EmptyState, Select } from "@/components/ui";
import { apiFetch, can } from "@/lib/api";

type Conversation = {
  id: string;
  phoneE164: string;
  humanTakeover: boolean;
  botEnabled: boolean;
  escalatedAt?: string | null;
  escalationSummary?: string | null;
  prospect?: {
    name: string;
    prospectCode: string;
    leadStage: string;
    preferredLocation?: string | null;
    budgetMax?: string | null;
    intent?: string | null;
    notes?: string | null;
    viewingAt?: string | null;
    viewingNote?: string | null;
    assignedBroker?: { name: string } | null;
    viewingRequests?: Array<{
      id: string;
      preferredDate?: string | null;
      preferredTime?: string | null;
      status: string;
      listing?: { listingCode: string; title: string; location: string } | null;
    }>;
  } | null;
  _count?: { messages: number };
};

type Message = {
  id: string;
  direction: "IN" | "OUT";
  type: string;
  body?: string | null;
  status: string;
  createdAt: string;
};

export default function InboxPage() {
  const { user } = useAuth();
  const canWrite = can(user, "inbox:write");
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [reply, setReply] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function loadList() {
    const qs = filter ? `?filter=${filter}` : "";
    const res = await apiFetch<{ data: Conversation[] }>(`/inbox/conversations${qs}`);
    setRows(res.data);
  }

  async function loadThread(id: string) {
    setSelectedId(id);
    setSuggestion("");
    const res = await apiFetch<{
      conversation: Conversation & { messages: Message[] };
    }>(`/inbox/conversations/${id}`);
    setConversation(res.conversation);
    setMessages(res.conversation.messages);
  }

  useEffect(() => {
    loadList().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, [filter]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function onReply(e?: FormEvent) {
    e?.preventDefault();
    if (!selectedId || !reply.trim() || sending) return;
    setError(null);
    setSending(true);
    try {
      await apiFetch(`/inbox/conversations/${selectedId}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: reply.trim() }),
      });
      setReply("");
      await loadThread(selectedId);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reply failed");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function takeover() {
    if (!selectedId) return;
    await apiFetch(`/inbox/conversations/${selectedId}/takeover`, {
      method: "POST",
    });
    await loadThread(selectedId);
    await loadList();
  }

  async function release() {
    if (!selectedId) return;
    await apiFetch(`/inbox/conversations/${selectedId}/release`, {
      method: "POST",
    });
    await loadThread(selectedId);
    await loadList();
  }

  async function suggest() {
    if (!selectedId) return;
    const res = await apiFetch<{ suggestion: string }>(
      `/inbox/conversations/${selectedId}/suggest`,
      { method: "POST" },
    );
    setSuggestion(res.suggestion);
    setReply(res.suggestion);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg)]">
      {error ? (
        <div className="shrink-0 border-b border-[var(--border)] px-4 py-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Conversation list */}
        <aside
          className={`flex min-h-0 w-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] sm:w-80 lg:w-96 ${
            selectedId ? "hidden sm:flex" : "flex"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h1 className="text-lg font-semibold text-[var(--fg)]">Inbox</h1>
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-auto min-w-[8rem] py-1.5 text-xs"
            >
              <option value="">All</option>
              <option value="escalated">Escalated</option>
              <option value="takeover">Takeover</option>
            </Select>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No conversations" />
              </div>
            ) : (
              <ul>
                {rows.map((c) => {
                  const active = selectedId === c.id;
                  return (
                    <li key={c.id} className="border-b border-[var(--border-subtle)]">
                      <button
                        type="button"
                        className={`w-full px-4 py-3 text-left transition-colors ${
                          active
                            ? "bg-[var(--accent-muted)]"
                            : "hover:bg-[var(--surface-elevated)]"
                        }`}
                        onClick={() => void loadThread(c.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`truncate text-sm ${active ? "font-semibold text-[var(--accent)]" : "font-medium text-[var(--fg)]"}`}
                          >
                            {c.prospect?.name ?? c.phoneE164}
                          </p>
                          <span className="shrink-0 text-[11px] text-[var(--fg-faint)]">
                            {c._count?.messages ?? 0}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[var(--fg-muted)]">
                          {c.phoneE164}
                          {c.humanTakeover ? " · takeover" : ""}
                          {c.escalatedAt ? " · escalated" : ""}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Thread pane */}
        <section
          className={`min-h-0 min-w-0 flex-1 flex-col ${
            selectedId ? "flex" : "hidden sm:flex"
          }`}
        >
          {!conversation ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-base font-semibold text-[var(--fg)]">Select a conversation</p>
              <p className="max-w-sm text-sm text-[var(--fg-muted)]">
                Choose a thread from the list to view messages and reply.
              </p>
            </div>
          ) : (
            <>
              <header className="glass-panel metal-edge flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3">
                <button
                  type="button"
                  className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-sm text-[var(--fg-muted)] hover:bg-[var(--surface-elevated)] sm:hidden"
                  onClick={() => {
                    setSelectedId("");
                    setConversation(null);
                    setMessages([]);
                  }}
                >
                  Back
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[var(--fg)]">
                    {conversation.prospect?.name ?? conversation.phoneE164}
                  </p>
                  <p className="truncate text-xs text-[var(--fg-muted)]">
                    {conversation.phoneE164}
                    {conversation.prospect?.prospectCode
                      ? ` · ${conversation.prospect.prospectCode}`
                      : ""}
                    {conversation.prospect?.leadStage
                      ? ` · ${conversation.prospect.leadStage}`
                      : ""}
                    {conversation.prospect?.assignedBroker
                      ? ` · ${conversation.prospect.assignedBroker.name}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {conversation.humanTakeover ? (
                    <Badge tone="warning">Takeover</Badge>
                  ) : (
                    <Badge tone="accent">Bot</Badge>
                  )}
                  {conversation.escalatedAt ? (
                    <Badge tone="danger">Escalated</Badge>
                  ) : null}
                  {canWrite ? (
                    <>
                      <Button variant="secondary" onClick={() => void takeover()}>
                        Take over
                      </Button>
                      <Button variant="secondary" onClick={() => void release()}>
                        Release
                      </Button>
                      <Button variant="secondary" onClick={() => void suggest()}>
                        Suggest
                      </Button>
                    </>
                  ) : null}
                </div>
              </header>

              {conversation.escalationSummary ? (
                <div className="shrink-0 border-b border-[var(--border)] bg-[var(--warning-muted)] px-4 py-2 text-xs text-[var(--warning)]">
                  {conversation.escalationSummary}
                </div>
              ) : null}

              {conversation.prospect ? (
                <div className="shrink-0 space-y-1 border-b border-[var(--border)] bg-[var(--bg)]/50 px-4 py-2 text-xs text-[var(--fg-muted)]">
                  <p>
                    {[
                      conversation.prospect.preferredLocation
                        ? `Area: ${conversation.prospect.preferredLocation}`
                        : null,
                      conversation.prospect.budgetMax
                        ? `Budget max: ${conversation.prospect.budgetMax}`
                        : null,
                      conversation.prospect.intent
                        ? `Intent: ${conversation.prospect.intent}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") ||
                      "Qualification not captured yet — appears after the prospect shares area, budget, or buy/rent (Chat staff tests do not update Inbox)."}
                  </p>
                  {conversation.prospect.notes ? (
                    <p className="text-[var(--fg-faint)]">Notes: {conversation.prospect.notes}</p>
                  ) : null}
                  {conversation.prospect.viewingNote ||
                  conversation.prospect.viewingRequests?.length ? (
                    <p>
                      Viewing:{" "}
                      {conversation.prospect.viewingRequests?.[0]
                        ? [
                            conversation.prospect.viewingRequests[0].listing?.listingCode,
                            conversation.prospect.viewingRequests[0].preferredDate,
                            conversation.prospect.viewingRequests[0].preferredTime,
                            conversation.prospect.viewingRequests[0].status,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : conversation.prospect.viewingNote}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div
                className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
                style={{ background: "var(--chat-bg)" }}
              >
                <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
                  {messages.map((m) => {
                    const isOut = m.direction === "OUT";
                    return (
                      <div
                        key={m.id}
                        className={`bubble-enter flex ${isOut ? "justify-end" : "justify-start"}`}
                      >
                        <div
className={`max-w-[78%] px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap shadow-sm ${
                          isOut
                            ? "rounded-[20px] rounded-br-md bg-[var(--chat-bubble-out)] text-[var(--chat-bubble-out-fg)]"
                            : "rounded-[20px] rounded-bl-md bg-[var(--chat-bubble-in)] text-[var(--fg)]"
                        }`}
                        >
                          <p>{m.body ?? "—"}</p>
                          <p
                            className={`mt-1 text-[10px] ${isOut ? "text-white/70" : "text-[var(--fg-faint)]"}`}
                          >
                            {m.status} ·{" "}
                            {new Date(m.createdAt).toLocaleString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </div>

              <form
                onSubmit={onReply}
                className="flex shrink-0 items-end gap-2 border-t border-[var(--border)] bg-[var(--surface)]/85 px-3 py-3 backdrop-blur-md sm:px-4"
              >
                {canWrite ? (
                  <>
                    <div className="flex min-w-0 flex-1 items-end rounded-[22px] border border-[var(--border)] bg-[var(--bg)] px-4 py-2 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]">
                      <textarea
                        ref={inputRef}
                        rows={1}
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void onReply();
                          }
                        }}
                        placeholder="Aa"
                        disabled={sending}
                        className="max-h-32 min-h-[24px] w-full resize-none bg-transparent text-[15px] text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sending || !reply.trim()}
                      aria-label="Send reply"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--chat-bubble-out)] text-[var(--chat-bubble-out-fg)] shadow-[var(--shadow-glow)] transition-all duration-[var(--duration-fast)] hover:scale-105 hover:opacity-95 disabled:pointer-events-none disabled:opacity-40 disabled:hover:scale-100"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <p className="w-full py-2 text-center text-sm text-[var(--fg-muted)]">
                    Write permission required to reply.
                  </p>
                )}
              </form>
              {suggestion ? (
                <p className="shrink-0 px-4 pb-2 text-center text-[11px] text-[var(--fg-faint)]">
                  AI suggestion loaded into the composer
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

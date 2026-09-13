"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, Field, PageHeader, Select, TextArea } from "@/components/ui";
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
    assignedBroker?: { name: string } | null;
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

  async function loadList() {
    const qs = filter ? `?filter=${filter}` : "";
    const res = await apiFetch<{ data: Conversation[] }>(`/inbox/conversations${qs}`);
    setRows(res.data);
  }

  async function loadThread(id: string) {
    setSelectedId(id);
    const res = await apiFetch<{
      conversation: Conversation & { messages: Message[] };
    }>(`/inbox/conversations/${id}`);
    setConversation(res.conversation);
    setMessages(res.conversation.messages);
  }

  useEffect(() => {
    loadList().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, [filter]);

  async function onReply(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    try {
      await apiFetch(`/inbox/conversations/${selectedId}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: reply }),
      });
      setReply("");
      await loadThread(selectedId);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reply failed");
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
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description="Support threads, human takeover, and agent replies."
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <Field label="Filter">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All</option>
              <option value="escalated">Escalated</option>
              <option value="takeover">Takeover</option>
            </Select>
          </Field>
          <ul className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto text-sm">
            {rows.length === 0 ? (
              <li className="text-zinc-500">No conversations.</li>
            ) : (
              rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`w-full rounded-md px-2 py-2 text-left hover:bg-zinc-100 ${
                      selectedId === c.id ? "bg-zinc-100 font-medium" : ""
                    }`}
                    onClick={() => void loadThread(c.id)}
                  >
                    <div>{c.phoneE164}</div>
                    <div className="text-xs text-zinc-500">
                      {c.prospect?.name ?? "Unknown"} · {c._count?.messages ?? 0} msgs
                      {c.humanTakeover ? " · takeover" : ""}
                      {c.escalatedAt ? " · escalated" : ""}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">Thread</h2>
          {!conversation ? (
            <p className="text-sm text-zinc-500">Select a conversation.</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-zinc-600">
                {conversation.prospect?.prospectCode} · {conversation.prospect?.leadStage}
                {conversation.prospect?.assignedBroker
                  ? ` · Broker: ${conversation.prospect.assignedBroker.name}`
                  : ""}
              </p>
              {conversation.escalationSummary ? (
                <p className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                  {conversation.escalationSummary}
                </p>
              ) : null}
              <ul className="mb-3 max-h-80 space-y-2 overflow-y-auto text-sm">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-md px-2 py-1 ${
                      m.direction === "OUT" ? "bg-zinc-100" : "bg-emerald-50"
                    }`}
                  >
                    <div className="text-xs text-zinc-500">
                      {m.direction} · {m.status}
                    </div>
                    <div className="whitespace-pre-wrap">{m.body ?? "—"}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">Agent actions</h2>
          {canWrite && selectedId ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void takeover()}>
                  Take over
                </Button>
                <Button variant="secondary" onClick={() => void release()}>
                  Release to bot
                </Button>
                <Button variant="secondary" onClick={() => void suggest()}>
                  Suggest reply
                </Button>
              </div>
              {suggestion ? (
                <p className="text-xs text-zinc-500">Suggestion loaded into reply box.</p>
              ) : null}
              <form onSubmit={onReply} className="space-y-2">
                <Field label="Reply">
                  <TextArea
                    rows={5}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    required
                  />
                </Field>
                <Button type="submit">Send reply</Button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              {canWrite ? "Select a thread." : "Write permission required."}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

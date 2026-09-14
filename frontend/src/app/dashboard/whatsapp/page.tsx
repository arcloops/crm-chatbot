"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  statusTone,
  TextArea,
} from "@/components/ui";
import { apiFetch, can } from "@/lib/api";

type Template = {
  id: string;
  name: string;
  language: string;
  status: string;
  bodyPreview: string;
};

type Conversation = {
  id: string;
  phoneE164: string;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  windowExpiresAt?: string | null;
  prospect?: { id: string; name: string; prospectCode: string } | null;
  _count?: { messages: number };
};

type Message = {
  id: string;
  direction: "IN" | "OUT";
  type: string;
  body?: string | null;
  templateName?: string | null;
  status: string;
  createdAt: string;
};

export default function WhatsAppLabPage() {
  const { user } = useAuth();
  const canWrite = can(user, "contacts:write");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [windowOpen, setWindowOpen] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("+8801711000003");
  const [sendType, setSendType] = useState<"TEXT" | "TEMPLATE">("TEMPLATE");
  const [body, setBody] = useState("Hello from Arcloops mock WhatsApp");
  const [templateName, setTemplateName] = useState("");
  const [inboundBody, setInboundBody] = useState("Hi, I'm interested in Banani");

  async function loadLists() {
    const [tpl, conv] = await Promise.all([
      apiFetch<{ data: Template[] }>("/whatsapp/templates"),
      apiFetch<{ data: Conversation[] }>("/whatsapp/conversations"),
    ]);
    setTemplates(tpl.data);
    setConversations(conv.data);
    if (!templateName && tpl.data[0]) setTemplateName(tpl.data[0].name);
  }

  async function loadThread(id: string) {
    setSelectedId(id);
    const res = await apiFetch<{
      conversation: Conversation;
      messages: Message[];
      windowOpen: boolean;
    }>(`/whatsapp/conversations/${id}/messages`);
    setConversation(res.conversation);
    setMessages(res.messages);
    setWindowOpen(res.windowOpen);
    setPhone(res.conversation.phoneE164);
  }

  useEffect(() => {
    loadLists().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/whatsapp/send", {
        method: "POST",
        body: JSON.stringify({
          to: phone,
          type: sendType,
          body: sendType === "TEXT" ? body : undefined,
          templateName: sendType === "TEMPLATE" ? templateName : undefined,
        }),
      });
      await loadLists();
      const match = (
        await apiFetch<{ data: Conversation[] }>("/whatsapp/conversations")
      ).data.find(
        (c) =>
          c.phoneE164 === phone ||
          c.phoneE164.includes(phone.replace(/\D/g, "").slice(-10)),
      );
      if (match) await loadThread(match.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    }
  }

  async function onInbound(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{
        conversation: Conversation & { messages: Message[] };
      }>("/whatsapp/mock/inbound", {
        method: "POST",
        body: JSON.stringify({ from: phone, body: inboundBody }),
      });
      await loadLists();
      if (res.conversation?.id) await loadThread(res.conversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inbound failed");
    }
  }

  function windowRemaining() {
    if (!conversation?.windowExpiresAt) {
      return "No open window (send template first or simulate inbound)";
    }
    if (!windowOpen) return "Window closed";
    return `Open until ${new Date(conversation.windowExpiresAt).toLocaleString()}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp Lab"
        description="Mock BSP send/receive for development. Live Twilio deferred."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium">Send</h2>
          {canWrite ? (
            <form onSubmit={onSend} className="space-y-3">
              <Field label="To (phone)">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </Field>
              <Field label="Type">
                <Select
                  value={sendType}
                  onChange={(e) => setSendType(e.target.value as "TEXT" | "TEMPLATE")}
                >
                  <option value="TEMPLATE">TEMPLATE</option>
                  <option value="TEXT">TEXT (requires open 24h window)</option>
                </Select>
              </Field>
              {sendType === "TEMPLATE" ? (
                <Field label="Template">
                  <Select
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name} ({t.language})
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field label="Body">
                  <TextArea
                    rows={3}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </Field>
              )}
              <Button type="submit">Send</Button>
            </form>
          ) : (
            <p className="text-sm text-[var(--fg-muted)]">Write permission required to send.</p>
          )}

          <div className="mt-6">
            <h3 className="mb-2 text-sm font-medium">Templates</h3>
            {templates.length === 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">No templates seeded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {templates.map((t) => (
                  <li key={t.id}>
                    <span className="font-medium">{t.name}</span>{" "}
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    <span className="text-[var(--fg-muted)]"> — {t.bodyPreview}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">Simulate inbound</h2>
          {canWrite ? (
            <form onSubmit={onInbound} className="space-y-3">
              <Field label="From phone">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </Field>
              <Field label="Message">
                <TextArea
                  rows={3}
                  value={inboundBody}
                  onChange={(e) => setInboundBody(e.target.value)}
                />
              </Field>
              <Button type="submit" variant="secondary">
                Inject inbound
              </Button>
            </form>
          ) : (
            <p className="text-sm text-[var(--fg-muted)]">Write permission required.</p>
          )}
          <p className="mt-4 text-sm text-[var(--fg-muted)]">
            Session window: {windowRemaining()}
          </p>
          <p className="text-sm text-[var(--fg-faint)]">
            Window open: {windowOpen ? "yes" : "no"}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 font-medium">Conversations</h2>
          {conversations.length === 0 ? (
            <EmptyState title="No conversations yet" />
          ) : (
            <ul className="space-y-2 text-sm">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`text-[var(--accent)] underline-offset-2 hover:underline ${
                      selectedId === c.id ? "font-semibold" : ""
                    }`}
                    onClick={() => void loadThread(c.id)}
                  >
                    {c.phoneE164}
                  </button>
                  <span className="text-[var(--fg-muted)]">
                    {" "}
                    · {c._count?.messages ?? 0} msgs
                    {c.prospect ? ` · ${c.prospect.name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-medium">Thread</h2>
          {messages.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">Select a conversation.</p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-md px-2 py-1 ${
                    m.direction === "OUT" ? "bg-slate-100" : "bg-[var(--success-muted)]"
                  }`}
                >
                  <div className="text-xs text-[var(--fg-faint)]">
                    {m.direction} · {m.type} · {m.status}
                  </div>
                  <div>{m.body ?? m.templateName ?? "—"}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-medium">Tips</h2>
          <ol className="list-decimal space-y-2 pl-4 text-sm text-[var(--fg-muted)]">
            <li>Send a template to open outbound delivery without a window.</li>
            <li>Inject inbound to open the 24h session window.</li>
            <li>Then send free-form TEXT while the window is open.</li>
            <li>Suppressed phones are blocked on send.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

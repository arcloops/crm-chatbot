"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { apiFetch } from "@/lib/api";

type ListingHit = {
  listingCode: string;
  title: string;
  location: string;
  price: string;
  currency: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: {
    escalate?: boolean;
    bookViewing?: boolean;
    listings?: ListingHit[];
  };
};

type ChatResponse = {
  agent: string;
  anthropicConfigured: boolean;
  reply: string;
  escalate: boolean;
  bookViewing: boolean;
  listings: ListingHit[];
};

type StatusResponse = {
  agent: string;
  anthropicConfigured: boolean;
};

export default function BotPlaygroundPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [phone, setPhone] = useState("+8801999000001");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<StatusResponse>("/agent/status")
      .then(setStatus)
      .catch(() => setStatus({ agent: "unknown", anthropicConfigured: false }));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setInput("");
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await apiFetch<ChatResponse>("/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          phoneE164: phone.trim() || "+8801999000001",
          history,
        }),
      });
      setStatus({
        agent: res.agent,
        anthropicConfigured: res.anthropicConfigured,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: res.reply,
          meta: {
            escalate: res.escalate,
            bookViewing: res.bookViewing,
            listings: res.listings,
          },
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bot playground"
        description="Chat with the same property assistant used on WhatsApp (Claude when ANTHROPIC_API_KEY is set). No WhatsApp messages are sent."
        actions={
          <Button variant="secondary" onClick={clearChat} disabled={!messages.length}>
            Clear chat
          </Button>
        }
      />

      {status ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--fg-muted)]">Agent:</span>
          <Badge tone={status.agent === "claude" ? "accent" : "neutral"}>
            {status.agent}
          </Badge>
          <Badge tone={status.anthropicConfigured ? "success" : "warning"}>
            {status.anthropicConfigured
              ? "Anthropic key configured"
              : "Using MockAgent (set ANTHROPIC_API_KEY for Claude)"}
          </Badge>
        </div>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[var(--fg)]">Session</h2>
          <Field label="Test phone (E.164)">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+8801…"
            />
          </Field>
          <p className="mt-3 text-xs text-[var(--fg-faint)]">
            Same agent path as inbound WhatsApp. Try location, budget, listing codes,
            “book a viewing”, or “talk to broker”.
          </p>
        </Card>

        <Card className={`flex min-h-[28rem] flex-col !p-0`}>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && !sending ? (
              <EmptyState
                title="Start a conversation"
                description="Messages stay in this browser session only — nothing is sent on WhatsApp."
              />
            ) : null}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                      : "border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)]"
                  }`}
                >
                  <p>{m.content}</p>
                  {m.meta?.escalate ? (
                    <p className="mt-2 text-xs opacity-80">Flag: escalate to broker</p>
                  ) : null}
                  {m.meta?.bookViewing ? (
                    <p className="mt-2 text-xs opacity-80">Flag: viewing interest</p>
                  ) : null}
                  {m.meta?.listings?.length ? (
                    <ul className="mt-2 space-y-1 border-t border-black/10 pt-2 text-xs opacity-90">
                      {m.meta.listings.map((l) => (
                        <li key={l.listingCode}>
                          {l.listingCode} · {l.title} · {l.location} · {l.currency}{" "}
                          {l.price}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ))}
            {sending ? (
              <div className="flex justify-start">
                <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                  <Spinner label="Assistant typing…" />
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={onSend}
            className="flex gap-2 border-t border-[var(--border)] px-4 py-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type as a WhatsApp prospect…"
              disabled={sending}
              className="flex-1"
            />
            <Button type="submit" disabled={sending || !input.trim()}>
              Send
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

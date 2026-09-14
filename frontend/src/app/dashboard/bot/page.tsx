"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Alert, Badge } from "@/components/ui";
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

type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
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

const STORAGE_KEY = "arxcrm-chat-sessions";

function BotAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-7" : "size-10";
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-[var(--palette-slate)] text-xs font-semibold text-[var(--palette-cream)] shadow-sm`}
      aria-hidden
    >
      A
    </div>
  );
}

function newSession(): ChatSession {
  return {
    id: `s-${Date.now()}`,
    title: "New chat",
    updatedAt: Date.now(),
    messages: [],
  };
}

function titleFromMessages(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New chat";
  const t = first.content.trim().replace(/\s+/g, " ");
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 40)));
}

export default function BotPlaygroundPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch<StatusResponse>("/agent/status")
      .then(setStatus)
      .catch(() => setStatus({ agent: "unknown", anthropicConfigured: false }));
  }, []);

  useEffect(() => {
    const stored = loadSessions();
    if (stored.length) {
      setSessions(stored);
      setActiveId(stored[0].id);
      setMessages(stored[0].messages);
    } else {
      const s = newSession();
      setSessions([s]);
      setActiveId(s.id);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !activeId) return;
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.id === activeId
          ? {
              ...s,
              messages,
              title: titleFromMessages(messages),
              updatedAt: Date.now(),
            }
          : s,
      );
      saveSessions(next);
      return next;
    });
  }, [messages, activeId, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  function startNewChat() {
    const s = newSession();
    setSessions((prev) => {
      const next = [s, ...prev];
      saveSessions(next);
      return next;
    });
    setActiveId(s.id);
    setMessages([]);
    setError(null);
    setInput("");
    setPanelOpen(false);
    inputRef.current?.focus();
  }

  function selectSession(id: string) {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    setActiveId(id);
    setMessages(s.messages);
    setError(null);
    setInput("");
    setPanelOpen(false);
  }

  function deleteSession(id: string) {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (!next.length) {
        const s = newSession();
        saveSessions([s]);
        setActiveId(s.id);
        setMessages([]);
        return [s];
      }
      saveSessions(next);
      if (id === activeId) {
        setActiveId(next[0].id);
        setMessages(next[0].messages);
      }
      return next;
    });
    setError(null);
  }

  async function onSend(e?: FormEvent) {
    e?.preventDefault();
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
      inputRef.current?.focus();
    }
  }

  const agentLabel = status?.agent === "claude" ? "Claude" : "Mock assistant";
  const onlineLabel = status?.anthropicConfigured
    ? "Active · Anthropic"
    : "Active · Mock";

  const historyList = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  const sidePanel = (
    <aside className="flex h-full w-full flex-col border-[var(--border)] bg-[var(--bg)]/40 md:w-64 md:border-l">
      <div className="shrink-0 space-y-3 border-b border-[var(--border)] p-3">
        <button
          type="button"
          onClick={startNewChat}
          className="btn-shine w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--fg)] transition-all hover:bg-[var(--surface-elevated)]"
        >
          New chat
        </button>
        <div className="space-y-2">
          <p className="px-0.5 text-[10px] font-semibold tracking-wider text-[var(--fg-faint)] uppercase">
            Settings
          </p>
          <div className="flex flex-wrap gap-1.5">
            {status ? (
              <>
                <Badge tone={status.agent === "claude" ? "accent" : "neutral"}>
                  {status.agent}
                </Badge>
                <Badge tone={status.anthropicConfigured ? "success" : "warning"}>
                  {status.anthropicConfigured ? "Anthropic" : "Mock"}
                </Badge>
              </>
            ) : null}
          </div>
          {user ? (
            <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)]/80 px-2.5 py-2">
              <p className="truncate text-sm font-medium text-[var(--fg)]">{user.name}</p>
              <p className="truncate text-[11px] text-[var(--fg-muted)]">{user.email}</p>
              <p className="mt-0.5 text-[10px] tracking-wide text-[var(--fg-faint)] uppercase">
                {user.role.replace(/_/g, " ")}
              </p>
            </div>
          ) : null}
          <p className="text-[11px] leading-snug text-[var(--fg-faint)]">
            Chat as your logged-in staff account with the Anthropic assistant (or mock if no
            API key).
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="mb-1.5 px-2 text-[10px] font-semibold tracking-wider text-[var(--fg-faint)] uppercase">
          History
        </p>
        {historyList.length === 0 ? (
          <p className="px-2 text-xs text-[var(--fg-muted)]">No chats yet.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {historyList.map((s) => {
              const active = s.id === activeId;
              return (
                <li key={s.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => selectSession(s.id)}
                    className={`w-full rounded-[var(--radius-sm)] px-2.5 py-2 pr-8 text-left text-sm transition-colors ${
                      active
                        ? "bg-[var(--accent-muted)] font-medium text-[var(--accent)]"
                        : "text-[var(--fg-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--fg)]"
                    }`}
                  >
                    <span className="line-clamp-2">{s.title}</span>
                    <span className="mt-0.5 block text-[10px] text-[var(--fg-faint)]">
                      {new Date(s.updatedAt).toLocaleString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Delete chat"
                    aria-label="Delete chat"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(s.id);
                    }}
                    className="absolute top-2 right-1.5 rounded p-1 text-[var(--fg-faint)] opacity-0 transition-opacity hover:bg-[var(--surface)] hover:text-[var(--danger)] group-hover:opacity-100"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-[var(--surface)]">
        {panelOpen ? (
          <div className="absolute inset-0 z-20 flex flex-row-reverse md:hidden">
            <div className="flex h-full w-[min(18rem,88%)] flex-col border-l border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                <p className="text-sm font-semibold">Chat</p>
                <button
                  type="button"
                  className="rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--fg-muted)] hover:bg-[var(--surface-elevated)]"
                  onClick={() => setPanelOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="min-h-0 flex-1">{sidePanel}</div>
            </div>
            <button
              type="button"
              className="min-w-0 flex-1 bg-black/40"
              aria-label="Close panel"
              onClick={() => setPanelOpen(false)}
            />
          </div>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {error ? (
            <div className="shrink-0 border-b border-[var(--border)] px-4 py-2">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}

          <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3">
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-[var(--radius-sm)] text-[var(--fg-muted)] hover:bg-[var(--surface-elevated)] md:hidden"
              onClick={() => setPanelOpen(true)}
              aria-label="Open history and settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
              </svg>
            </button>
            <BotAvatar />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-[var(--fg)]">arXcrm assistant</p>
              <p className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                <span className="inline-block size-1.5 rounded-full bg-[var(--success)]" />
                {onlineLabel}
                <span className="text-[var(--fg-faint)]">· {agentLabel}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={startNewChat}
              title="New chat"
              aria-label="New chat"
              className="flex size-10 items-center justify-center rounded-[var(--radius-sm)] text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-elevated)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div
            className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4"
            style={{ background: "var(--chat-bg)" }}
          >
            {messages.length === 0 && !sending ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <BotAvatar />
                <div>
                  <p className="font-semibold text-[var(--fg)]">arXcrm assistant</p>
                  <p className="mt-1 max-w-xs text-sm text-[var(--fg-muted)]">
                    {user
                      ? `Signed in as ${user.name}. Ask about inventory, locations, budgets, or listing codes.`
                      : "Ask about inventory, locations, budgets, or listing codes."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
                {messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const showAvatar =
                    m.role === "assistant" && prev?.role !== "assistant";
                  const isUser = m.role === "user";
                  return (
                    <div
                      key={m.id}
                      className={`bubble-enter flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      {!isUser ? (
                        <div className="w-7 shrink-0">
                          {showAvatar ? <BotAvatar size="sm" /> : null}
                        </div>
                      ) : null}
                      <div
                        className={`max-w-[78%] px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap shadow-sm ${
                          isUser
                            ? "rounded-[20px] rounded-br-md bg-[var(--chat-bubble-out)] text-[var(--chat-bubble-out-fg)]"
                            : "rounded-[20px] rounded-bl-md bg-[var(--chat-bubble-in)] text-[var(--fg)]"
                        }`}
                      >
                        <p>{m.content}</p>
                        {m.meta?.escalate || m.meta?.bookViewing ? (
                          <p
                            className={`mt-1.5 text-[11px] ${isUser ? "text-white/80" : "text-[var(--fg-muted)]"}`}
                          >
                            {[
                              m.meta.escalate ? "Escalate" : null,
                              m.meta.bookViewing ? "Viewing interest" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        ) : null}
                        {m.meta?.listings?.length ? (
                          <ul
                            className={`mt-2 space-y-1 border-t pt-2 text-[12px] ${
                              isUser
                                ? "border-white/15 text-white/85"
                                : "border-[var(--border)] text-[var(--fg-muted)]"
                            }`}
                          >
                            {m.meta.listings.slice(0, 4).map((l) => (
                              <li key={l.listingCode}>
                                <span className="font-medium">{l.listingCode}</span> ·{" "}
                                {l.title}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {sending ? (
                  <div className="flex items-end gap-2">
                    <div className="w-7 shrink-0">
                      <BotAvatar size="sm" />
                    </div>
                    <div className="rounded-[20px] rounded-bl-md bg-[var(--chat-bubble-in)] px-4 py-3 shadow-sm">
                      <span className="inline-flex gap-1">
                        <span className="size-1.5 animate-bounce rounded-full bg-[var(--fg-faint)] [animation-delay:0ms]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-[var(--fg-faint)] [animation-delay:150ms]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-[var(--fg-faint)] [animation-delay:300ms]" />
                      </span>
                    </div>
                  </div>
                ) : null}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <form
            onSubmit={onSend}
            className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--surface)]/85 px-3 py-3 backdrop-blur-md sm:px-4"
          >
            <div className="flex min-w-0 flex-1 items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Aa"
                disabled={sending}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)]"
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--chat-bubble-out)] text-[var(--chat-bubble-out-fg)] shadow-[var(--shadow-glow)] transition-all duration-[var(--duration-fast)] hover:scale-105 hover:opacity-95 disabled:pointer-events-none disabled:opacity-40 disabled:hover:scale-100"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </form>
        </div>

        <div className="hidden min-h-0 shrink-0 md:flex">{sidePanel}</div>
    </div>
  );
}

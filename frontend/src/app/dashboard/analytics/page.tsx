"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, Field, Input, PageHeader, Table } from "@/components/ui";
import { apiFetch, can } from "@/lib/api";

type Overview = {
  from: string;
  to: string;
  campaignsRun: number;
  messagesSent: number;
  messagesDelivered: number;
  messagesRead: number;
  messagesFailed: number;
  messagesReplied: number;
  newProspects: number;
  conversions: number;
  deflectionRate?: number;
};

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  skippedCount: number;
  repliedCount: number;
  totalRecipients: number;
};

type FunnelRow = {
  stage: string;
  count: number;
  conversionFromPrior: number | null;
};

type Inventory = {
  byStatus: { status: string; count: number }[];
  byCategory: { category: string; count: number }[];
  byBroker: { brokerName: string; count: number }[];
};

type AttrRow = { leadSource: string; count: number };
type LeaderRow = {
  name: string;
  brokerCode: string;
  openProspects: number;
  conversionsInRange: number;
  activeListings: number;
};
type InboxMetrics = {
  totalConversations: number;
  escalated: number;
  takeover: number;
  deflected: number;
  deflectionRate: number;
  avgEscalationResponseMinutes: number | null;
};

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const canCampaigns = can(user, "campaigns:read");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [attribution, setAttribution] = useState<AttrRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [inbox, setInbox] = useState<InboxMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to + "T23:59:59.999Z")}`;
    try {
      const [ov, camps, fun, inv, attr, lead, inboxRes] = await Promise.all([
        apiFetch<Overview>(`/analytics/overview?${qs}`),
        apiFetch<{ data: CampaignRow[] }>("/analytics/campaigns"),
        apiFetch<{ funnel: FunnelRow[] }>("/analytics/funnel"),
        apiFetch<Inventory>("/analytics/inventory"),
        apiFetch<{ data: AttrRow[] }>(`/analytics/attribution?${qs}`),
        apiFetch<{ data: LeaderRow[] }>(`/analytics/brokers/leaderboard?${qs}`),
        can(user, "inbox:read")
          ? apiFetch<InboxMetrics>(`/analytics/inbox/metrics?${qs}`)
          : Promise.resolve(null),
      ]);
      setOverview(ov);
      setCampaigns(camps.data);
      setFunnel(fun.funnel);
      setInventory(inv);
      setAttribution(attr.data);
      setLeaderboard(lead.data);
      setInbox(inboxRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    }
  }

  useEffect(() => {
    if (canCampaigns) void load();
  }, [canCampaigns]);

  if (!canCampaigns) {
    return <p className="text-sm text-zinc-600">Analytics requires campaigns:read.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Campaign, funnel, inventory, and inbox metrics for the selected range."
        actions={
          <span
            className="cursor-help rounded-full border border-zinc-300 px-2 text-xs text-zinc-500"
            title="Use the date range to answer “what worked this week?”. Campaign tables show send/delivery/reply. Funnel shows stage conversion rates."
          >
            ?
          </span>
        }
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <form onSubmit={load} className="flex flex-wrap items-end gap-3">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Button type="submit">Apply range</Button>
        </form>
      </Card>

      {overview ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Campaigns run", overview.campaignsRun],
            ["Sent", overview.messagesSent],
            ["Delivered", overview.messagesDelivered],
            ["Read", overview.messagesRead],
            ["Failed", overview.messagesFailed],
            ["Replied", overview.messagesReplied],
            ["New prospects", overview.newProspects],
            ["Conversions", overview.conversions],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <p className="text-xs uppercase text-zinc-500">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <h2 className="mb-3 font-medium">Campaign performance</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-zinc-500">No campaigns.</p>
        ) : (
          <Table
            headers={[
              "Name",
              "Status",
              "Sent",
              "Delivered",
              "Read",
              "Failed",
              "Skipped",
              "Replied",
            ]}
          >
            {campaigns.map((c) => (
              <tr key={c.id} className="border-t border-zinc-100">
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2">{c.status}</td>
                <td className="px-3 py-2">{c.sentCount}</td>
                <td className="px-3 py-2">{c.deliveredCount}</td>
                <td className="px-3 py-2">{c.readCount}</td>
                <td className="px-3 py-2">{c.failedCount}</td>
                <td className="px-3 py-2">{c.skippedCount}</td>
                <td className="px-3 py-2">{c.repliedCount}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium">Prospect funnel</h2>
          <Table headers={["Stage", "Count", "Share of prior stage %"]}>
            {funnel.map((row) => (
              <tr key={row.stage} className="border-t border-zinc-100">
                <td className="px-3 py-2">{row.stage}</td>
                <td className="px-3 py-2">{row.count}</td>
                <td className="px-3 py-2">
                  {row.conversionFromPrior == null ? "—" : `${row.conversionFromPrior}%`}
                </td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-zinc-500">
            Share of prior stage is a snapshot ratio of current counts, not cohort conversion.
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">Lead source attribution</h2>
          {attribution.length === 0 ? (
            <p className="text-sm text-zinc-500">No prospects in range.</p>
          ) : (
            <Table headers={["Source", "Count"]}>
              {attribution.map((row) => (
                <tr key={row.leadSource} className="border-t border-zinc-100">
                  <td className="px-3 py-2">{row.leadSource}</td>
                  <td className="px-3 py-2">{row.count}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      {inventory ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <h2 className="mb-3 font-medium">Inventory by status</h2>
            <Table headers={["Status", "Count"]}>
              {inventory.byStatus.map((r) => (
                <tr key={r.status} className="border-t border-zinc-100">
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">{r.count}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card>
            <h2 className="mb-3 font-medium">By category</h2>
            <Table headers={["Category", "Count"]}>
              {inventory.byCategory.map((r) => (
                <tr key={r.category} className="border-t border-zinc-100">
                  <td className="px-3 py-2">{r.category}</td>
                  <td className="px-3 py-2">{r.count}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card>
            <h2 className="mb-3 font-medium">By broker</h2>
            <Table headers={["Broker", "Count"]}>
              {inventory.byBroker.map((r) => (
                <tr key={r.brokerName} className="border-t border-zinc-100">
                  <td className="px-3 py-2">{r.brokerName}</td>
                  <td className="px-3 py-2">{r.count}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      ) : null}

      <Card>
        <h2 className="mb-3 font-medium">Broker leaderboard</h2>
        <Table headers={["Broker", "Open prospects", "Conversions", "Active listings"]}>
          {leaderboard.map((b) => (
            <tr key={b.brokerCode} className="border-t border-zinc-100">
              <td className="px-3 py-2">
                {b.name} ({b.brokerCode})
              </td>
              <td className="px-3 py-2">{b.openProspects}</td>
              <td className="px-3 py-2">{b.conversionsInRange}</td>
              <td className="px-3 py-2">{b.activeListings}</td>
            </tr>
          ))}
        </Table>
      </Card>

      {inbox ? (
        <Card>
          <h2 className="mb-3 font-medium">Inbox metrics</h2>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between">
              <span>Conversations</span>
              <span className="font-medium">{inbox.totalConversations}</span>
            </li>
            <li className="flex justify-between">
              <span>Escalated</span>
              <span className="font-medium">{inbox.escalated}</span>
            </li>
            <li className="flex justify-between">
              <span>Human takeover</span>
              <span className="font-medium">{inbox.takeover}</span>
            </li>
            <li className="flex justify-between">
              <span>Bot deflection rate</span>
              <span className="font-medium">{inbox.deflectionRate}%</span>
            </li>
            <li className="flex justify-between">
              <span>Avg escalation response (min)</span>
              <span className="font-medium">
                {inbox.avgEscalationResponseMinutes ?? "—"}
              </span>
            </li>
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

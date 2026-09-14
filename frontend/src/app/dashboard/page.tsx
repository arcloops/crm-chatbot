"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Alert, Badge, Card, PageHeader, Spinner, statusTone } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Stats = {
  listingsByStatus: Record<string, number>;
  prospectsByStage: Record<string, number>;
  staffActive: number;
  brokersActive: number;
  customersCount: number;
  suppressionCount: number;
  campaignsTotal: number;
  campaignsByStatus: Record<string, number>;
};

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1">
      <span className="text-[var(--fg-muted)]">{label}</span>
      <span className="font-semibold tabular-nums text-[var(--accent)]">{value}</span>
    </li>
  );
}

export default function DashboardHomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Stats>("/stats")
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Live counts across listings, prospects, campaigns, and staff."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!stats ? (
        <Spinner label="Loading stats…" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--fg)] uppercase">
              Listings by status
            </h2>
            <ul className="divide-y divide-[var(--border-subtle)] text-sm">
              {Object.entries(stats.listingsByStatus).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3 py-1.5">
                  <Badge tone={statusTone(k)}>{k}</Badge>
                  <span className="font-semibold tabular-nums text-[var(--accent)]">{v}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--fg)] uppercase">
              Prospects by stage
            </h2>
            <ul className="divide-y divide-[var(--border-subtle)] text-sm">
              {Object.entries(stats.prospectsByStage).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3 py-1.5">
                  <Badge tone={statusTone(k)}>{k}</Badge>
                  <span className="font-semibold tabular-nums text-[var(--accent)]">{v}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--fg)] uppercase">
              Team & contacts
            </h2>
            <ul className="text-sm">
              <StatRow label="Active staff" value={stats.staffActive} />
              <StatRow label="Active brokers" value={stats.brokersActive} />
              <StatRow label="Customers" value={stats.customersCount} />
              <StatRow label="Suppression" value={stats.suppressionCount} />
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--fg)] uppercase">
              Campaigns
            </h2>
            <p className="mb-2 text-sm">
              <Link
                className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                href="/dashboard/campaigns"
              >
                {stats.campaignsTotal} total
              </Link>
            </p>
            <ul className="divide-y divide-[var(--border-subtle)] text-sm">
              {Object.entries(stats.campaignsByStatus ?? {}).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3 py-1.5">
                  <Badge tone={statusTone(k)}>{k}</Badge>
                  <span className="font-semibold tabular-nums text-[var(--accent)]">{v}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

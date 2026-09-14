"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Alert, PageHeader, Spinner, statusTone } from "@/components/ui";
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

function barColor(key: string) {
  const tone = statusTone(key);
  switch (tone) {
    case "success":
      return "var(--success)";
    case "warning":
      return "var(--warning)";
    case "danger":
      return "var(--danger)";
    case "info":
      return "var(--info)";
    case "accent":
      return "var(--accent)";
    default:
      return "var(--palette-periwinkle)";
  }
}

function FloatPanel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="metal-edge group rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]/80 p-5 shadow-[var(--shadow-md)] backdrop-blur-xl transition-all duration-[var(--duration)] ease-[var(--ease)] hover:-translate-y-1 hover:shadow-[var(--shadow-glow)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-[0.14em] text-[var(--fg-muted)] uppercase">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricBars({
  data,
  emptyLabel = "No data yet",
}: {
  data: Record<string, number>;
  emptyLabel?: string;
}) {
  const entries = useMemo(
    () => Object.entries(data).sort((a, b) => b[1] - a[1]),
    [data],
  );
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [data]);

  if (!entries.length) {
    return <p className="text-sm text-[var(--fg-faint)]">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-3.5">
      {entries.map(([label, value]) => {
        const pct = Math.round((value / max) * 100);
        const color = barColor(label);
        return (
          <li key={label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-[var(--fg)]">
                {label.replaceAll("_", " ")}
              </span>
              <span className="tabular-nums text-sm font-semibold text-[var(--fg)]">
                {value}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--border-subtle)] ring-1 ring-[var(--border)]/60">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease)]"
                style={{
                  width: ready ? `${pct}%` : "0%",
                  background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 55%, white))`,
                  boxShadow: `0 0 16px color-mix(in srgb, ${color} 35%, transparent)`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
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

  const teamData: Record<string, number> = stats
    ? {
        "Active staff": stats.staffActive,
        "Active brokers": stats.brokersActive,
        Customers: stats.customersCount,
        Suppression: stats.suppressionCount,
      }
    : {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Live counts across listings, prospects, campaigns, and staff."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!stats ? (
        <div className="flex min-h-40 items-center justify-center">
          <Spinner label="Loading stats…" />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <FloatPanel title="Listings by status">
            <MetricBars data={stats.listingsByStatus} />
          </FloatPanel>

          <FloatPanel title="Prospects by stage">
            <MetricBars data={stats.prospectsByStage} />
          </FloatPanel>

          <FloatPanel title="Team & contacts">
            <MetricBars data={teamData} />
          </FloatPanel>

          <FloatPanel
            title="Campaigns"
            action={
              <Link
                href="/dashboard/campaigns"
                className="text-xs font-semibold text-[var(--accent)] underline-offset-2 transition-colors hover:text-[var(--accent-hover)] hover:underline"
              >
                {stats.campaignsTotal} total
              </Link>
            }
          >
            <MetricBars
              data={stats.campaignsByStatus ?? {}}
              emptyLabel="No campaigns yet"
            />
          </FloatPanel>
        </div>
      )}
    </div>
  );
}

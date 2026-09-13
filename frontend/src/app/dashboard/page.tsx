"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
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
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!stats ? (
        <p className="text-sm text-zinc-600">Loading stats…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-medium">Listings by status</h2>
            <ul className="space-y-1 text-sm">
              {Object.entries(stats.listingsByStatus).map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="font-medium">{v}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 font-medium">Prospects by stage</h2>
            <ul className="space-y-1 text-sm">
              {Object.entries(stats.prospectsByStage).map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="font-medium">{v}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 font-medium">Team & contacts</h2>
            <ul className="space-y-1 text-sm">
              <li className="flex justify-between">
                <span>Active staff</span>
                <span className="font-medium">{stats.staffActive}</span>
              </li>
              <li className="flex justify-between">
                <span>Active brokers</span>
                <span className="font-medium">{stats.brokersActive}</span>
              </li>
              <li className="flex justify-between">
                <span>Customers</span>
                <span className="font-medium">{stats.customersCount}</span>
              </li>
              <li className="flex justify-between">
                <span>Suppression</span>
                <span className="font-medium">{stats.suppressionCount}</span>
              </li>
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 font-medium">Campaigns</h2>
            <p className="mb-2 text-sm">
              <Link className="underline" href="/dashboard/campaigns">
                {stats.campaignsTotal} total
              </Link>
            </p>
            <ul className="space-y-1 text-sm">
              {Object.entries(stats.campaignsByStatus ?? {}).map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="font-medium">{v}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

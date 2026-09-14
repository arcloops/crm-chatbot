"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Alert, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type SearchResult = {
  q: string;
  listings: {
    id: string;
    listingCode: string;
    title: string;
    location: string;
    availabilityStatus: string;
  }[];
  brokers: { id: string; brokerCode: string; name: string; phoneE164: string }[];
  customers: {
    id: string;
    customerCode: string;
    name: string;
    phoneE164: string;
  }[];
  prospects: {
    id: string;
    prospectCode: string;
    name: string;
    phoneE164: string;
    leadStage: string;
  }[];
};

function SearchInner() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [data, setData] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q || q.length < 2) {
      setData(null);
      return;
    }
    setError(null);
    apiFetch<SearchResult>(`/search?q=${encodeURIComponent(q)}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Search failed"));
  }, [q]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search"
        description={
          q ? `Results for “${q}”` : "Enter at least 2 characters in the top bar."
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!data ? (
        <EmptyState
          title="Waiting for a query"
          description="Use the top search bar (at least 2 characters)."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-[var(--fg)]">
              Listings ({data.listings.length})
            </h2>
            {data.listings.length === 0 ? (
              <EmptyState title="No matches" />
            ) : (
              <ul className="space-y-2 text-sm">
                {data.listings.map((l) => (
                  <li key={l.id}>
                    <Link
                      className="text-[var(--accent)] underline-offset-2 hover:underline"
                      href={`/dashboard/listings/${l.id}`}
                    >
                      {l.listingCode} · {l.title}
                    </Link>
                    <span className="text-[var(--fg-muted)]"> — {l.location}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-[var(--fg)]">
              Brokers ({data.brokers.length})
            </h2>
            {data.brokers.length === 0 ? (
              <EmptyState title="No matches" />
            ) : (
              <ul className="space-y-2 text-sm">
                {data.brokers.map((b) => (
                  <li key={b.id}>
                    <Link
                      className="text-[var(--accent)] underline-offset-2 hover:underline"
                      href="/dashboard/brokers"
                    >
                      {b.brokerCode} · {b.name}
                    </Link>
                    <span className="text-[var(--fg-muted)]"> — {b.phoneE164}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-[var(--fg)]">
              Customers ({data.customers.length})
            </h2>
            {data.customers.length === 0 ? (
              <EmptyState title="No matches" />
            ) : (
              <ul className="space-y-2 text-sm">
                {data.customers.map((c) => (
                  <li key={c.id}>
                    <Link
                      className="text-[var(--accent)] underline-offset-2 hover:underline"
                      href="/dashboard/customers"
                    >
                      {c.customerCode} · {c.name}
                    </Link>
                    <span className="text-[var(--fg-muted)]"> — {c.phoneE164}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-[var(--fg)]">
              Prospects ({data.prospects.length})
            </h2>
            {data.prospects.length === 0 ? (
              <EmptyState title="No matches" />
            ) : (
              <ul className="space-y-2 text-sm">
                {data.prospects.map((p) => (
                  <li key={p.id}>
                    <Link
                      className="text-[var(--accent)] underline-offset-2 hover:underline"
                      href="/dashboard/prospects"
                    >
                      {p.prospectCode} · {p.name}
                    </Link>
                    <span className="text-[var(--fg-muted)]">
                      {" "}
                      — {p.leadStage} · {p.phoneE164}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Spinner label="Loading search…" />}>
      <SearchInner />
    </Suspense>
  );
}

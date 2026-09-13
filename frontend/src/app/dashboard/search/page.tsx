"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
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
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!data ? (
        <p className="text-sm text-zinc-600">Waiting for query…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="mb-2 font-medium">Listings ({data.listings.length})</h2>
            {data.listings.length === 0 ? (
              <p className="text-sm text-zinc-500">No matches</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.listings.map((l) => (
                  <li key={l.id}>
                    <Link className="underline" href={`/dashboard/listings/${l.id}`}>
                      {l.listingCode} · {l.title}
                    </Link>
                    <span className="text-zinc-500"> — {l.location}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-medium">Brokers ({data.brokers.length})</h2>
            {data.brokers.length === 0 ? (
              <p className="text-sm text-zinc-500">No matches</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.brokers.map((b) => (
                  <li key={b.id}>
                    <Link className="underline" href="/dashboard/brokers">
                      {b.brokerCode} · {b.name}
                    </Link>
                    <span className="text-zinc-500"> — {b.phoneE164}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-medium">Customers ({data.customers.length})</h2>
            {data.customers.length === 0 ? (
              <p className="text-sm text-zinc-500">No matches</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.customers.map((c) => (
                  <li key={c.id}>
                    <Link className="underline" href="/dashboard/customers">
                      {c.customerCode} · {c.name}
                    </Link>
                    <span className="text-zinc-500"> — {c.phoneE164}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-medium">Prospects ({data.prospects.length})</h2>
            {data.prospects.length === 0 ? (
              <p className="text-sm text-zinc-500">No matches</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.prospects.map((p) => (
                  <li key={p.id}>
                    <Link className="underline" href="/dashboard/prospects">
                      {p.prospectCode} · {p.name}
                    </Link>
                    <span className="text-zinc-500">
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
    <Suspense fallback={<p className="text-sm text-zinc-600">Loading search…</p>}>
      <SearchInner />
    </Suspense>
  );
}

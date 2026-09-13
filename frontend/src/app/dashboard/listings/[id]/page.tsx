"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { apiFetch, can } from "@/lib/api";

type Listing = {
  id: string;
  listingCode: string;
  title: string;
  location: string;
  price: string;
  currency: string;
  availabilityStatus: string;
  propertyCategory: string;
  transactionType: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  amenities: string[];
  photos: string[];
  description?: string | null;
  brokerId?: string | null;
  broker?: { id: string; name: string } | null;
};

type Broker = { id: string; name: string };

const STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "UNDER_OFFER",
  "SOLD",
  "RENTED",
  "COMING_SOON",
];

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const canWrite = can(user, "listings:write");
  const [listing, setListing] = useState<Listing | null>(null);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [status, setStatus] = useState("");
  const [brokerId, setBrokerId] = useState("");
  const [photos, setPhotos] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiFetch<Listing>(`/listings/${params.id}`);
    setListing(data);
    setStatus(data.availabilityStatus);
    setBrokerId(data.brokerId ?? data.broker?.id ?? "");
    setPhotos(data.photos.join(", "));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
    apiFetch<{ data: Broker[] }>("/brokers")
      .then((res) => setBrokers(res.data))
      .catch(() => undefined);
  }, [params.id]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch(`/listings/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          availabilityStatus: status,
          brokerId: brokerId || null,
          photos: photos
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  if (!listing) {
    return <p className="text-sm text-zinc-600">{error ?? "Loading…"}</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={listing.title}
        description={`${listing.listingCode} · ${listing.location}`}
        actions={
          <Link href="/dashboard/listings" className="text-sm underline">
            Back to listings
          </Link>
        }
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <ul className="space-y-2 text-sm">
            <li>
              <strong>Category:</strong> {listing.propertyCategory}
            </li>
            <li>
              <strong>Transaction:</strong> {listing.transactionType}
            </li>
            <li>
              <strong>Price:</strong> {listing.currency} {listing.price}
            </li>
            <li>
              <strong>Beds/Baths:</strong> {listing.bedrooms ?? "—"} /{" "}
              {listing.bathrooms ?? "—"}
            </li>
            <li>
              <strong>Broker:</strong> {listing.broker?.name ?? "—"}
            </li>
            <li>
              <strong>Amenities:</strong>{" "}
              {listing.amenities.length ? listing.amenities.join(", ") : "—"}
            </li>
            <li>
              <strong>Description:</strong> {listing.description ?? "—"}
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">Photos</h2>
          <div className="mb-4 grid gap-2">
            {listing.photos.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="h-40 w-full rounded-md object-cover"
              />
            ))}
            {!listing.photos.length ? (
              <p className="text-sm text-zinc-500">No photos</p>
            ) : null}
          </div>

          {canWrite ? (
            <form onSubmit={onSave} className="space-y-3">
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Assigned broker">
                <Select value={brokerId} onChange={(e) => setBrokerId(e.target.value)}>
                  <option value="">None</option>
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Photo URLs (comma-separated)">
                <Input value={photos} onChange={(e) => setPhotos(e.target.value)} />
              </Field>
              <Button type="submit">Save changes</Button>
            </form>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

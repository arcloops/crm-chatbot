"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  statusTone,
} from "@/components/ui";
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
    return error ? <Alert tone="danger">{error}</Alert> : <Spinner />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={listing.title}
        description={`${listing.listingCode} · ${listing.location}`}
        actions={
          <Link
            href="/dashboard/listings"
            className="text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Back to listings
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3">
            <Badge tone={statusTone(listing.availabilityStatus)}>
              {listing.availabilityStatus}
            </Badge>
          </div>
          <ul className="space-y-2 text-sm text-[var(--fg-muted)]">
            <li>
              <span className="font-medium text-[var(--fg)]">Category:</span>{" "}
              {listing.propertyCategory}
            </li>
            <li>
              <span className="font-medium text-[var(--fg)]">Transaction:</span>{" "}
              {listing.transactionType}
            </li>
            <li>
              <span className="font-medium text-[var(--fg)]">Price:</span>{" "}
              <span className="tabular-nums text-[var(--accent)]">
                {listing.currency} {listing.price}
              </span>
            </li>
            <li>
              <span className="font-medium text-[var(--fg)]">Beds/Baths:</span>{" "}
              {listing.bedrooms ?? "—"} / {listing.bathrooms ?? "—"}
            </li>
            <li>
              <span className="font-medium text-[var(--fg)]">Broker:</span>{" "}
              {listing.broker?.name ?? "—"}
            </li>
            <li>
              <span className="font-medium text-[var(--fg)]">Amenities:</span>{" "}
              {listing.amenities.length ? listing.amenities.join(", ") : "—"}
            </li>
            <li>
              <span className="font-medium text-[var(--fg)]">Description:</span>{" "}
              {listing.description ?? "—"}
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[var(--fg)]">Photos</h2>
          <div className="mb-4 grid gap-2">
            {listing.photos.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="h-40 w-full rounded-[var(--radius-sm)] object-cover"
              />
            ))}
            {!listing.photos.length ? (
              <p className="text-sm text-[var(--fg-faint)]">No photos</p>
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

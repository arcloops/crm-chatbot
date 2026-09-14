"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  statusTone,
  Table,
  TextArea,
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
  photos?: string[];
};

type Broker = { id: string; name: string };

const CATEGORIES = [
  "APARTMENT",
  "HOUSE",
  "LAND",
  "COMMERCIAL",
  "PRE_LAUNCH",
  "MIXED_USE",
];
const TRANSACTIONS = ["SALE", "RENT", "INVESTMENT", "LEASE"];
const STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "UNDER_OFFER",
  "SOLD",
  "RENTED",
  "COMING_SOON",
];

const emptyForm = {
  title: "",
  propertyCategory: "APARTMENT",
  transactionType: "SALE",
  location: "",
  price: "",
  currency: "BDT",
  bedrooms: "",
  bathrooms: "",
  availabilityStatus: "AVAILABLE",
  amenities: "",
  photos: "",
  description: "",
  brokerId: "",
};

export default function ListingsPage() {
  const { user } = useAuth();
  const canWrite = can(user, "listings:write");
  const [rows, setRows] = useState<Listing[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (status) qs.set("status", status);
    if (activeOnly) qs.set("activeOnly", "true");
    const res = await apiFetch<{ data: Listing[] }>(`/listings?${qs}`);
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
    apiFetch<{ data: Broker[] }>("/brokers")
      .then((res) => setBrokers(res.data))
      .catch(() => undefined);
    apiFetch<{ data: { id: string; name: string }[] }>("/locations")
      .then((res) => setLocations(res.data.map((l) => l.name)))
      .catch(() => undefined);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch("/listings", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          propertyCategory: form.propertyCategory,
          transactionType: form.transactionType,
          location: form.location,
          price: Number(form.price),
          currency: form.currency,
          bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
          bathrooms: form.bathrooms ? Number(form.bathrooms) : null,
          availabilityStatus: form.availabilityStatus,
          amenities: form.amenities
            ? form.amenities
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          photos: form.photos
            ? form.photos
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          description: form.description || null,
          brokerId: form.brokerId || null,
        }),
      });
      setForm(emptyForm);
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    await apiFetch(`/listings/${id}/archive`, { method: "POST" });
    await load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Listings"
        description="Inventory source of truth. Photo fields accept HTTPS URLs."
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/import?type=listings"
                className="btn-shine inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-1.5 text-sm font-medium text-[var(--fg)] backdrop-blur-sm transition-all duration-[var(--duration-fast)] ease-[var(--ease)] hover:scale-[1.02] hover:bg-[var(--surface-elevated)] active:scale-[0.98]"
              >
                Bulk upload
              </Link>
              <Button
                onClick={() => {
                  setError(null);
                  setCreateOpen(true);
                }}
              >
                Create listing
              </Button>
            </div>
          ) : null
        }
      />
      {error && !createOpen ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Search">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Active only">
            <Select
              value={activeOnly ? "yes" : "no"}
              onChange={(e) => setActiveOnly(e.target.value === "yes")}
            >
              <option value="yes">Yes (hide sold/rented)</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void load()}>Apply filters</Button>
          </div>
        </div>
      </Card>

      <Modal
        open={createOpen}
        onClose={() => {
          if (!saving) setCreateOpen(false);
        }}
        title="Create listing"
        wide
      >
        {error ? (
          <div className="mb-3">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}
        <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-2">
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </Field>
          <Field label="Location">
            <Select
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              required
            >
              <option value="">Select area</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
              {form.location && !locations.includes(form.location) ? (
                <option value={form.location}>{form.location}</option>
              ) : null}
            </Select>
          </Field>
          <Field label="Category">
            <Select
              value={form.propertyCategory}
              onChange={(e) => setForm({ ...form, propertyCategory: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Transaction">
            <Select
              value={form.transactionType}
              onChange={(e) => setForm({ ...form, transactionType: e.target.value })}
            >
              {TRANSACTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Price">
            <Input
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.availabilityStatus}
              onChange={(e) => setForm({ ...form, availabilityStatus: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bedrooms">
            <Input
              type="number"
              value={form.bedrooms}
              onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
            />
          </Field>
          <Field label="Bathrooms">
            <Input
              type="number"
              value={form.bathrooms}
              onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
            />
          </Field>
          <Field label="Amenities (comma-separated)">
            <Input
              value={form.amenities}
              onChange={(e) => setForm({ ...form, amenities: e.target.value })}
            />
          </Field>
          <Field label="Photo URLs (comma-separated HTTPS)">
            <Input
              value={form.photos}
              onChange={(e) => setForm({ ...form, photos: e.target.value })}
              placeholder="https://..."
            />
          </Field>
          <Field label="Broker">
            <Select
              value={form.brokerId}
              onChange={(e) => setForm({ ...form, brokerId: e.target.value })}
            >
              <option value="">None</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <TextArea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create listing"}
            </Button>
          </div>
        </form>
      </Modal>

      {rows.length === 0 ? (
        <EmptyState
          title="No listings match these filters"
          description="Try clearing filters or create a new listing."
        />
      ) : (
        <Table headers={["Code", "Title", "Location", "Price", "Status", "Actions"]}>
          {rows.map((row) => (
            <tr key={row.id} className="table-row-hover">
              <td className="px-3 py-2.5 font-mono text-xs text-[var(--fg-muted)]">
                {row.listingCode}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                  href={`/dashboard/listings/${row.id}`}
                >
                  {row.title}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-[var(--fg-muted)]">{row.location}</td>
              <td className="px-3 py-2.5 tabular-nums">
                {row.currency} {row.price}
              </td>
              <td className="px-3 py-2.5">
                <Badge tone={statusTone(row.availabilityStatus)}>
                  {row.availabilityStatus}
                </Badge>
              </td>
              <td className="px-3 py-2.5">
                {canWrite ? (
                  <Button variant="secondary" onClick={() => void archive(row.id)}>
                    Archive
                  </Button>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

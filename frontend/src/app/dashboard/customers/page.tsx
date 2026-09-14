"use client";

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
  PageHeader,
  Select,
  statusTone,
  Table,
} from "@/components/ui";
import { apiFetch, can } from "@/lib/api";

type Customer = {
  id: string;
  customerCode: string;
  name: string;
  phoneE164: string;
  transactionType: string;
  optInStatus: boolean;
  referralCount: number;
  tags: string[];
  assignedBrokerId?: string | null;
  listing?: { listingCode: string; title: string } | null;
  assignedBroker?: { id: string; name: string } | null;
};

type Option = { id: string; name?: string; title?: string; listingCode?: string };

export default function CustomersPage() {
  const { user } = useAuth();
  const canWrite = can(user, "contacts:write");
  const [rows, setRows] = useState<Customer[]>([]);
  const [listings, setListings] = useState<Option[]>([]);
  const [brokers, setBrokers] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [referralFor, setReferralFor] = useState<string | null>(null);
  const [referral, setReferral] = useState({
    name: "",
    phone: "",
    preferredLocation: "",
    intent: "BUY",
    assignedBrokerId: "",
  });
  const [form, setForm] = useState({
    name: "",
    phone: "",
    transactionType: "BOUGHT",
    listingId: "",
    assignedBrokerId: "",
    tags: "",
    optInStatus: "true",
  });

  async function load() {
    const res = await apiFetch<{ data: Customer[] }>("/customers");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
    apiFetch<{ data: Option[] }>("/listings?activeOnly=false")
      .then((res) => setListings(res.data))
      .catch(() => undefined);
    apiFetch<{ data: Option[] }>("/brokers")
      .then((res) => setBrokers(res.data))
      .catch(() => undefined);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.optInStatus === "false") {
      const ok = window.confirm(
        "Opting out will add this phone to suppression and clear opt-in across brokers, customers, and prospects. Continue?",
      );
      if (!ok) return;
    }
    try {
      await apiFetch("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          transactionType: form.transactionType,
          listingId: form.listingId || null,
          assignedBrokerId: form.assignedBrokerId || null,
          tags: form.tags
            ? form.tags
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          optInStatus: form.optInStatus === "true",
        }),
      });
      setForm({
        name: "",
        phone: "",
        transactionType: "BOUGHT",
        listingId: "",
        assignedBrokerId: "",
        tags: "",
        optInStatus: "true",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function assignBroker(id: string, assignedBrokerId: string) {
    setError(null);
    try {
      await apiFetch(`/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedBrokerId: assignedBrokerId || null }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed");
    }
  }

  async function setOptIn(id: string, optInStatus: boolean) {
    setError(null);
    if (!optInStatus) {
      const ok = window.confirm(
        "This will cascade opt-out: suppress the phone and clear opt-in on matching contact lists. Continue?",
      );
      if (!ok) return;
    }
    try {
      await apiFetch(`/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ optInStatus }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function submitReferral(customerId: string) {
    setError(null);
    try {
      await apiFetch(`/customers/${customerId}/referrals`, {
        method: "POST",
        body: JSON.stringify({
          name: referral.name,
          phone: referral.phone,
          preferredLocation: referral.preferredLocation || null,
          intent: referral.intent,
          assignedBrokerId: referral.assignedBrokerId || null,
        }),
      });
      setReferral({
        name: "",
        phone: "",
        preferredLocation: "",
        intent: "BUY",
        assignedBrokerId: "",
      });
      setReferralFor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Referral failed");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description="Closed / transacted contacts." />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {canWrite ? (
        <Card>
          <h2 className="mb-3 font-medium">Create customer</h2>
          <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-2">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
            </Field>
            <Field label="Transaction">
              <Select
                value={form.transactionType}
                onChange={(e) => setForm({ ...form, transactionType: e.target.value })}
              >
                <option value="BOUGHT">BOUGHT</option>
                <option value="RENTED">RENTED</option>
                <option value="INVESTED">INVESTED</option>
              </Select>
            </Field>
            <Field label="Listing">
              <Select
                value={form.listingId}
                onChange={(e) => setForm({ ...form, listingId: e.target.value })}
              >
                <option value="">None</option>
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {(l as { listingCode?: string }).listingCode} —{" "}
                    {(l as { title?: string }).title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assigned broker">
              <Select
                value={form.assignedBrokerId}
                onChange={(e) => setForm({ ...form, assignedBrokerId: e.target.value })}
              >
                <option value="">None</option>
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tags">
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </Field>
            <Field label="Opt-in">
              <Select
                value={form.optInStatus}
                onChange={(e) => setForm({ ...form, optInStatus: e.target.value })}
              >
                <option value="true">Yes</option>
                <option value="false">No (cascades to suppression)</option>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Button type="submit">Create</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="No customers yet" description="Create a customer to get started." />
      ) : (
        <Table
          headers={["Code", "Name", "Phone", "Type", "Referrals", "Broker", "Actions"]}
        >
          {rows.map((row) => (
            <tr key={row.id} className="table-row-hover align-top">
              <td className="px-3 py-2">{row.customerCode}</td>
              <td className="px-3 py-2">{row.name}</td>
              <td className="px-3 py-2">{row.phoneE164}</td>
              <td className="px-3 py-2">
                <Badge tone={statusTone(row.transactionType)}>{row.transactionType}</Badge>
              </td>
              <td className="px-3 py-2">{row.referralCount ?? 0}</td>
              <td className="px-3 py-2">
                {canWrite ? (
                  <Select
                    value={row.assignedBrokerId ?? row.assignedBroker?.id ?? ""}
                    onChange={(e) => void assignBroker(row.id, e.target.value)}
                  >
                    <option value="">None</option>
                    {brokers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  (row.assignedBroker?.name ?? "—")
                )}
              </td>
              <td className="px-3 py-2">
                {canWrite ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setReferralFor(referralFor === row.id ? null : row.id)
                        }
                      >
                        Add referral
                      </Button>
                      <Button
                        variant={row.optInStatus ? "danger" : "secondary"}
                        onClick={() => void setOptIn(row.id, !row.optInStatus)}
                      >
                        {row.optInStatus ? "Opt out" : "Opt in"}
                      </Button>
                    </div>
                    {referralFor === row.id ? (
                      <div className="space-y-2 rounded-md border border-[var(--border)] p-2">
                        <Field label="Name">
                          <Input
                            value={referral.name}
                            onChange={(e) =>
                              setReferral({ ...referral, name: e.target.value })
                            }
                            required
                          />
                        </Field>
                        <Field label="Phone">
                          <Input
                            value={referral.phone}
                            onChange={(e) =>
                              setReferral({ ...referral, phone: e.target.value })
                            }
                            required
                          />
                        </Field>
                        <Field label="Location">
                          <Input
                            value={referral.preferredLocation}
                            onChange={(e) =>
                              setReferral({
                                ...referral,
                                preferredLocation: e.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label="Intent">
                          <Select
                            value={referral.intent}
                            onChange={(e) =>
                              setReferral({ ...referral, intent: e.target.value })
                            }
                          >
                            <option value="BUY">BUY</option>
                            <option value="RENT">RENT</option>
                            <option value="INVEST">INVEST</option>
                          </Select>
                        </Field>
                        <Button onClick={() => void submitReferral(row.id)}>
                          Create prospect
                        </Button>
                      </div>
                    ) : null}
                  </div>
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

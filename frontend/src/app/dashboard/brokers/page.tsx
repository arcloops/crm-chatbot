"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { apiFetch, can } from "@/lib/api";

type Broker = {
  id: string;
  brokerCode: string;
  name: string;
  phone: string;
  phoneE164: string;
  regionArea?: string | null;
  activeStatus: string;
  optInStatus: boolean;
  tags: string[];
};

type Workload = {
  broker: { id: string; name: string; brokerCode: string };
  prospectsByStage: Record<string, number>;
  counts: {
    openProspects: number;
    activeListings: number;
    assignedListings: number;
  };
  prospects: { prospectCode: string; name: string; leadStage: string }[];
  activeListings: { listingCode: string; title: string; availabilityStatus: string }[];
};

export default function BrokersPage() {
  const { user } = useAuth();
  const canWrite = can(user, "contacts:write");
  const [rows, setRows] = useState<Broker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [workloadId, setWorkloadId] = useState("");
  const [workload, setWorkload] = useState<Workload | null>(null);
  const [reassign, setReassign] = useState({
    fromBrokerId: "",
    toBrokerId: "",
    scopes: "listings,prospects,customers",
  });
  const [form, setForm] = useState({
    name: "",
    phone: "",
    regionArea: "",
    tags: "",
    optInStatus: "true",
  });

  async function load() {
    const res = await apiFetch<{ data: Broker[] }>("/brokers");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  async function loadWorkload(id: string) {
    setWorkloadId(id);
    if (!id) {
      setWorkload(null);
      return;
    }
    setError(null);
    try {
      const data = await apiFetch<Workload>(`/brokers/${id}/workload`);
      setWorkload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workload failed");
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.optInStatus === "false") {
      const ok = window.confirm(
        "Opting out will cascade: suppress this phone and clear opt-in across contact lists. Continue?",
      );
      if (!ok) return;
    }
    try {
      await apiFetch("/brokers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          regionArea: form.regionArea || null,
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
        regionArea: "",
        tags: "",
        optInStatus: "true",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function onReassign(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await apiFetch<{
        moved: { listings: number; prospects: number; customers: number };
      }>("/brokers/reassign", {
        method: "POST",
        body: JSON.stringify({
          fromBrokerId: reassign.fromBrokerId,
          toBrokerId: reassign.toBrokerId,
          scopes: reassign.scopes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      alert(
        `Moved listings=${result.moved.listings}, prospects=${result.moved.prospects}, customers=${result.moved.customers}`,
      );
      if (workloadId) await loadWorkload(workloadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reassign failed");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Brokers" description="Internal partners and agents." />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {canWrite ? (
        <Card>
          <h2 className="mb-3 font-medium">Create broker</h2>
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
                placeholder="017..."
              />
            </Field>
            <Field label="Region">
              <Input
                value={form.regionArea}
                onChange={(e) => setForm({ ...form, regionArea: e.target.value })}
              />
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
            <div className="flex items-end">
              <Button type="submit">Create</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 font-medium">Workload</h2>
        <div className="mb-3 max-w-sm">
          <Field label="Broker">
            <Select
              value={workloadId}
              onChange={(e) => void loadWorkload(e.target.value)}
            >
              <option value="">Select broker</option>
              {rows.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.brokerCode})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {workload ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="text-sm">
              <p className="font-medium">{workload.broker.name}</p>
              <ul className="mt-2 space-y-1">
                <li>Open prospects: {workload.counts.openProspects}</li>
                <li>Active listings: {workload.counts.activeListings}</li>
                <li>Assigned listings: {workload.counts.assignedListings}</li>
              </ul>
              <ul className="mt-3 space-y-1 text-zinc-600">
                {Object.entries(workload.prospectsByStage).map(([stage, count]) => (
                  <li key={stage}>
                    {stage}: {count}
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-sm">
              <p className="mb-1 font-medium">Open prospects</p>
              {workload.prospects.length === 0 ? (
                <p className="text-zinc-500">None</p>
              ) : (
                <ul className="space-y-1">
                  {workload.prospects.slice(0, 8).map((p) => (
                    <li key={p.prospectCode}>
                      {p.prospectCode} · {p.name} · {p.leadStage}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Select a broker to view workload.</p>
        )}
      </Card>

      {canWrite ? (
        <Card>
          <h2 className="mb-3 font-medium">Bulk reassign</h2>
          <form onSubmit={onReassign} className="grid gap-3 md:grid-cols-2">
            <Field label="From broker">
              <Select
                value={reassign.fromBrokerId}
                onChange={(e) =>
                  setReassign({ ...reassign, fromBrokerId: e.target.value })
                }
                required
              >
                <option value="">Select</option>
                {rows.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To broker">
              <Select
                value={reassign.toBrokerId}
                onChange={(e) => setReassign({ ...reassign, toBrokerId: e.target.value })}
                required
              >
                <option value="">Select</option>
                {rows.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Scopes (comma-separated)">
              <Input
                value={reassign.scopes}
                onChange={(e) => setReassign({ ...reassign, scopes: e.target.value })}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Reassign</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-600">No brokers yet.</p>
        </Card>
      ) : (
        <Table headers={["Code", "Name", "Phone", "Region", "Opt-in", "Status"]}>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-zinc-100">
              <td className="px-3 py-2">{row.brokerCode}</td>
              <td className="px-3 py-2">{row.name}</td>
              <td className="px-3 py-2">{row.phoneE164}</td>
              <td className="px-3 py-2">{row.regionArea ?? "—"}</td>
              <td className="px-3 py-2">{row.optInStatus ? "Yes" : "No"}</td>
              <td className="px-3 py-2">{row.activeStatus}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

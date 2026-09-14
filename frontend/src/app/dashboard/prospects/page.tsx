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

type Prospect = {
  id: string;
  prospectCode: string;
  name: string;
  phoneE164: string;
  leadStage: string;
  intent?: string | null;
  preferredLocation?: string | null;
  budgetMin?: string | null;
  budgetMax?: string | null;
  optInStatus: boolean;
  convertedAt?: string | null;
  viewingAt?: string | null;
  viewingNote?: string | null;
  assignedBrokerId?: string | null;
  assignedBroker?: { id: string; name: string } | null;
};

type Broker = { id: string; name: string };

const STAGES = ["NEW", "QUALIFIED", "VIEWING_BOOKED", "COLD"];

export default function ProspectsPage() {
  const { user } = useAuth();
  const canWrite = can(user, "contacts:write");
  const [rows, setRows] = useState<Prospect[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [stageFilter, setStageFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [convertType, setConvertType] = useState("BOUGHT");
  const [viewingAt, setViewingAt] = useState("");
  const [viewingNote, setViewingNote] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    preferredLocation: "",
    intent: "BUY",
    leadStage: "NEW",
    budgetMin: "",
    budgetMax: "",
    assignedBrokerId: "",
    leadSource: "manual",
    tags: "",
  });

  async function load() {
    const qs = stageFilter ? `?stage=${stageFilter}` : "";
    const res = await apiFetch<{ data: Prospect[] }>(`/prospects${qs}`);
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
    apiFetch<{ data: Broker[] }>("/brokers")
      .then((res) => setBrokers(res.data))
      .catch(() => undefined);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/prospects", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          preferredLocation: form.preferredLocation || null,
          intent: form.intent,
          leadStage: form.leadStage,
          budgetMin: form.budgetMin ? Number(form.budgetMin) : null,
          budgetMax: form.budgetMax ? Number(form.budgetMax) : null,
          assignedBrokerId: form.assignedBrokerId || null,
          leadSource: form.leadSource,
          tags: form.tags
            ? form.tags
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
        }),
      });
      setForm({
        name: "",
        phone: "",
        preferredLocation: "",
        intent: "BUY",
        leadStage: "NEW",
        budgetMin: "",
        budgetMax: "",
        assignedBrokerId: "",
        leadSource: "manual",
        tags: "",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function updateStage(id: string, leadStage: string) {
    setError(null);
    try {
      await apiFetch(`/prospects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ leadStage }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function assignBroker(id: string, assignedBrokerId: string) {
    setError(null);
    try {
      await apiFetch(`/prospects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedBrokerId: assignedBrokerId || null }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed");
    }
  }

  async function convertProspect(id: string) {
    setError(null);
    try {
      await apiFetch(`/prospects/${id}/convert`, {
        method: "POST",
        body: JSON.stringify({ transactionType: convertType }),
      });
      setActionId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Convert failed");
    }
  }

  async function bookViewing(id: string) {
    setError(null);
    try {
      await apiFetch(`/prospects/${id}/viewing`, {
        method: "POST",
        body: JSON.stringify({
          viewingAt: viewingAt ? new Date(viewingAt).toISOString() : undefined,
          viewingNote: viewingNote || null,
        }),
      });
      setActionId(null);
      setViewingAt("");
      setViewingNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Viewing failed");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Prospects" description="Leads not yet transacted." />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Stage filter">
            <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
              <option value="">All</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={() => void load()}>Apply</Button>
        </div>
      </Card>

      {canWrite ? (
        <Card>
          <h2 className="mb-3 font-medium">Create prospect</h2>
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
            <Field label="Preferred location">
              <Input
                value={form.preferredLocation}
                onChange={(e) => setForm({ ...form, preferredLocation: e.target.value })}
              />
            </Field>
            <Field label="Intent">
              <Select
                value={form.intent}
                onChange={(e) => setForm({ ...form, intent: e.target.value })}
              >
                <option value="BUY">BUY</option>
                <option value="RENT">RENT</option>
                <option value="INVEST">INVEST</option>
              </Select>
            </Field>
            <Field label="Stage">
              <Select
                value={form.leadStage}
                onChange={(e) => setForm({ ...form, leadStage: e.target.value })}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
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
            <Field label="Budget min">
              <Input
                type="number"
                value={form.budgetMin}
                onChange={(e) => setForm({ ...form, budgetMin: e.target.value })}
              />
            </Field>
            <Field label="Budget max">
              <Input
                type="number"
                value={form.budgetMax}
                onChange={(e) => setForm({ ...form, budgetMax: e.target.value })}
              />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit">Create</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No prospects yet"
          description="Create one to get started."
        />
      ) : (
        <Table headers={["Code", "Name", "Phone", "Stage", "Broker", "Actions"]}>
          {rows.map((row) => (
            <tr key={row.id} className="table-row-hover align-top">
              <td className="px-3 py-2">{row.prospectCode}</td>
              <td className="px-3 py-2">
                {row.name}
                {row.convertedAt ? (
                  <span className="mt-1 block text-xs text-[var(--fg-faint)]">Converted</span>
                ) : null}
              </td>
              <td className="px-3 py-2">{row.phoneE164}</td>
              <td className="px-3 py-2">
                {canWrite && !row.convertedAt ? (
                  <Select
                    value={row.leadStage}
                    onChange={(e) => void updateStage(row.id, e.target.value)}
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge tone={statusTone(row.leadStage)}>{row.leadStage}</Badge>
                )}
              </td>
              <td className="px-3 py-2">
                {canWrite && !row.convertedAt ? (
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
                {canWrite && !row.convertedAt ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setActionId(
                            actionId === `view-${row.id}` ? null : `view-${row.id}`,
                          )
                        }
                      >
                        Book viewing
                      </Button>
                      <Button
                        onClick={() =>
                          setActionId(
                            actionId === `cvt-${row.id}` ? null : `cvt-${row.id}`,
                          )
                        }
                      >
                        Convert
                      </Button>
                    </div>
                    {actionId === `view-${row.id}` ? (
                      <div className="space-y-2 rounded-md border border-[var(--border)] p-2">
                        <Field label="Viewing date">
                          <Input
                            type="datetime-local"
                            value={viewingAt}
                            onChange={(e) => setViewingAt(e.target.value)}
                          />
                        </Field>
                        <Field label="Note">
                          <Input
                            value={viewingNote}
                            onChange={(e) => setViewingNote(e.target.value)}
                          />
                        </Field>
                        <Button onClick={() => void bookViewing(row.id)}>
                          Save viewing
                        </Button>
                      </div>
                    ) : null}
                    {actionId === `cvt-${row.id}` ? (
                      <div className="space-y-2 rounded-md border border-[var(--border)] p-2">
                        <Field label="Transaction type">
                          <Select
                            value={convertType}
                            onChange={(e) => setConvertType(e.target.value)}
                          >
                            <option value="BOUGHT">BOUGHT</option>
                            <option value="RENTED">RENTED</option>
                            <option value="INVESTED">INVESTED</option>
                          </Select>
                        </Field>
                        <Button onClick={() => void convertProspect(row.id)}>
                          Confirm convert
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

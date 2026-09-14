"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Table,
} from "@/components/ui";
import { apiFetch, can } from "@/lib/api";

type Entry = {
  id: string;
  phoneE164: string;
  optedOutDate: string;
  source?: string | null;
};

export default function SuppressionPage() {
  const { user } = useAuth();
  const canWrite = can(user, "suppression:write");
  const [rows, setRows] = useState<Entry[]>([]);
  const [phone, setPhone] = useState("");
  const [checkPhone, setCheckPhone] = useState("");
  const [checkResult, setCheckResult] = useState<{
    allowed: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await apiFetch<{ data: Entry[] }>("/suppression");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const ok = window.confirm(
      "This will suppress the phone and cascade opt-out across brokers, customers, prospects, and developers. Continue?",
    );
    if (!ok) return;
    try {
      const result = await apiFetch<{
        phoneE164: string;
        cascade: {
          brokersUpdated: number;
          customersUpdated: number;
          prospectsUpdated: number;
          developersUpdated?: number;
        };
      }>("/suppression", {
        method: "POST",
        body: JSON.stringify({ phone, source: "manual" }),
      });
      setPhone("");
      const c = result.cascade;
      alert(
        `Cascaded ${result.phoneE164}: brokers=${c.brokersUpdated}, customers=${c.customersUpdated}, prospects=${c.prospectsUpdated}, developers=${c.developersUpdated ?? 0}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    }
  }

  async function onRemove(phoneE164: string) {
    await apiFetch(`/suppression/${encodeURIComponent(phoneE164)}`, {
      method: "DELETE",
    });
    await load();
  }

  async function onCheck(e: FormEvent) {
    e.preventDefault();
    setCheckResult(null);
    const res = await apiFetch<{ allowed: boolean; suppressed: boolean; error?: string }>(
      "/suppression/check",
      {
        method: "POST",
        body: JSON.stringify({ phone: checkPhone }),
      },
    );
    setCheckResult({
      allowed: res.allowed,
      message: res.allowed
        ? "Allowed — not suppressed"
        : `Blocked — ${res.error ?? "suppressed"}`,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppression"
        description="Opt-out list. Campaign sends and WhatsApp outbound check this gate. Inbound STOP/UNSUBSCRIBE also cascades here automatically."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {canWrite ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[var(--fg)]">Add phone</h2>
          <form onSubmit={onAdd} className="flex flex-wrap gap-3">
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Add to suppression</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[var(--fg)]">Campaign send check</h2>
        <form onSubmit={onCheck} className="flex flex-wrap gap-3">
          <Field label="Phone">
            <Input
              value={checkPhone}
              onChange={(e) => setCheckPhone(e.target.value)}
              required
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="secondary">
              Check
            </Button>
          </div>
        </form>
        {checkResult ? (
          <div className="mt-3">
            <Alert tone={checkResult.allowed ? "success" : "warning"}>
              {checkResult.message}
            </Alert>
          </div>
        ) : null}
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="Suppression list is empty"
          description="No phones are currently opted out."
        />
      ) : (
        <Table headers={["Phone", "Opted out", "Source", "Actions"]}>
          {rows.map((row) => (
            <tr key={row.id} className="table-row-hover">
              <td className="px-3 py-2">{row.phoneE164}</td>
              <td className="px-3 py-2 text-[var(--fg-muted)]">
                {new Date(row.optedOutDate).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-[var(--fg-muted)]">{row.source ?? "—"}</td>
              <td className="px-3 py-2">
                {canWrite ? (
                  <Button variant="danger" onClick={() => void onRemove(row.phoneE164)}>
                    Remove
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

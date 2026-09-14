"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  statusTone,
  Table,
} from "@/components/ui";
import { apiFetch, can } from "@/lib/api";

type Campaign = {
  id: string;
  name: string;
  status: string;
  audienceType: string;
  templateName: string;
  totalRecipients: number;
  sentCount: number;
  skippedCount: number;
  createdAt: string;
};

type Template = { name: string; status: string };

export default function CampaignsPage() {
  const { user } = useAuth();
  const canWrite = can(user, "campaigns:write");
  const [rows, setRows] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    audienceType: "PROSPECTS",
    developerId: "",
    templateName: "",
    templateVariantB: "",
    abSplitPercent: "50",
    rateLimitPerSec: "5",
    scheduledAt: "",
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await apiFetch<{ data: Campaign[] }>("/campaigns");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
    apiFetch<{ data: Template[] }>("/whatsapp/templates")
      .then((res) => {
        setTemplates(res.data);
        if (res.data[0] && !form.templateName) {
          setForm((f) => ({ ...f, templateName: res.data[0].name }));
        }
      })
      .catch(() => undefined);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const created = await apiFetch<Campaign>("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          audienceType: form.audienceType,
          audienceFilters: {
            optInOnly: true,
            ...(form.developerId ? { developerId: form.developerId } : {}),
          },
          templateName: form.templateName,
          templateVariantB: form.templateVariantB || null,
          abSplitPercent: form.templateVariantB ? Number(form.abSplitPercent) : null,
          rateLimitPerSec: Number(form.rateLimitPerSec) || 5,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
        }),
      });
      setForm({
        name: "",
        audienceType: "PROSPECTS",
        developerId: "",
        templateName: templates[0]?.name ?? "",
        templateVariantB: "",
        abSplitPercent: "50",
        rateLimitPerSec: "5",
        scheduledAt: "",
      });
      setCreateOpen(false);
      await load();
      window.location.href = `/dashboard/campaigns/${created.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Segmented WhatsApp broadcasts with suppression and opt-in gates."
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setError(null);
                setCreateOpen(true);
              }}
            >
              Create campaign
            </Button>
          ) : null
        }
      />
      {error && !createOpen ? <Alert tone="danger">{error}</Alert> : null}

      <Modal
        open={createOpen}
        onClose={() => {
          if (!saving) setCreateOpen(false);
        }}
        title="Create campaign"
        wide
      >
        {error ? (
          <div className="mb-3">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}
        <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Audience">
            <Select
              value={form.audienceType}
              onChange={(e) => setForm({ ...form, audienceType: e.target.value })}
            >
              <option value="PROSPECTS">PROSPECTS</option>
              <option value="CUSTOMERS">CUSTOMERS</option>
              <option value="BROKERS">BROKERS</option>
              <option value="DEVELOPERS">DEVELOPERS</option>
            </Select>
          </Field>
          <Field label="Developer ID filter (optional)">
            <Input
              value={form.developerId}
              onChange={(e) => setForm({ ...form, developerId: e.target.value })}
              placeholder="For PROSPECTS/DEVELOPERS audience"
            />
          </Field>
          <Field label="Template">
            <Select
              value={form.templateName}
              onChange={(e) => setForm({ ...form, templateName: e.target.value })}
              required
            >
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="A/B variant B (optional)">
            <Select
              value={form.templateVariantB}
              onChange={(e) => setForm({ ...form, templateVariantB: e.target.value })}
            >
              <option value="">None</option>
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="A/B split % for A">
            <Input
              type="number"
              value={form.abSplitPercent}
              onChange={(e) => setForm({ ...form, abSplitPercent: e.target.value })}
            />
          </Field>
          <Field label="Rate limit / sec">
            <Input
              type="number"
              value={form.rateLimitPerSec}
              onChange={(e) => setForm({ ...form, rateLimitPerSec: e.target.value })}
            />
          </Field>
          <Field label="Schedule (optional)">
            <Input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
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
              {saving ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </form>
      </Modal>

      {rows.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create a draft campaign to get started."
        />
      ) : (
        <Table headers={["Name", "Status", "Audience", "Template", "Sent", ""]}>
          {rows.map((row) => (
            <tr key={row.id} className="table-row-hover">
              <td className="px-3 py-2">
                <Link
                  className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                  href={`/dashboard/campaigns/${row.id}`}
                >
                  {row.name}
                </Link>
              </td>
              <td className="px-3 py-2">
                <Badge tone={statusTone(row.status)}>{row.status}</Badge>
              </td>
              <td className="px-3 py-2 text-[var(--fg-muted)]">{row.audienceType}</td>
              <td className="px-3 py-2 text-[var(--fg-muted)]">{row.templateName}</td>
              <td className="px-3 py-2 tabular-nums">
                {row.sentCount}/{row.totalRecipients}
              </td>
              <td className="px-3 py-2">
                <Link
                  className="text-sm text-[var(--accent)] underline-offset-2 hover:underline"
                  href={`/dashboard/campaigns/${row.id}`}
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
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
  templateVariantB?: string | null;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount?: number;
  failedCount: number;
  skippedCount: number;
  repliedCount: number;
  rateLimitPerSec: number;
};

type Recipient = {
  id: string;
  phoneE164: string;
  status: string;
  skipReason?: string | null;
  templateName?: string | null;
  sentAt?: string | null;
};

type Preflight = {
  ok: boolean;
  checks: { id: string; ok: boolean; detail: string }[];
};

type Preview = {
  total: number;
  eligible: number;
  skipped: number;
};

type Report = {
  campaign?: {
    readCount?: number;
    repliedCount?: number;
  };
  byStatus: Record<string, number>;
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const canWrite = can(user, "campaigns:write");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [c, r, rep] = await Promise.all([
      apiFetch<Campaign>(`/campaigns/${params.id}`),
      apiFetch<{ data: Recipient[] }>(`/campaigns/${params.id}/recipients`),
      apiFetch<Report>(`/campaigns/${params.id}/report`),
    ]);
    setCampaign(c);
    setRecipients(r.data);
    setReport(rep);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, [params.id]);

  async function runPreview() {
    setError(null);
    try {
      const p = await apiFetch<Preview>(`/campaigns/${params.id}/preview`, {
        method: "POST",
      });
      setPreview(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    }
  }

  async function runPreflight() {
    setError(null);
    try {
      const p = await apiFetch<Preflight>(`/campaigns/${params.id}/preflight`, {
        method: "POST",
      });
      setPreflight(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preflight failed");
    }
  }

  async function action(path: string) {
    setError(null);
    try {
      await apiFetch(`/campaigns/${params.id}/${path}`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${path} failed`);
    }
  }

  if (!campaign) {
    return error ? <Alert tone="danger">{error}</Alert> : <Spinner />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={`${campaign.status} · ${campaign.audienceType} · ${campaign.templateName}`}
        actions={
          <Link
            href="/dashboard/campaigns"
            className="text-sm text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Back
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          ["Total", campaign.totalRecipients],
          ["Sent", campaign.sentCount],
          ["Delivered", campaign.deliveredCount],
          ["Read", campaign.readCount ?? report?.campaign?.readCount ?? 0],
          ["Replied", campaign.repliedCount],
          ["Failed", campaign.failedCount],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <p className="text-xs text-[var(--fg-faint)] uppercase">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>

      {canWrite ? (
        <Card>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="font-medium">Actions</h2>
            <span
              className="cursor-help rounded-full border border-[var(--border)] px-2 text-xs text-[var(--fg-faint)]"
              title="Run Preflight before Start. Preflight checks template approval, audience size, and opt-in filter."
            >
              ?
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void runPreview()}>
              Preview audience
            </Button>
            <Button variant="secondary" onClick={() => void runPreflight()}>
              Preflight
            </Button>
            <Button onClick={() => void action("start")}>Start</Button>
            <Button variant="secondary" onClick={() => void action("pause")}>
              Pause
            </Button>
            <Button variant="danger" onClick={() => void action("cancel")}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => void action("clone")}>
              Clone
            </Button>
          </div>
          {preview ? (
            <p className="mt-3 text-sm text-[var(--fg-muted)]">
              Preview: {preview.eligible} eligible / {preview.total} total (
              {preview.skipped} skipped)
            </p>
          ) : null}
          {preflight ? (
            <ul className="mt-3 space-y-1 text-sm">
              {preflight.checks.map((c) => (
                <li
                  key={c.id}
                  className={c.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}
                >
                  {c.ok ? "✓" : "✗"} {c.id}: {c.detail}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {report ? (
        <Card>
          <h2 className="mb-2 font-medium">Report by status</h2>
          <ul className="space-y-1 text-sm">
            {Object.entries(report.byStatus).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span className="text-[var(--fg-muted)]">{k}</span>
                <span className="font-medium">{v}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {recipients.length === 0 ? (
        <EmptyState
          title="No recipients materialized yet"
          description="Run Start (or Preview) first."
        />
      ) : (
        <Table headers={["Phone", "Template", "Status", "Skip", "Sent"]}>
          {recipients.map((r) => (
            <tr key={r.id} className="table-row-hover">
              <td className="px-3 py-2">{r.phoneE164}</td>
              <td className="px-3 py-2 text-[var(--fg-muted)]">{r.templateName ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
              </td>
              <td className="px-3 py-2 text-[var(--fg-muted)]">{r.skipReason ?? "—"}</td>
              <td className="px-3 py-2 text-[var(--fg-muted)]">
                {r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

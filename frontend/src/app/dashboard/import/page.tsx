"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  FileButton,
  PageHeader,
  Select,
  Spinner,
  statusTone,
  Table,
} from "@/components/ui";
import { apiFetch, can } from "@/lib/api";

type ImportType = "listings" | "brokers" | "customers" | "prospects";

type Templates = Record<
  ImportType,
  { headers: string[]; sample: string }
>;

type ImportResult = {
  type: string;
  total: number;
  created: number;
  failed: number;
  results: {
    row: number;
    ok: boolean;
    id?: string;
    code?: string;
    error?: string;
  }[];
};

const TYPE_META: {
  id: ImportType;
  label: string;
  permission: "listings:write" | "contacts:write";
}[] = [
  { id: "listings", label: "Listings", permission: "listings:write" },
  { id: "brokers", label: "Brokers", permission: "contacts:write" },
  { id: "customers", label: "Customers", permission: "contacts:write" },
  { id: "prospects", label: "Prospects", permission: "contacts:write" },
];

export default function ImportPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Templates | null>(null);
  const [type, setType] = useState<ImportType>("listings");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allowedTypes = TYPE_META.filter((t) => can(user, t.permission));

  useEffect(() => {
    if (!allowedTypes.length) return;
    apiFetch<Templates>("/import/templates")
      .then((data) => {
        setTemplates(data);
        if (!allowedTypes.find((t) => t.id === type)) {
          setType(allowedTypes[0].id);
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load templates"),
      );
  }, [user]);

  useEffect(() => {
    if (templates?.[type]?.sample && !csv && !fileName) {
      setCsv(templates[type].sample);
    }
  }, [type, templates]);

  async function onFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const text = await file.text();
    setCsv(text);
  }

  function downloadTemplate() {
    if (!templates?.[type]) return;
    const blob = new Blob([templates[type].sample], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<ImportResult>(`/import/${type}`, {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!allowedTypes.length) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        You need listings:write or contacts:write to import CSV files.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk upload"
        description="Import listings or contacts from a CSV file (max 500 rows). Download a template, fill it, then upload."
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Import type">
              <Select
                value={type}
                onChange={(e) => {
                  const next = e.target.value as ImportType;
                  setType(next);
                  setFileName(null);
                  setResult(null);
                  setCsv(templates?.[next]?.sample ?? "");
                }}
              >
                {allowedTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="CSV file">
              <FileButton
                accept=".csv,text/csv"
                fileName={fileName}
                label="Choose CSV"
                onFile={(file) => void onFile(file)}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={downloadTemplate}>
              Download template
            </Button>
            <Button type="submit" disabled={submitting || !csv.trim()}>
              {submitting ? "Importing…" : "Import CSV"}
            </Button>
            {submitting ? <Spinner label="Processing rows…" /> : null}
          </div>

          <Field label="CSV preview / edit">
            <textarea
              className="min-h-40 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--fg)] placeholder:text-[var(--fg-faint)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              spellCheck={false}
            />
          </Field>

          {templates?.[type] ? (
            <p className="text-xs text-[var(--fg-faint)]">
              Required columns: {templates[type].headers.join(", ")}. Tags /
              amenities use | or ; separators. Photos must be full https URLs.
            </p>
          ) : null}
        </form>
      </Card>

      {result ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-[var(--fg)]">Import result</h2>
          <p className="mb-3 text-sm text-[var(--fg-muted)]">
            {result.created} created, {result.failed} failed (of {result.total})
          </p>
          <Table headers={["Row", "Status", "Code", "Detail"]}>
            {result.results.map((r) => (
              <tr key={r.row} className="table-row-hover">
                <td className="px-3 py-2 tabular-nums">{r.row}</td>
                <td className="px-3 py-2">
                  <Badge tone={statusTone(r.ok ? "OK" : "FAILED")}>
                    {r.ok ? "OK" : "Failed"}
                  </Badge>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-[var(--fg-muted)]">
                  {r.code ?? "—"}
                </td>
                <td className="px-3 py-2 text-sm text-[var(--fg-muted)]">
                  {r.ok ? r.id : r.error}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, Field, Input, PageHeader, Table } from "@/components/ui";
import { apiFetch, can } from "@/lib/api";

type Developer = {
  id: string;
  developerCode: string;
  name: string;
  phoneE164: string;
  companyName?: string | null;
  region?: string | null;
  activeStatus: string;
  optInStatus: boolean;
  _count?: { projects: number; prospects: number };
};

export default function DevelopersPage() {
  const { user } = useAuth();
  const canWrite = can(user, "contacts:write");
  const [rows, setRows] = useState<Developer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    companyName: "",
    region: "",
    email: "",
  });

  async function load() {
    const res = await apiFetch<{ data: Developer[] }>("/developers");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await apiFetch<Developer>("/developers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          companyName: form.companyName || null,
          region: form.region || null,
          email: form.email || null,
        }),
      });
      setForm({ name: "", phone: "", companyName: "", region: "", email: "" });
      await load();
      window.location.href = `/dashboard/developers/${created.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developers"
        description="External developer partners and their pre-launch projects."
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {canWrite ? (
        <Card>
          <h2 className="mb-3 font-medium">Create developer</h2>
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
            <Field label="Company">
              <Input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              />
            </Field>
            <Field label="Region">
              <Input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Create</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-600">No developers yet.</p>
        </Card>
      ) : (
        <Table headers={["Code", "Name", "Company", "Phone", "Projects", ""]}>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-zinc-100">
              <td className="px-3 py-2">{row.developerCode}</td>
              <td className="px-3 py-2">{row.name}</td>
              <td className="px-3 py-2">{row.companyName ?? "—"}</td>
              <td className="px-3 py-2">{row.phoneE164}</td>
              <td className="px-3 py-2">{row._count?.projects ?? 0}</td>
              <td className="px-3 py-2">
                <Link className="underline" href={`/dashboard/developers/${row.id}`}>
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

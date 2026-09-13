"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { apiFetch, can } from "@/lib/api";

type Staff = {
  id: string;
  name: string;
  email: string;
  role: string;
  activeStatus: string;
};

const ROLES = ["ADMIN", "CAMPAIGN_MANAGER", "SUPPORT_AGENT", "VIEWER"];

export default function StaffPage() {
  const { user } = useAuth();
  const canWrite = can(user, "staff:write");
  const [rows, setRows] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "VIEWER",
  });

  async function load() {
    const res = await apiFetch<{ data: Staff[] }>("/staff");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/staff", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", email: "", password: "", role: "VIEWER" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function toggleActive(row: Staff) {
    await apiFetch(`/staff/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        activeStatus: row.activeStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Staff" description="Internal dashboard users and roles." />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {canWrite ? (
        <Card>
          <h2 className="mb-3 font-medium">Create staff</h2>
          <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-2">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
              />
            </Field>
            <Field label="Role">
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Button type="submit">Create</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Table headers={["Name", "Email", "Role", "Status", "Actions"]}>
        {rows.map((row) => (
          <tr key={row.id} className="border-t border-zinc-100">
            <td className="px-3 py-2">{row.name}</td>
            <td className="px-3 py-2">{row.email}</td>
            <td className="px-3 py-2">{row.role}</td>
            <td className="px-3 py-2">{row.activeStatus}</td>
            <td className="px-3 py-2">
              {canWrite ? (
                <Button variant="secondary" onClick={() => void toggleActive(row)}>
                  {row.activeStatus === "ACTIVE" ? "Deactivate" : "Activate"}
                </Button>
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

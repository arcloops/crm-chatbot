"use client";

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
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    try {
      await apiFetch("/staff", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", email: "", password: "", role: "VIEWER" });
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
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
      <PageHeader
        title="Staff"
        description="Internal dashboard users and roles."
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setError(null);
                setCreateOpen(true);
              }}
            >
              Create staff
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
        title="Create staff"
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
              {saving ? "Creating…" : "Create staff"}
            </Button>
          </div>
        </form>
      </Modal>

      {rows.length === 0 ? (
        <EmptyState title="No staff yet" description="Create a staff member to get started." />
      ) : (
        <Table headers={["Name", "Email", "Role", "Status", "Actions"]}>
          {rows.map((row) => (
            <tr key={row.id} className="table-row-hover">
              <td className="px-3 py-2">{row.name}</td>
              <td className="px-3 py-2">{row.email}</td>
              <td className="px-3 py-2">{row.role}</td>
              <td className="px-3 py-2">
                <Badge tone={statusTone(row.activeStatus)}>{row.activeStatus}</Badge>
              </td>
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
      )}
    </div>
  );
}

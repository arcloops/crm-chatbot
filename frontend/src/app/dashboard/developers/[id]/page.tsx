"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { apiFetch, can } from "@/lib/api";

type Project = {
  id: string;
  projectCode: string;
  name: string;
  location: string;
  status: string;
  _count?: { listings: number };
};

type Developer = {
  id: string;
  developerCode: string;
  name: string;
  companyName?: string | null;
  phoneE164: string;
  projects: Project[];
};

type ProjectDetail = {
  id: string;
  name: string;
  listings: { id: string; listingCode: string; title: string; price: string }[];
};

export default function DeveloperDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const canWrite = can(user, "contacts:write");
  const canListings = can(user, "listings:write");
  const [developer, setDeveloper] = useState<Developer | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({
    name: "",
    location: "",
    status: "PLANNING",
  });
  const [bulkForm, setBulkForm] = useState({
    projectId: "",
    titlePrefix: "",
    unitNumbers: "A1,A2,A3",
    price: "",
  });

  async function load() {
    const data = await apiFetch<Developer>(`/developers/${params.id}`);
    setDeveloper(data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, [params.id]);

  async function createProject(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch(`/developers/${params.id}/projects`, {
        method: "POST",
        body: JSON.stringify(projectForm),
      });
      setProjectForm({ name: "", location: "", status: "PLANNING" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create project failed");
    }
  }

  async function openProject(id: string) {
    const data = await apiFetch<ProjectDetail>(`/projects/${id}`);
    setSelectedProject(data);
    setBulkForm((f) => ({ ...f, projectId: id, titlePrefix: data.name }));
  }

  async function bulkCreate(e: FormEvent) {
    e.preventDefault();
    if (!bulkForm.projectId) return;
    setError(null);
    try {
      const units = bulkForm.unitNumbers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await apiFetch(`/projects/${bulkForm.projectId}/listings/bulk`, {
        method: "POST",
        body: JSON.stringify({
          titlePrefix: bulkForm.titlePrefix,
          unitNumbers: units,
          price: Number(bulkForm.price),
        }),
      });
      await openProject(bulkForm.projectId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk create failed");
    }
  }

  if (!developer) {
    return <p className="text-sm text-zinc-600">{error ?? "Loading…"}</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={developer.name}
        description={`${developer.developerCode} · ${developer.companyName ?? "—"} · ${developer.phoneE164}`}
        actions={
          <Link href="/dashboard/developers" className="text-sm underline">
            Back
          </Link>
        }
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {canWrite ? (
        <Card>
          <h2 className="mb-3 font-medium">Add project</h2>
          <form onSubmit={createProject} className="grid gap-3 md:grid-cols-3">
            <Field label="Name">
              <Input
                value={projectForm.name}
                onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Location">
              <Input
                value={projectForm.location}
                onChange={(e) =>
                  setProjectForm({ ...projectForm, location: e.target.value })
                }
                required
              />
            </Field>
            <Field label="Status">
              <Select
                value={projectForm.status}
                onChange={(e) =>
                  setProjectForm({ ...projectForm, status: e.target.value })
                }
              >
                <option value="PLANNING">PLANNING</option>
                <option value="PRE_LAUNCH">PRE_LAUNCH</option>
                <option value="SELLING">SELLING</option>
                <option value="COMPLETED">COMPLETED</option>
              </Select>
            </Field>
            <Button type="submit">Create project</Button>
          </form>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 font-medium">Projects</h2>
        {developer.projects.length === 0 ? (
          <p className="text-sm text-zinc-500">No projects yet.</p>
        ) : (
          <Table headers={["Code", "Name", "Location", "Status", "Listings", ""]}>
            {developer.projects.map((p) => (
              <tr key={p.id} className="border-t border-zinc-100">
                <td className="px-3 py-2">{p.projectCode}</td>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2">{p.location}</td>
                <td className="px-3 py-2">{p.status}</td>
                <td className="px-3 py-2">{p._count?.listings ?? 0}</td>
                <td className="px-3 py-2">
                  <Button variant="secondary" onClick={() => void openProject(p.id)}>
                    View / bulk
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {selectedProject && canListings ? (
        <Card>
          <h2 className="mb-3 font-medium">
            Bulk pre-launch units — {selectedProject.name}
          </h2>
          <form onSubmit={bulkCreate} className="mb-4 grid gap-3 md:grid-cols-2">
            <Field label="Title prefix">
              <Input
                value={bulkForm.titlePrefix}
                onChange={(e) =>
                  setBulkForm({ ...bulkForm, titlePrefix: e.target.value })
                }
                required
              />
            </Field>
            <Field label="Unit numbers (comma-separated)">
              <Input
                value={bulkForm.unitNumbers}
                onChange={(e) =>
                  setBulkForm({ ...bulkForm, unitNumbers: e.target.value })
                }
                required
              />
            </Field>
            <Field label="Price">
              <Input
                type="number"
                value={bulkForm.price}
                onChange={(e) => setBulkForm({ ...bulkForm, price: e.target.value })}
                required
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Create units</Button>
            </div>
          </form>
          <Table headers={["Code", "Title", "Price"]}>
            {selectedProject.listings.map((l) => (
              <tr key={l.id} className="border-t border-zinc-100">
                <td className="px-3 py-2">{l.listingCode}</td>
                <td className="px-3 py-2">
                  <Link className="underline" href={`/dashboard/listings/${l.id}`}>
                    {l.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{l.price}</td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

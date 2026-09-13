"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { apiFetch, can } from "@/lib/api";
import { useRouter } from "next/navigation";

type Settings = {
  id: string;
  defaultCurrency: string;
  coldLeadDays: number;
  whatsappMode: "MOCK" | "LIVE";
  bspDisplayName?: string | null;
  conversationRetentionDays?: number;
  integrationWebhookUrl?: string | null;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const canPrivacy = can(user, "privacy:admin");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [privacyPhone, setPrivacyPhone] = useState("");
  const [privacyMsg, setPrivacyMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }
    apiFetch<Settings>("/settings")
      .then(setSettings)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, [user, router]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<Settings>("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          defaultCurrency: settings.defaultCurrency,
          coldLeadDays: settings.coldLeadDays,
          whatsappMode: settings.whatsappMode,
          bspDisplayName: settings.bspDisplayName || null,
          conversationRetentionDays: settings.conversationRetentionDays ?? 365,
          integrationWebhookUrl: settings.integrationWebhookUrl || null,
        }),
      });
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function exportPrivacy() {
    setPrivacyMsg(null);
    try {
      const data = await apiFetch<unknown>(
        `/privacy/export?phone=${encodeURIComponent(privacyPhone)}`,
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `privacy-export-${privacyPhone}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setPrivacyMsg("Export downloaded.");
    } catch (err) {
      setPrivacyMsg(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function deletePrivacy() {
    if (
      !window.confirm(
        "Anonymize this phone across contacts and delete conversation history? Suppression tombstone will remain.",
      )
    ) {
      return;
    }
    setPrivacyMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean }>(`/privacy/delete`, {
        method: "POST",
        body: JSON.stringify({ phone: privacyPhone }),
      });
      setPrivacyMsg(res.ok ? "Deleted / anonymized." : "Failed");
    } catch (err) {
      setPrivacyMsg(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function runRetention() {
    try {
      const res = await apiFetch<{ deletedMessages: number }>("/privacy/retention/run", {
        method: "POST",
      });
      setPrivacyMsg(`Retention run deleted ${res.deletedMessages} messages.`);
    } catch (err) {
      setPrivacyMsg(err instanceof Error ? err.message : "Retention failed");
    }
  }

  if (!settings) {
    return <p className="text-sm text-zinc-600">{error ?? "Loading…"}</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Currency, cold leads, WhatsApp mode, retention, and privacy tools."
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="text-sm text-green-700">Saved.</p> : null}

      <Card>
        <form onSubmit={onSave} className="grid max-w-lg gap-3">
          <Field label="Default currency">
            <Input
              value={settings.defaultCurrency}
              onChange={(e) =>
                setSettings({ ...settings, defaultCurrency: e.target.value })
              }
            />
          </Field>
          <Field label="Cold lead days">
            <Input
              type="number"
              value={settings.coldLeadDays}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  coldLeadDays: Number(e.target.value) || 30,
                })
              }
            />
          </Field>
          <Field label="Conversation retention days">
            <Input
              type="number"
              value={settings.conversationRetentionDays ?? 365}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  conversationRetentionDays: Number(e.target.value) || 365,
                })
              }
            />
          </Field>
          <Field label="WhatsApp mode">
            <Select
              value={settings.whatsappMode}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  whatsappMode: e.target.value as "MOCK" | "LIVE",
                })
              }
            >
              <option value="MOCK">MOCK</option>
              <option value="LIVE">LIVE</option>
            </Select>
          </Field>
          <Field label="BSP display name">
            <Input
              value={settings.bspDisplayName ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, bspDisplayName: e.target.value })
              }
              placeholder="Mock BSP / Twilio"
            />
          </Field>
          <Field label="Integration webhook URL (reserved)">
            <Input
              value={settings.integrationWebhookUrl ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, integrationWebhookUrl: e.target.value })
              }
              placeholder="https://example.com/hooks/crm (unused until Phase 12+)"
            />
          </Field>
          <p className="text-xs text-zinc-500">
            Compliance: inbound STOP/UNSUBSCRIBE auto-suppresses; START restores opt-in
            with consent timestamp.
          </p>
          <Button type="submit">Save settings</Button>
        </form>
      </Card>

      {canPrivacy ? (
        <Card>
          <h2 className="mb-3 font-medium">Privacy (Admin)</h2>
          <div className="grid max-w-lg gap-3">
            <Field label="Phone">
              <Input
                value={privacyPhone}
                onChange={(e) => setPrivacyPhone(e.target.value)}
                placeholder="+880..."
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void exportPrivacy()}>
                Export JSON
              </Button>
              <Button variant="danger" onClick={() => void deletePrivacy()}>
                Delete / anonymize
              </Button>
              <Button variant="secondary" onClick={() => void runRetention()}>
                Run retention now
              </Button>
            </div>
            {privacyMsg ? <p className="text-sm text-zinc-600">{privacyMsg}</p> : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("admin@arcloops.local");
  const [password, setPassword] = useState("Admin123!ChangeMe");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 20%, #ccfbf1 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 85% 75%, #e0f2fe 0%, transparent 50%), linear-gradient(165deg, #f1f5f9 0%, #e2e8f0 100%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f766e' fill-opacity='0.06'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
        aria-hidden
      />

      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-md space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]/95 p-8 shadow-[var(--shadow-md)] backdrop-blur-sm"
      >
        <div>
          <p className="font-display text-3xl font-semibold tracking-tight text-[var(--fg)]">
            Arcloops
          </p>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">WhatsApp property CRM</p>
          <h1 className="mt-5 text-lg font-semibold text-[var(--fg)]">Sign in</h1>
        </div>

        <Field label="Email">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            required
          />
        </Field>

        <Field label="Password">
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>

        {error ? <Alert>{error}</Alert> : null}

        <Button type="submit" disabled={submitting} className="w-full py-2.5">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

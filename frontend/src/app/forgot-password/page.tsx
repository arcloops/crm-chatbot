"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AuthLinkRow, AuthShell } from "@/components/AuthShell";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { apiFetch, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    setDevResetUrl(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        message: string;
        devResetUrl?: string;
      }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(res.message);
      if (res.devResetUrl) setDevResetUrl(res.devResetUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg)]">
        <Spinner />
      </div>
    );
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your email and we’ll send a reset link if an account exists."
      footer={<AuthLinkRow prompt="Remembered it?" href="/login" label="Back to sign in" />}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
        </Field>

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}
        {devResetUrl ? (
          <Alert tone="info">
            Dev reset link (no email configured):{" "}
            <a href={devResetUrl} className="underline underline-offset-2">
              Open reset page
            </a>
          </Alert>
        ) : null}

        <Button type="submit" disabled={submitting} className="w-full py-2.5">
          {submitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}

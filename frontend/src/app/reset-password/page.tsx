"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AuthLinkRow, AuthShell } from "@/components/AuthShell";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { apiFetch, ApiError } from "@/lib/api";

function ResetPasswordInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setError("Missing reset token. Request a new link.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setMessage(res.message);
      setTimeout(() => router.replace("/login"), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reset failed");
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
      title="Reset password"
      subtitle="Choose a new password for your staff account."
      footer={<AuthLinkRow prompt="Ready to continue?" href="/login" label="Sign in" />}
    >
      {!token ? (
        <Alert tone="warning">
          This reset link is incomplete. Request a new one from{" "}
          <a href="/forgot-password" className="underline underline-offset-2">
            forgot password
          </a>
          .
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="New password">
            <div className="relative">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
                minLength={8}
                className="pr-16"
              />
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-1 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </Field>
          <Field label="Confirm password">
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Repeat password"
              required
              minLength={8}
            />
          </Field>

          {error ? <Alert tone="danger">{error}</Alert> : null}
          {message ? <Alert tone="success">{message}</Alert> : null}

          <Button type="submit" disabled={submitting || Boolean(message)} className="w-full py-2.5">
            {submitting ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[var(--bg)]">
          <Spinner label="Loading…" />
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}

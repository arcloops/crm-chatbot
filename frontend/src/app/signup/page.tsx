"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AuthLinkRow, AuthShell } from "@/components/AuthShell";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api";

export default function SignupPage() {
  const { signup, user, loading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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
    try {
      await signup(name, email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign up failed");
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
      title="Create account"
      subtitle="Set up staff access. First account becomes admin; later accounts start as viewers."
      footer={<AuthLinkRow prompt="Already have an account?" href="/login" label="Sign in" />}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Your name"
            required
            minLength={2}
          />
        </Field>
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
        <Field label="Password">
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

        <Button type="submit" disabled={submitting} className="w-full py-2.5">
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}

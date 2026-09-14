"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeProvider";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 65% 50% at 12% 18%, color-mix(in srgb, var(--palette-periwinkle) 32%, transparent) 0%, transparent 55%), radial-gradient(ellipse 50% 45% at 88% 82%, color-mix(in srgb, var(--palette-slate) 22%, transparent) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <section className="relative z-10 hidden w-[44%] flex-col justify-between border-r border-[var(--border)] bg-[var(--palette-navy)] p-10 text-[var(--palette-cream)] lg:flex dark:bg-[var(--surface)]">
        <div>
          <p className="font-display text-3xl font-semibold tracking-tight">arXcrm</p>
          <p className="mt-2 max-w-xs text-sm text-[var(--palette-periwinkle)]">
            Property CRM with WhatsApp campaigns and an AI assistant.
          </p>
        </div>
        <div className="space-y-3">
          <p className="font-display text-2xl leading-snug font-semibold tracking-tight">
            Run listings, contacts, and conversations in one place.
          </p>
          <p className="max-w-sm text-sm text-[var(--palette-periwinkle)]">
            Sign in to manage inventory, suppressions, campaigns, and inbox — or create an
            account to get started.
          </p>
        </div>
        <p className="text-xs text-[var(--palette-periwinkle)]/80">arXcrm · staff access</p>
      </section>

      <section className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <p className="font-display text-3xl font-semibold tracking-tight">arXcrm</p>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">WhatsApp property CRM</p>
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]/90 p-7 shadow-[var(--shadow-md)] backdrop-blur-xl sm:p-8">
            <div className="mb-6">
              <h1 className="text-xl font-semibold tracking-tight text-[var(--fg)]">{title}</h1>
              {subtitle ? (
                <p className="mt-1.5 text-sm text-[var(--fg-muted)]">{subtitle}</p>
              ) : null}
            </div>
            {children}
            {footer ? <div className="mt-6 border-t border-[var(--border)] pt-5">{footer}</div> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

export function AuthLinkRow({
  prompt,
  href,
  label,
}: {
  prompt: string;
  href: string;
  label: string;
}) {
  return (
    <p className="text-center text-sm text-[var(--fg-muted)]">
      {prompt}{" "}
      <Link href={href} className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
        {label}
      </Link>
    </p>
  );
}

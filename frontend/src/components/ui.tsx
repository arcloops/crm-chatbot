"use client";

import { useId, type ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-[var(--fg-muted)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] transition-shadow duration-[var(--duration-fast)] ease-[var(--ease)] hover:shadow-[var(--shadow-md)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  const styles =
    variant === "primary"
      ? "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
      : variant === "danger"
        ? "bg-[var(--danger)] text-white hover:bg-red-500"
        : "border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] hover:bg-[var(--bg)]";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors duration-[var(--duration-fast)] ease-[var(--ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

const controlClass =
  "w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease)] placeholder:text-[var(--fg-faint)] hover:border-slate-300 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`${controlClass} ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${controlClass} ${props.className ?? ""}`}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${controlClass} ${props.className ?? ""}`}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-[var(--fg-muted)]">{label}</span>
      {children}
    </label>
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] bg-slate-50/90 text-[var(--fg-muted)]">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2.5 text-xs font-semibold tracking-wide uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">{children}</tbody>
      </table>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-100 text-slate-700",
    success: "bg-[var(--success-muted)] text-[var(--success)]",
    warning: "bg-[var(--warning-muted)] text-[var(--warning)]",
    danger: "bg-[var(--danger-muted)] text-[var(--danger)]",
    info: "bg-[var(--info-muted)] text-[var(--info)]",
    accent: "bg-[var(--accent-muted)] text-[var(--accent)]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function statusTone(
  status: string,
): "neutral" | "success" | "warning" | "danger" | "info" | "accent" {
  const s = status.toUpperCase();
  if (["AVAILABLE", "ACTIVE", "SENT", "REPLIED", "OPT_IN", "COMPLETED"].includes(s))
    return "success";
  if (["COMING_SOON", "RESERVED", "UNDER_OFFER", "PENDING", "QUEUED", "RUNNING"].includes(s))
    return "warning";
  if (["SOLD", "RENTED", "STOPPED", "FAILED", "SUPPRESSED", "ARCHIVED"].includes(s))
    return "danger";
  if (["NEW", "CONTACTED", "QUALIFIED"].includes(s)) return "info";
  return "accent";
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center">
      <p className="text-sm font-medium text-[var(--fg)]">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--fg-muted)]">{description}</p>
      ) : null}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
      <span
        className="inline-block size-4 animate-spin rounded-full border-2 border-[var(--accent-muted)] border-t-[var(--accent)]"
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-sm)] bg-slate-200/80 ${className}`}
      aria-hidden
    />
  );
}

export function Alert({
  children,
  tone = "danger",
  className = "",
}: {
  children: ReactNode;
  tone?: "danger" | "success" | "info" | "warning";
  className?: string;
}) {
  const tones: Record<string, string> = {
    danger: "border-red-200 bg-[var(--danger-muted)] text-[var(--danger)]",
    success: "border-emerald-200 bg-[var(--success-muted)] text-[var(--success)]",
    info: "border-sky-200 bg-[var(--info-muted)] text-[var(--info)]",
    warning: "border-amber-200 bg-[var(--warning-muted)] text-[var(--warning)]",
  };
  return (
    <div
      className={`rounded-[var(--radius-sm)] border px-3 py-2 text-sm ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

export function FileButton({
  accept,
  fileName,
  onFile,
  label = "Choose file",
}: {
  accept?: string;
  fileName?: string | null;
  onFile: (file: File | null) => void;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={id}
        className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--fg)] shadow-[var(--shadow-sm)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease)] hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] hover:text-[var(--accent)] focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-2"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className="shrink-0 opacity-70"
        >
          <path
            d="M8 2v8m0 0L5.5 7.5M8 10l2.5-2.5M3 12.5h10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {label}
      </label>
      <span className="min-w-0 truncate text-sm text-[var(--fg-muted)]">
        {fileName ?? "No file chosen"}
      </span>
    </div>
  );
}

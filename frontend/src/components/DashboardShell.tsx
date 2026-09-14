"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, Input, Spinner } from "@/components/ui";
import { can, type Permission } from "@/lib/api";

type NavItem = {
  href: string;
  label: string;
  permission?: Permission;
  adminOnly?: boolean;
  comingSoon?: boolean;
  group: "main" | "inventory" | "people" | "comms" | "admin";
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", group: "main" },
  { href: "/dashboard/listings", label: "Listings", permission: "listings:read", group: "inventory" },
  { href: "/dashboard/import", label: "Bulk upload", group: "inventory" },
  { href: "/dashboard/brokers", label: "Brokers", permission: "contacts:read", group: "people" },
  { href: "/dashboard/customers", label: "Customers", permission: "contacts:read", group: "people" },
  { href: "/dashboard/prospects", label: "Prospects", permission: "contacts:read", group: "people" },
  { href: "/dashboard/developers", label: "Developers", permission: "contacts:read", group: "people" },
  {
    href: "/dashboard/suppression",
    label: "Suppression",
    permission: "suppression:read",
    group: "comms",
  },
  { href: "/dashboard/campaigns", label: "Campaigns", permission: "campaigns:read", group: "comms" },
  { href: "/dashboard/analytics", label: "Analytics", permission: "campaigns:read", group: "comms" },
  { href: "/dashboard/inbox", label: "Inbox", permission: "inbox:read", group: "comms" },
  { href: "/dashboard/bot", label: "Bot playground", permission: "inbox:read", group: "comms" },
  { href: "/dashboard/whatsapp", label: "WhatsApp Lab", permission: "contacts:read", group: "comms" },
  { href: "/dashboard/settings", label: "Settings", adminOnly: true, group: "admin" },
  { href: "/dashboard/staff", label: "Staff", permission: "staff:read", adminOnly: true, group: "admin" },
];

const GROUP_LABELS: Record<NavItem["group"], string | null> = {
  main: null,
  inventory: "Inventory",
  people: "People",
  comms: "Comms",
  admin: "Admin",
};

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <Spinner label="Loading workspace…" />
      </div>
    );
  }

  const items = NAV.filter((item) => {
    if (item.comingSoon) return true;
    if (item.adminOnly && user.role !== "ADMIN") return false;
    if (item.permission && !can(user, item.permission)) return false;
    return true;
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) return;
    router.push(`/dashboard/search?q=${encodeURIComponent(term)}`);
  }

  function renderNav() {
    let lastGroup: NavItem["group"] | null = null;
    return items.map((item) => {
      const showGroup =
        item.group !== lastGroup && GROUP_LABELS[item.group] !== null;
      lastGroup = item.group;
      const groupLabel = GROUP_LABELS[item.group];

      if (item.comingSoon) {
        return (
          <div key={item.href}>
            {showGroup && groupLabel ? (
              <p className="mb-1 mt-3 px-3 text-[10px] font-semibold tracking-wider text-[var(--fg-faint)] uppercase">
                {groupLabel}
              </p>
            ) : null}
            <span
              title="Coming in a later phase"
              className="block cursor-not-allowed rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--fg-faint)]"
            >
              {item.label}
              <span className="ml-1 text-[10px] uppercase">Soon</span>
            </span>
          </div>
        );
      }

      const active =
        item.href === "/dashboard"
          ? pathname === item.href
          : pathname.startsWith(item.href);

      return (
        <div key={item.href}>
          {showGroup && groupLabel ? (
            <p className="mb-1 mt-3 px-3 text-[10px] font-semibold tracking-wider text-[var(--fg-faint)] uppercase">
              {groupLabel}
            </p>
          ) : null}
          <Link
            href={item.href}
            className={`relative block rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-colors duration-[var(--duration-fast)] ease-[var(--ease)] ${
              active
                ? "bg-[var(--accent-muted)] font-medium text-[var(--accent)]"
                : "text-[var(--fg-muted)] hover:bg-slate-100 hover:text-[var(--fg)]"
            }`}
          >
            {active ? (
              <span
                className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[var(--accent)]"
                aria-hidden
              />
            ) : null}
            {item.label}
          </Link>
        </div>
      );
    });
  }

  const brandBlock = (
    <div className="border-b border-[var(--border)] px-4 py-4">
      <p className="font-display text-xl font-semibold tracking-tight text-[var(--fg)]">
        Arcloops
      </p>
      <p className="text-xs font-medium tracking-wide text-[var(--fg-muted)]">CRM</p>
      <p className="mt-2 truncate text-sm text-[var(--fg-muted)]">
        {user.name}
        <span className="text-[var(--fg-faint)]"> · {user.role}</span>
      </p>
    </div>
  );

  const navBlock = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">{renderNav()}</nav>
  );

  const logoutBlock = (
    <div className="border-t border-[var(--border)] p-3">
      <Button variant="secondary" onClick={logout} className="w-full">
        Log out
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:flex">
        {brandBlock}
        {navBlock}
        {logoutBlock}
      </aside>

      {navOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
          <aside className="relative z-50 flex h-full w-64 max-w-[85vw] flex-col bg-[var(--surface)] shadow-[var(--shadow-md)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div>
                <p className="font-display text-lg font-semibold">Arcloops</p>
                <p className="text-xs text-[var(--fg-muted)]">
                  {user.name} · {user.role}
                </p>
              </div>
              <button
                type="button"
                className="rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--fg-muted)] hover:bg-slate-100"
                onClick={() => setNavOpen(false)}
              >
                Close
              </button>
            </div>
            {navBlock}
            {logoutBlock}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-2 text-sm text-[var(--fg-muted)] transition-colors hover:bg-slate-50 md:hidden"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
            >
              Menu
            </button>
            <form onSubmit={onSearch} className="flex min-w-0 max-w-xl flex-1 gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search listings, brokers, customers, prospects…"
                className="py-2.5"
              />
              <Button type="submit">Search</Button>
            </form>
          </div>
        </header>
        <main className="page-enter min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

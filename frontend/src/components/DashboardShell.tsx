"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, Spinner } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeProvider";
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

const FULL_BLEED = new Set(["/dashboard/inbox", "/dashboard/bot"]);

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const fullBleed = FULL_BLEED.has(pathname);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--bg)]">
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
            className={`nav-link relative block rounded-[var(--radius-sm)] px-3 py-2 text-sm ${
              active
                ? "nav-link-active bg-[var(--accent-muted)] font-medium text-[var(--accent)]"
                : "text-[var(--fg-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--fg)]"
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
        arXcrm
      </p>
      <p className="mt-2 truncate text-sm text-[var(--fg-muted)]">
        {user.name}
        <span className="text-[var(--fg-faint)]"> · {user.role}</span>
      </p>
    </div>
  );

  const navBlock = (
    <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
      <div className="flex flex-col gap-0.5">{renderNav()}</div>
    </nav>
  );

  const chatActive = pathname.startsWith("/dashboard/bot");
  const canChat = can(user, "inbox:read");

  const logoutBlock = (
    <div className="space-y-2 border-t border-[var(--border)] p-3">
      {canChat ? (
        <Link
          href="/dashboard/bot"
          className={`nav-link relative block rounded-[var(--radius-sm)] px-3 py-2 text-sm ${
            chatActive
              ? "nav-link-active bg-[var(--accent-muted)] font-medium text-[var(--accent)]"
              : "text-[var(--fg-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--fg)]"
          }`}
        >
          {chatActive ? (
            <span
              className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[var(--accent)]"
              aria-hidden
            />
          ) : null}
          Chat
        </Link>
      ) : null}
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-xs text-[var(--fg-muted)]">Theme</span>
        <ThemeToggle />
      </div>
      <Button variant="secondary" onClick={logout} className="w-full">
        Log out
      </Button>
    </div>
  );

  return (
    <div className="app-shell flex h-dvh overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      <aside className="glass-panel metal-edge hidden h-full w-56 shrink-0 flex-col overflow-hidden border-r border-[var(--border)] md:flex">
        <div className="shrink-0">{brandBlock}</div>
        {navBlock}
        <div className="shrink-0">{logoutBlock}</div>
      </aside>

      {navOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
          <aside className="glass-panel metal-edge relative z-50 flex h-full w-64 max-w-[85vw] flex-col overflow-hidden shadow-[var(--shadow-glow)]">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div>
                <p className="font-display text-lg font-semibold">arXcrm</p>
                <p className="text-xs text-[var(--fg-muted)]">
                  {user.name} · {user.role}
                </p>
              </div>
              <button
                type="button"
                className="rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--fg-muted)] hover:bg-[var(--surface-elevated)]"
                onClick={() => setNavOpen(false)}
              >
                Close
              </button>
            </div>
            {navBlock}
            <div className="shrink-0">{logoutBlock}</div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="glass-panel z-30 flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 md:hidden">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-2 text-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-elevated)]"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            Menu
          </button>
          <p className="min-w-0 flex-1 font-display text-base font-semibold text-[var(--fg)]">
            arXcrm
          </p>
          <ThemeToggle />
        </header>
        <main
          key={pathname}
          className={`page-enter min-h-0 min-w-0 flex-1 ${
            fullBleed
              ? "overflow-hidden p-0"
              : "overflow-y-auto px-4 py-6 sm:px-6"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { can, type Permission } from "@/lib/api";

const NAV: {
  href: string;
  label: string;
  permission?: Permission;
  adminOnly?: boolean;
  comingSoon?: boolean;
}[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/listings", label: "Listings", permission: "listings:read" },
  { href: "/dashboard/brokers", label: "Brokers", permission: "contacts:read" },
  { href: "/dashboard/customers", label: "Customers", permission: "contacts:read" },
  { href: "/dashboard/prospects", label: "Prospects", permission: "contacts:read" },
  { href: "/dashboard/developers", label: "Developers", permission: "contacts:read" },
  {
    href: "/dashboard/suppression",
    label: "Suppression",
    permission: "suppression:read",
  },
  { href: "/dashboard/campaigns", label: "Campaigns", permission: "campaigns:read" },
  { href: "/dashboard/analytics", label: "Analytics", permission: "campaigns:read" },
  { href: "/dashboard/inbox", label: "Inbox", permission: "inbox:read" },
  { href: "/dashboard/whatsapp", label: "WhatsApp Lab", permission: "contacts:read" },
  { href: "/dashboard/settings", label: "Settings", adminOnly: true },
  { href: "/dashboard/staff", label: "Staff", permission: "staff:read", adminOnly: true },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        Loading…
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

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-4">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Arcloops CRM
          </p>
          <p className="mt-1 text-sm text-zinc-700">
            {user.name} · {user.role}
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {items.map((item) => {
            if (item.comingSoon) {
              return (
                <span
                  key={item.href}
                  title="Coming in a later phase"
                  className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-zinc-400"
                >
                  {item.label}
                  <span className="ml-1 text-[10px] uppercase">Soon</span>
                </span>
              );
            }
            const active =
              item.href === "/dashboard"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm ${
                  active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-zinc-200 p-3">
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-zinc-200 bg-white px-6 py-3">
          <form onSubmit={onSearch} className="flex max-w-xl gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search listings, brokers, customers, prospects…"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
            >
              Search
            </button>
          </form>
        </header>
        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

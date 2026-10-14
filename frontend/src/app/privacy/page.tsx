import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy · arXcrm",
  description: "How arXcrm handles staff, contact, and WhatsApp data.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-full max-w-2xl bg-[var(--bg)] px-6 py-12 text-[var(--fg)]">
      <p className="font-display text-2xl font-semibold tracking-tight">arXcrm</p>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="mt-2 text-sm text-[var(--fg-muted)]">Last updated 14 October 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--fg-muted)]">
        <p>
          arXcrm is a staff dashboard for a real-estate team. It stores property listings,
          contacts, and WhatsApp conversations so the team can reply to leads and send
          approved message templates.
        </p>

        <section>
          <h2 className="text-base font-semibold text-[var(--fg)]">Data we store</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Staff accounts: name, email, role, and a password hash.</li>
            <li>Contacts: name, phone number, email, tags, and opt-in or opt-out status.</li>
            <li>WhatsApp messages sent and received, including message status.</li>
            <li>Property listings and notes attached to prospects or customers.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--fg)]">How it is used</h2>
          <p className="mt-2">
            Staff use this data to manage inventory, answer WhatsApp chats, and send
            campaigns. WhatsApp messages are delivered through Meta&apos;s WhatsApp Cloud API.
            Message content may be processed by an AI assistant to suggest replies and
            search listings. We do not sell this data.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--fg)]">Your choices</h2>
          <p className="mt-2">
            Reply STOP on WhatsApp to opt out of marketing messages. An administrator can
            export or delete the data stored for a phone number. Conversation messages are
            removed after the retention period set in the dashboard.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--fg)]">Contact</h2>
          <p className="mt-2">
            Privacy requests:{" "}
            <a className="text-[var(--accent)] underline" href="mailto:nawmi@arcloops.io">
              nawmi@arcloops.io
            </a>
          </p>
        </section>
      </div>

      <p className="mt-10 text-sm">
        <Link className="text-[var(--accent)] underline" href="/login">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}

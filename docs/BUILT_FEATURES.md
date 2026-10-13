# arXcrm — Built Features

Inventory of what the product actually ships today. The roadmap and deferred items live in [`PHASE_BY_PHASE_FEATURE_PLAN.md`](../PHASE_BY_PHASE_FEATURE_PLAN.md). This file only describes behavior that is implemented in the dashboard, API, and workers.

**Product:** WhatsApp broadcast CRM and AI property assistant for a real-estate team.  
**Stack:** Next.js dashboard (`frontend/`, port 3000) · Fastify API (`backend/`, port 4000) · PostgreSQL (Prisma) · Redis/BullMQ · Claude (or a mock agent) · WhatsApp MOCK or Meta Cloud API.

---

## Dashboard map

| Area | Route | Who can open it |
| --- | --- | --- |
| Overview | `/dashboard` | Any signed-in staff |
| Listings | `/dashboard/listings`, `/dashboard/listings/[id]` | `listings:read` |
| Brokers | `/dashboard/brokers` | `contacts:read` |
| Customers | `/dashboard/customers` | `contacts:read` |
| Prospects | `/dashboard/prospects` | `contacts:read` |
| Developers | `/dashboard/developers`, `/dashboard/developers/[id]` | `contacts:read` |
| Suppression | `/dashboard/suppression` | `suppression:read` |
| Campaigns | `/dashboard/campaigns`, `/dashboard/campaigns/[id]` | `campaigns:read` |
| Analytics | `/dashboard/analytics` | `campaigns:read` |
| Inbox | `/dashboard/inbox` | `inbox:read` |
| Chat (staff bot) | `/dashboard/bot` | `inbox:read` |
| Search | `/dashboard/search` | Any signed-in staff |
| Bulk import | `/dashboard/import` | Permission depends on the list |
| Settings | `/dashboard/settings` | Admin |
| Staff | `/dashboard/staff` | Admin with `staff:read` |

Auth pages: `/login`, `/signup`, `/forgot-password`, `/reset-password`. The site root redirects to login.

The shell has light/dark theme, a mobile nav, role-aware links, and logout. Inbox and Chat use a full-bleed layout.

---

## Roles

Staff roles are `ADMIN`, `CAMPAIGN_MANAGER`, `SUPPORT_AGENT`, and `VIEWER`. Permissions are derived from the role on every protected API route.

| Permission | Admin | Campaign manager | Support agent | Viewer |
| --- | --- | --- | --- | --- |
| Staff read / write | yes | | | |
| Listings read | yes | yes | yes | yes |
| Listings write | yes | yes | | |
| Contacts read | yes | yes | yes | yes |
| Contacts write | yes | yes | yes | |
| Suppression read | yes | yes | yes | yes |
| Suppression write | yes | yes | | |
| Campaigns read | yes | yes | | yes |
| Campaigns write | yes | yes | | |
| Inbox read | yes | yes | yes | |
| Inbox write | yes | | yes | |
| Privacy admin | yes | | | |

Inactive staff cannot sign in. The first signup becomes Admin; later signups start as Viewer.

---

## 1. Foundation

- Monorepo with shared npm scripts: `dev`, `build`, lint, typecheck, Prisma migrate/seed, Docker Compose for local Postgres and Redis.
- Environment and secrets for the database, Redis, JWT, CORS, S3, Claude, and WhatsApp.
- Structured logging and optional Sentry error capture.
- Health checks at `/health` and `/api/health` for Postgres, Redis, and optional object storage.
- Object storage helper (S3-compatible, including a custom endpoint) for uploads when credentials are set. Listing photos are stored as URL lists; the dashboard does not yet upload files itself.
- CI for lint, typecheck, and related checks.
- Seed script creates an admin, a viewer, and sample CRM data.

---

## 2. Auth and staff

- Email and password login with JWT stored in the browser. Logout clears the token. A 401 sends the user back to login.
- Signup, forgot-password, and reset-password with hashed, expiring, single-use reset tokens.
- Staff list, create, and activate/deactivate from the Staff page.
- Current user via `GET /auth/me`.

---

## 3. Listings

Listings are the inventory source of truth for the dashboard, campaigns, and the bot.

**Fields:** code, title, category (apartment, house, land, commercial, pre-launch, mixed use), transaction type (sale, rent, investment, lease), location, optional lat/long, price and currency (default BDT), size, beds/baths, amenities, photo URLs, description, installment plan, zoning, floor, year built, completion date, assigned broker, optional developer project.

**Status:** Available, Reserved, Under Offer, Sold, Rented, Coming Soon. Archive is a soft delete (`archivedAt`). `lastUpdated` moves on every write.

**Operations:**

- Create, edit, archive, and open a detail page.
- Filters: status, category, transaction type, location, bedrooms, price range, text search, active-only (excludes Sold and Rented), include archived.
- Location areas list for consistent area names.
- CSV bulk import with a downloadable template.

Sold and Rented listings are excluded from bot search results.

---

## 4. People

Every contact stores a normalized E.164 phone, opt-in flag with timestamps and source, tags, and a unique code.

### Brokers

- Create and edit: name, phone, email, region, specialization (residential, commercial, land), active/inactive, join date, tags, opt-in.
- Many-to-many assignment to listings, plus a primary broker on a listing.
- Workload view: open prospects and active listings.
- Bulk reassign listings, prospects, and customers from one broker to another.

### Customers

- Create and edit: name, phone, email, transaction type (bought, rented, invested), transaction date, linked listing, assigned broker, referral count, tags, opt-in.
- Assign a broker and toggle opt-in from the list.
- Record a referral: creates a new prospect with lead source `referral`.

### Prospects

- Create and edit: name, phone, budget range, preferred location, property type, intent (buy, rent, invest), lead source, lead stage, tags, notes, assigned broker, viewing time and note.
- Stages: New, Qualified, Viewing Booked, Cold. Stage and broker can be changed from the list.
- Convert a prospect into a customer (copies phone and broker, sets transaction fields, marks `convertedAt`). Conversion is blocked if that phone is already a customer or the prospect was already converted.
- Book a viewing, which moves the stage to Viewing Booked.
- The bot and inbox link a conversation via `conversationHistoryRef`.
- CSV import.

Cold-lead days is a setting the admin can save. Nothing yet moves prospects to Cold automatically.

### Developers and projects

- Developer CRUD: company, phone, email, region, active status, tags, opt-in.
- Projects under a developer: name, location, status (planning, pre-launch, selling, completed), description, completion date.
- Listings can belong to a project.
- Bulk-create listing units from a project.
- Prospects can be attributed to a referring developer.
- Developers are a campaign audience.

### Duplicate detection

`GET /contacts/duplicates` reports when the same phone already exists on a broker, customer, prospect, or developer.

---

## 5. Suppression and consent

- Suppression list keyed by phone, with opt-out date and source.
- Manual add, remove, and “is this number blocked?” check.
- Opt-out cascade: turning opt-in off on a contact writes the suppression row and keeps the contact out of targeting.
- Opt-in restore removes the suppression row and records a consent event.
- Campaign enqueue skips suppressed numbers and non-opted-in contacts.
- CSV import of suppression rows.
- Inbound WhatsApp keywords: `STOP`, `UNSUBSCRIBE`, and `CANCEL` opt out immediately. `START`, `SUBSCRIBE`, and `YES` opt back in. Both paths write a consent event.

---

## 6. WhatsApp

Provider abstraction with two modes, chosen in Settings:

- **MOCK** — local send and a staff-only inbound simulator (`POST /whatsapp/mock/inbound`). No Meta account required.
- **LIVE** — Meta Cloud API, including webhook verification and signature checks.

**Messaging:**

- Webhook for inbound messages and delivery receipts (`GET`/`POST /webhooks/whatsapp`).
- Outbound send for text, template, and media (`POST /whatsapp/send`).
- Template catalog stored locally and listed at `GET /whatsapp/templates`.
- Conversations track the 24-hour session window from the last inbound message. Outside that window, sends must use an approved template.
- Message statuses: Queued, Sent, Delivered, Read, Failed, with BSP message id and error code.
- Receipts update both inbox messages and campaign recipient rows.

---

## 7. Campaigns

Create a campaign with a name, audience, approved template, optional schedule (timezone, default `Asia/Dhaka`), rate limit, and merge fields.

**Audiences:** Brokers, Customers, Prospects, Developers. Filters include tags, prospect stages, broker regions, a specific listing, a developer, and opt-in-only (on by default).

**Merge fields** filled per recipient: name, listing title, price, location, broker name, CTA URL.

**Lifecycle:** Draft → Scheduled or Running → Paused, Completed, or Cancelled.

**Send path:**

1. Preview audience count and who would be skipped.
2. Preflight: template present, audience size, opt-in and suppression gates.
3. Start now, or schedule. A local poller (and `GET /cron/campaigns/tick` for hosted cron) picks up due campaigns.
4. BullMQ worker throttles to `rateLimitPerSec`, retries transient errors, and writes a per-recipient log.
5. Pause or cancel a running campaign.
6. Clone a campaign back to draft.
7. Report: sent, delivered, read, failed, skipped, replied.

Optional A/B fields exist on the campaign (`templateVariantB`, `abSplitPercent`) and are stored with the record.

On Vercel the queue is disabled; campaign workers run where Redis and a long-lived Node process are available.

---

## 8. AI property assistant

Two entry points share the same tools:

- **WhatsApp** — inbound text is answered unless the thread is in human takeover.
- **Dashboard Chat** (`/dashboard/bot`) — staff chat with saved local sessions, via `POST /agent/chat`. `GET /agent/status` reports whether Claude or the mock agent is active.

If `ANTHROPIC_API_KEY` is set, replies come from Claude with tool use. Otherwise `MockAgent` runs the same tools with heuristic replies.

**Tools:**

| Tool | What it does |
| --- | --- |
| `search_listings` | Live portfolio search by location, type, budget, bedrooms, and buy/rent/invest. Only Available and Coming Soon. |
| `get_listing_detail` | One listing by code or id, including photos and description. |
| `capture_lead` | Upserts a prospect by phone and stores budget, location, intent, and notes. |
| `schedule_viewing` | Creates a viewing request and can move the prospect to Viewing Booked. |
| `handoff_to_human` | Escalates the thread. |

**Guardrails:** no invented inventory, short WhatsApp replies, at most three matches, mirror Bengali or English, greetings do not dump the catalog, price negotiation and legal or document requests escalate.

**Escalation:** prefers an active broker in the prospect’s region, otherwise the active broker with the fewest prospects. Sets human takeover, turns the bot off, stores a summary, assigns the broker, and links the conversation on the prospect.

---

## 9. Inbox

Support agents work the same threads the bot uses.

- Conversation list and full message thread.
- Reply as the business number through the WhatsApp provider.
- Take over a thread (bot pauses) and release it (bot resumes).
- Suggested reply from the agent (`POST .../suggest`); the agent still sends it.
- Assignment of a staff user on the conversation.
- Escalation summary is visible on the thread.

---

## 10. Analytics

Date-ranged dashboard for “what worked this week?”.

- **Overview:** campaigns run, sent, delivered, read, failed, replied, new prospects, conversions.
- **Campaign table:** the same delivery counters per campaign.
- **Funnel:** prospect counts and conversion rates by stage.
- **Inventory:** listings by status, category, and broker.
- **Attribution:** prospects by lead source.
- **Broker leaderboard:** assigned leads and conversions.
- **Inbox metrics:** including bot vs human handling and escalation response timing.

---

## 11. Search, import, and settings

**Global search** (`/search` and `/dashboard/search`) matches listings, brokers, customers, and prospects once the query is at least two characters.

**CSV import** for listings, brokers, customers, prospects, and suppression. Each list page links to the matching upload screen. Templates are available from the API and as a download in the UI. Each row returns success or a row-level error.

**Admin settings:**

- Default currency
- Cold-lead days (stored; not auto-applied)
- Conversation retention days
- WhatsApp mode (MOCK or LIVE) and BSP display name
- Integration webhook URL (saved only; nothing posts to it yet)

**Privacy (admin):**

- Export everything stored for a phone: contacts, conversation, campaign recipients, consent events.
- Delete/anonymize that phone’s personal data.
- Run the conversation retention job, which drops messages older than the configured number of days.

---

## 12. Operations already in the repo

- Runbooks for BSP outage, template rejection, and Claude downtime (`docs/RUNBOOKS.md`).
- Deploy notes for Railway, Vercel, and live Claude/WhatsApp (`docs/ENV_RAILWAY_VERCEL.md`, `docs/VERCEL_BACKEND.md`, `docs/CLAUDE_AND_WHATSAPP_LIVE.md`).
- Scale notes and the unused integration slots (`docs/SCALE_AND_INTEGRATIONS.md`).
- Verification scripts: `scripts/verify-phase*.js`, `scripts/e2e-smoke.js`.
- Backup notes script: `scripts/backup-notes.js`.

---

## Not built yet

These appear in the phase plan and are not product behavior today:

- Two-factor auth, email staff invites, and an audit log
- Map view, listing version history, and duplicate-listing
- Kanban pipeline and automatic cold-lead transitions
- Drip sequences and quiet hours
- Photo file upload in the dashboard (URLs and an S3 helper exist)
- Owner, referral-partner, and event/open-house lists
- Public lead forms, outbound webhooks, and external CRM sync
- pgvector search, multi-tenant/branch, and feature flags
- Revenue tracking, scheduled email digests, and CSV/PDF report export
- Voice notes and a dedicated multi-language product mode (the bot already mirrors the user’s language)

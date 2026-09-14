# WhatsApp Broadcast & AI Property Assistant
## Phase-by-Phase Feature Build Plan

**Project:** CRM for listings, contacts, WhatsApp campaigns, and AI property assistant  
**Source of truth:** `Combined_Data_Model_and_Tech_Stack.md`  
**Stack:** Next.js + Node/TS · PostgreSQL · Redis/BullMQ · Claude API · WhatsApp BSP · S3/Cloudinary

---

## How to use this plan

- Each phase has **goals**, **features**, **deliverables**, and **exit criteria**.
- Build in order unless noted; later phases assume earlier ones are stable.
- Mark items **P0** (must ship), **P1** (important), **P2** (nice / conditional).
- Conditional lists (Owner, Developer, Referral, Events) stay gated until client confirms need.

---

# Phase 0 — Foundation & Project Scaffold
**Goal:** Runnable monorepo, env, DB, and CI so every later feature has a place to land.

| Priority | Feature | Notes |
|---|---|---|
| P0 | Monorepo / Next.js app bootstrap | App Router, TypeScript strict, ESLint/Prettier |
| P0 | PostgreSQL schema migrations | Prisma / Drizzle / Knex — pick one and stick to it |
| P0 | Env & secrets management | BSP keys, Claude key, DB, Redis, S3 |
| P0 | Redis connection | Required later for BullMQ |
| P0 | Object storage wiring | S3 or Cloudinary for listing/campaign media |
| P0 | Health check + basic logging | `/api/health`, structured logs |
| P1 | Docker Compose for local DB + Redis | Fast onboarding for the team |
| P1 | Seed script skeleton | Empty seed hooks for listings/contacts |
| P2 | CI pipeline | Lint, typecheck, migrate dry-run |

**Deliverables:** App boots locally; DB migrates; Redis reachable; blank deploy to Railway/Render.  
**Exit criteria:** `npm run dev` + migrations succeed on a clean machine.

---

# Phase 1 — Auth, Staff Users & Roles
**Goal:** Internal dashboard access control (not a WhatsApp list).

| Priority | Feature | Notes |
|---|---|---|
| P0 | Staff user model | `user_id`, name, email, role, permissions, active_status |
| P0 | Auth (login / logout / session) | NextAuth, Clerk, or custom JWT — team choice |
| P0 | Roles | Admin · Campaign Manager · Support Agent · Viewer |
| P0 | Permission checks on API routes | CRUD gated by role |
| P0 | Active / Inactive staff | Soft-disable without deleting |
| P1 | Invite staff by email | Admin-only |
| P1 | Audit log (who changed what) | Especially listings & campaigns |
| P2 | 2FA for Admin | Security hardening |

**Deliverables:** Protected `/dashboard`, role-aware nav, staff CRUD for Admins.  
**Exit criteria:** Viewer cannot edit; Admin can manage users.

---

# Phase 2 — Listings CRM (Source of Truth)
**Goal:** Full listings schema from Part 1 — drives bot Q&A and campaign merge fields later.

## 2.1 Schema & CRUD

| Priority | Feature | Notes |
|---|---|---|
| P0 | Listing core fields | id, title, category, transaction_type, location, price, currency, size, beds/baths, status, amenities |
| P0 | Supporting fields | photos, description, broker_assigned, last_updated, installment_plan, zoning, floor, year_built/completion |
| P0 | Enums | Transaction, category, availability status |
| P0 | Nullable rules | Beds/amenities optional for land; installment only for pre-launch |
| P0 | Listing CRUD API + UI | Create, edit, archive/soft-delete |
| P0 | Photo upload | Multi-image → object storage → URL array |
| P0 | Auto `last_updated` | On every write — bot freshness |

## 2.2 Listing operations

| Priority | Feature | Notes |
|---|---|---|
| P0 | Status workflow | Available → Reserved → Under Offer → Sold/Rented; Coming Soon |
| P0 | Filters & search | Location, price, beds, category, status, transaction type |
| P0 | Geo fields | Lat/long optional; text location required |
| P1 | Bulk import (CSV/Excel) | Onboarding existing portfolio |
| P1 | Bulk status update | e.g. mark many Coming Soon |
| P1 | Listing detail page | Photos gallery, amenities, broker chip |
| P1 | Duplicate listing | Faster inventory entry |
| P2 | Map view of listings | Lat/long present |
| P2 | Version history / changelog | Trust & dispute resolution |
| P2 | Multi-currency | Confirm with client (default BDT) |

**Deliverables:** Full listings module in dashboard; API ready for bot tools.  
**Exit criteria:** Can manage all categories/statuses from UI; Sold/Rented excluded from “active” queries.

---

# Phase 3 — Contact Lists (Core)
**Goal:** Separate lists by relationship type — Brokers, Customers, Prospects, Suppression.

## 3.1 Shared contact infrastructure

| Priority | Feature | Notes |
|---|---|---|
| P0 | Phone normalization | E.164; WhatsApp-ready |
| P0 | Cross-list custom tags | Location, budget-tier, engagement |
| P0 | Opt-in status on every contact | Compliance baseline |
| P0 | Contact search & filters | Phone, name, tags, list type |
| P0 | Soft merge / duplicate detection | Same phone across lists |
| P1 | CSV import per list | Manual onboarding |
| P1 | Contact activity timeline | Touches, campaigns, bot events |

## 3.2 Broker List

| Priority | Feature | Notes |
|---|---|---|
| P0 | Broker CRUD | All fields from §2A.1 |
| P0 | `listings_assigned` link | Many-to-many with listings |
| P0 | Active / Inactive | |
| P0 | Specialization + region | |
| P1 | Broker profile page | Assigned listings + customers + prospects |
| P2 | Broker performance metrics | Later with analytics |

## 3.3 Customer List

| Priority | Feature | Notes |
|---|---|---|
| P0 | Customer CRUD | §2A.2 fields |
| P0 | Link to listing owned/rented | |
| P0 | Transaction type + date | Bought / Rented / Invested |
| P0 | Assigned broker | |
| P0 | Referral count | Manual or auto later |
| P1 | Convert Prospect → Customer | One-click after close |
| P1 | Tags (high-value, repeat) | |

## 3.4 Prospect List

| Priority | Feature | Notes |
|---|---|---|
| P0 | Prospect CRUD | §2A.3 fields |
| P0 | Lead stage enum | New / Qualified / Viewing Booked / Cold |
| P0 | Intent + property interest + budget + location | Bot capture targets |
| P0 | Lead source | Campaign / bot / referral / partner / manual |
| P0 | `last_interaction_date` | Drives 24h WhatsApp window |
| P0 | Assigned broker (nullable) | Set on escalation |
| P0 | Conversation history ref | Placeholder until Phase 8 |
| P1 | Pipeline board (Kanban) | Drag stages |
| P1 | Auto-cold rule | Days-of-inactivity config (open item #9) |
| P2 | Scoring / priority | Budget fit × engagement |

## 3.5 Opt-out / Suppression List

| Priority | Feature | Notes |
|---|---|---|
| P0 | Suppression store by phone | Unique |
| P0 | Opted-out date + source list | |
| P0 | Hard gate on every campaign send | Must check before enqueue |
| P0 | Manual add / remove (Admin) | Compliance ops |
| P0 | Sync: contact `opt_in_status = false` → suppression | Bidirectional policy |
| P1 | Self-serve STOP keyword handling | Phase 6/7 dependency |

**Deliverables:** All four core lists usable in dashboard; suppression enforced in API.  
**Exit criteria:** Cannot enqueue a message to a suppressed phone.

---

# Phase 4 — Relationships, Assignments & Lifecycle
**Goal:** Wire Part 3 connection graph into product behavior.

| Priority | Feature | Notes |
|---|---|---|
| P0 | Assign broker to listing | |
| P0 | Assign broker to prospect / customer | |
| P0 | Prospect → Customer conversion flow | Copies links, sets transaction fields |
| P0 | Referral intake | Customer refers → new Prospect (`lead_source = referral`) |
| P0 | Opt-out cascade | Any list → suppression + remove from active targeting |
| P1 | Broker workload view | Open prospects + active listings |
| P1 | Reassign broker (bulk) | Coverage when broker leaves |
| P1 | Viewing booked workflow | Prospect stage + optional calendar note |
| P2 | Deal / offer object | Bridge Under Offer ↔ Customer conversion |
| P2 | Commission tracking stub | Fields only until finance scope |

**Deliverables:** Relationship graph enforced in DB + UI flows.  
**Exit criteria:** Conversion and assignment update all related records consistently.

---

# Phase 5 — Admin Dashboard (Operational Shell)
**Goal:** Day-to-day CRM UI beyond raw CRUD.

| Priority | Feature | Notes |
|---|---|---|
| P0 | Dashboard home | Counts: listings by status, prospects by stage, campaigns |
| P0 | Global search | Listings + contacts |
| P0 | Navigation by module | Listings, Contacts, Campaigns, Inbox, Settings |
| P0 | Empty states + validation UX | |
| P1 | Saved filters / segments | Reusable targeting later |
| P1 | Notifications center | New lead, escalation, campaign failures |
| P1 | Settings | Currency default, cold-lead days, BSP config UI |
| P2 | Tremor/Recharts widgets | Prep for Phase 10 |
| P2 | Dark/light or brand theme | Client branding |

**Deliverables:** Cohesive ops dashboard shell.  
**Exit criteria:** Staff can do daily CRM work without SQL.

---

# Phase 6 — WhatsApp BSP Integration (Plumbing)
**Goal:** Reliable send/receive before campaigns or bot logic.

| Priority | Feature | Notes |
|---|---|---|
| P0 | WhatsApp provider abstraction | MOCK + Meta Cloud API (`MetaWhatsApp`) |
| P0 | Webhook endpoint | Inbound messages + delivery receipts |
| P0 | Outbound send API | Text, template, media, interactive |
| P0 | Template sync / catalog | Meta-approved templates |
| P0 | 24-hour session window tracker | Tied to `last_interaction_date` |
| P0 | Delivery status model | Queued / Sent / Delivered / Read / Failed |
| P0 | Media inbound/outbound | Images for listings |
| P1 | Phone number quality / errors | Invalid, blocked, etc. |
| P1 | Webhook signature verification | Security |
| P1 | Sandbox vs production modes | |
| P2 | Multi-WABA / multi-number | If client has several lines |

**Deliverables:** Can send a template and receive a reply into DB.  
**Exit criteria:** End-to-end message + status webhook on staging number.

---

# Phase 7 — Campaign Engine (Module 1)
**Goal:** Segmented WhatsApp broadcasts with rate limits, compliance, and merge fields.

## 7.1 Campaign builder

| Priority | Feature | Notes |
|---|---|---|
| P0 | Create campaign | Name, audience list, template, schedule |
| P0 | Audience selectors | Brokers / Customers / Prospects (+ filters/tags) |
| P0 | Suppression check at enqueue | Hard fail path |
| P0 | Opt-in check | Skip non-opted-in |
| P0 | Merge fields | Name, listing title, price, location, broker, CTA URL |
| P0 | Preview audience count | Before send |
| P0 | Draft / Scheduled / Running / Completed / Cancelled | |

## 7.2 Sending infrastructure

| Priority | Feature | Notes |
|---|---|---|
| P0 | BullMQ job queue | Throttle to WhatsApp tier limits |
| P0 | Retries with backoff | Transient BSP errors |
| P0 | Per-recipient send log | Audit + analytics |
| P0 | Pause / cancel running campaign | |
| P0 | Schedule send (timezone-aware) | |
| P1 | A/B template variants | Simple split |
| P1 | Carousel / media campaigns | Listing photos |
| P1 | Campaign clone | |
| P2 | Drip sequences | Multi-step nurture |
| P2 | Quiet hours | Local business hours |

## 7.3 Campaign types (content playbooks)

| Priority | Audience | Feature |
|---|---|---|
| P0 | Brokers | New listing alert |
| P0 | Prospects | Matching listing / price-drop / open house |
| P0 | Customers | Retention / referral invite |
| P1 | Brokers | Policy / training / event invite |
| P1 | Prospects | Cold re-engagement (template-only outside window) |
| P2 | Conditional lists | Owner ops / developer performance (Phase 11) |

**Deliverables:** Full campaign create → queue → send → report loop.  
**Exit criteria:** 100+ recipient test respects rate limits and skips suppressed numbers.

---

# Phase 8 — AI Property Assistant (Module 2)
**Goal:** Claude + tool use against live listings; capture/qualify prospects; escalate to brokers.

## 8.1 Conversation core

| Priority | Feature | Notes |
|---|---|---|
| P0 | Inbound WhatsApp → conversation thread | Persist messages |
| P0 | Claude tool-use agent | Tools query live Postgres listings |
| P0 | Tools: search listings | Filters: location, budget, beds, type, status=Available/Coming Soon |
| P0 | Tools: get listing detail | Photos + description |
| P0 | Exclude Sold/Rented from answers | Per schema rules |
| P0 | System prompt / guardrails | No hallucinated inventory; admit unknowns |
| P0 | Update prospect fields from chat | Budget, location, intent, property type |
| P0 | Upsert prospect by phone | New lead auto-create |
| P0 | Touch `last_interaction_date` | Session window |

## 8.2 Handoff & ops

| Priority | Feature | Notes |
|---|---|---|
| P0 | Escalate to human / broker | Keyword or model decision |
| P0 | Assign broker on escalate | Round-robin or by region/specialization |
| P0 | Notify broker (WhatsApp or dashboard) | Include conversation summary |
| P0 | `conversation_history_ref` wired | Support Agent inbox |
| P0 | Human takeover mode | Bot pauses for thread |
| P1 | Dashboard Inbox UI | Reply as agent via BSP |
| P1 | Suggested replies for agents | Claude assist, agent sends |
| P1 | Viewing booking intent capture | Stage → Viewing Booked |
| P2 | Multi-language replies | BN/EN if client needs |
| P2 | Voice note transcription | Optional later |
| P2 | RAG over listing descriptions | pgvector when portfolio is large |

**Deliverables:** Prospect can ask “3BR in Banani under 1 Cr?” and get live matches; escalate works.  
**Exit criteria:** Answers change when listing price/status updates without redeploy/prompt paste.

---

# Phase 9 — Compliance, Privacy & Messaging Rules
**Goal:** Meta + local marketing compliance baked into product, not policy docs.

| Priority | Feature | Notes |
|---|---|---|
| P0 | STOP / UNSUBSCRIBE keyword → suppression | Immediate |
| P0 | START / opt-in restore flow | With confirmation |
| P0 | Template-only outside 24h window | Enforce in send path |
| P0 | Consent timestamps | When/how opt-in captured |
| P0 | Campaign preflight checklist | Audience, template approval, suppression |
| P1 | Data export / delete by phone | Privacy requests |
| P1 | PII access controls | Viewer role limits |
| P1 | Retention policy for conversation logs | Configurable |
| P2 | Consent proof export for audits | |

**Deliverables:** Compliance gates automated in send + inbound handlers.  
**Exit criteria:** STOP removes user from next campaign within seconds.

---

# Phase 10 — Analytics & Reporting
**Goal:** Visibility for campaigns, funnel, and inventory.

| Priority | Feature | Notes |
|---|---|---|
| P0 | Campaign report | Sent / delivered / read / failed / replies |
| P0 | Prospect funnel | Stage conversion rates |
| P0 | Listing inventory report | By status, category, broker |
| P1 | Lead source attribution | Campaign vs bot vs referral |
| P1 | Broker leaderboard | Assigned leads, conversions |
| P1 | Response-time metrics | Escalation → first human reply |
| P1 | Bot deflection rate | Resolved without human |
| P2 | Revenue / deal value tracking | Needs deal object |
| P2 | Export CSV/PDF reports | |
| P2 | Scheduled email digests to Admin | |

**Deliverables:** Analytics pages with real data from Phases 2–8.  
**Exit criteria:** Campaign Manager can answer “what worked this week?” from UI.

---

# Phase 11 — Conditional Contact Lists (Client-Gated)
**Goal:** Only build after open items #4–#6 confirmed.

## 11.1 Property Owner / Landlord *(if client manages for others)*

| Priority | Feature |
|---|---|
| P0 | Owner CRUD + `properties_owned` |
| P0 | Management agreement date |
| P1 | Payout details object (rent/commission) |
| P1 | Owner messages: new inquiry, viewing, rent collected |
| P2 | Owner portal (read-only) |

## 11.2 Developer / Partner *(if selling external projects)*

| Priority | Feature |
|---|---|
| P0 | Developer CRUD + projects/listings link |
| P1 | Sales performance updates campaign |
| P1 | Pre-launch unit bulk create from project |
| P2 | Project-level dashboard for developer contact |

## 11.3 Referral Partner *(if formal partners exist)*

| Priority | Feature |
|---|---|
| P0 | Partner CRUD + partner_type |
| P0 | Lead create with `lead_source = partner` |
| P1 | Incentive terms + leads_referred_count |
| P1 | Lead status updates to partner |
| P2 | Partner payout report |

## 11.4 Event / Open-House Attendees *(optional)*

| Priority | Feature |
|---|---|
| P1 | Event entity + attendance records |
| P1 | Link to prospect; `converted` flag |
| P1 | Post-event follow-up campaign segment |
| P2 | Conversion-by-event report |

**Deliverables:** Only the lists the client confirmed.  
**Exit criteria:** Distinct relationship types have distinct schemas and message playbooks.

---

# Phase 12 — Integrations, Sync & Scale
**Goal:** Connect external systems and harden for growth.

| Priority | Feature | Notes |
|---|---|---|
| P1 | External CRM/listings sync | Open item #2 — if source of truth exists elsewhere |
| P1 | Webhooks out | Lead created, listing sold → client systems |
| P1 | Public lead capture forms | Landing → Prospect + opt-in |
| P1 | Calendar link for viewings | Cal.com / Google |
| P2 | pgvector semantic listing search | “family-friendly near schools” |
| P2 | Multi-tenant / multi-branch | If Arcloops products for many brokerages |
| P2 | AWS move from Railway/Render | When scale/uptime requires |
| P2 | Read replicas / caching | Hot listing queries for bot |
| P2 | Feature flags | Gradual rollout |

**Deliverables:** Integration adapters + scale path documented.  
**Exit criteria:** Sync or form intake creates valid Prospects without manual entry.

---

# Phase 13 — Polish, QA & Production Hardening
**Goal:** Ship-ready product quality.

| Priority | Feature | Notes |
|---|---|---|
| P0 | E2E tests | Campaign send path, bot tool path, opt-out |
| P0 | Load test queue + webhooks | |
| P0 | Error monitoring | Sentry or equivalent |
| P0 | Backup & restore drill | Postgres |
| P0 | Runbooks | BSP outage, Meta template reject, Claude downtime |
| P1 | Staging WABA + production cutover checklist | |
| P1 | Staff training docs / in-app help | |
| P1 | Performance budgets | Dashboard + bot latency |
| P2 | Accessibility pass on dashboard | |

**Deliverables:** Production checklist signed off.  
**Exit criteria:** Staging UAT passed; rollback plan exists.

---

## Suggested build sequence (summary)

```
0 Foundation
  → 1 Auth/Staff
    → 2 Listings
      → 3 Core Contacts + Suppression
        → 4 Relationships
          → 5 Dashboard shell
            → 6 WhatsApp BSP
              → 7 Campaigns ─┬→ 9 Compliance (overlap early)
              → 8 AI Bot    ─┘
                → 10 Analytics
                  → 11 Conditional lists (if confirmed)
                    → 12 Integrations / scale
                      → 13 Hardening & launch
```

Phases **7** and **8** can run in parallel after Phase 6.  
Phase **9** compliance pieces should start as soon as Phase 6 sends exist (don’t wait until the end).

---

## MVP cut (first production slice)

If you need a thin first release, ship only:

1. Phase 0–1 (scaffold + auth)  
2. Phase 2 listings (core fields + status)  
3. Phase 3 Prospects + Brokers + Suppression (minimal Customer)  
4. Phase 6 WhatsApp send/receive  
5. Phase 8 bot Q&A + lead capture + escalate  
6. Phase 7 one campaign type: “new matching listing → Prospects”  
7. Phase 9 STOP + 24h window enforcement  

Defer: Owner/Developer/Referral, advanced analytics, drips, pgvector, multi-currency, map view.

---

## Open client decisions that change scope

| # | Decision | Affects |
|---|---|---|
| 1 | Which listing categories apply | Phase 2 optional fields |
| 2 | Existing CRM sync vs greenfield | Phase 12 |
| 3 | Currency (BDT only?) | Phase 2 |
| 4 | External owners? | Phase 11.1 |
| 5 | External developers? | Phase 11.2 |
| 6 | Formal referral partners? | Phase 11.3 |
| 7 | Broker two-way WhatsApp in Phase 1? | Phase 6–8 scope for brokers |
| 8 | Manual onboarding vs import | Phase 3 import priority |
| 9 | Cold prospect definition (days) | Phase 3 auto-cold |
| — | BSP choice | Phase 6 connector |

---

## Feature inventory count (approximate)

| Area | Features (P0+P1+P2) |
|---|---|
| Foundation & Auth | ~15 |
| Listings | ~20 |
| Contacts & relationships | ~35 |
| Dashboard | ~10 |
| WhatsApp + Campaigns | ~30 |
| AI Assistant | ~20 |
| Compliance | ~10 |
| Analytics | ~10 |
| Conditional lists | ~20 |
| Integrations & hardening | ~20 |
| **Total tracked** | **~190 feature items** |

Use P0 rows as the committed backlog; treat P2 as backlog icebox unless a client request promotes them.

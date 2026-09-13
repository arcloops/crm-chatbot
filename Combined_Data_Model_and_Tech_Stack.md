# WhatsApp Broadcast & AI Property Assistant
## Combined Data Model & Tech Stack Reference

**Project:** WhatsApp Broadcast & AI Property Assistant
**Prepared for:** Arcloops AI / Tech Team

---

## Table of Contents

1. Listings — Types & Schema
2. Contact Lists — Types & Schema
3. How Listings and Contacts Connect
4. Recommended Tech Stack
5. Combined Open Items to Confirm with Client

---

# Part 1: Listings — Types & Schema

A flexible real estate business (brokerage, developer, or portfolio manager) typically needs to cover all of the categories below. Build the schema to support all of them from day one, even if the client's current portfolio only uses a subset — this avoids a schema rework later.

## 1.1 By Transaction Type

| Type | Description |
|---|---|
| **For Sale** | Outright purchase, full ownership transfer |
| **For Rent** | Monthly or yearly rental agreements |
| **Investment** | Marketed on ROI/yield rather than personal use — may overlap with Sale or Rent |
| **Lease (Commercial)** | Long-term commercial lease agreements, distinct from residential rent |

## 1.2 By Property Category

| Category | Sub-types | Notes |
|---|---|---|
| **Residential — Apartment/Flat** | Studio, 1BR, 2BR, 3BR+, Duplex, Penthouse | Most common listing type in urban markets |
| **Residential — House** | Standalone house, Townhouse, Villa | Land + structure combined |
| **Land / Plot** | Residential plot, Agricultural land, Commercial plot | No amenities/bedrooms fields apply — schema must treat these as optional |
| **Commercial** | Office space, Retail/Shop, Showroom, Warehouse | Different specs matter: floor space, foot traffic, zoning |
| **Under Construction / Pre-launch** | Developer project units not yet completed | Pricing/availability logic differs — installment plans, booking % vs full price |
| **Mixed-use** | Combined residential + commercial building units | Common in dense urban developments |

## 1.3 By Listing Status

| Status | Meaning |
|---|---|
| **Available** | Open for inquiry/viewing |
| **Reserved / Booking in Progress** | Interested party has started the process, not yet finalized |
| **Under Offer** | Offer accepted, pending completion |
| **Sold / Rented** | Transaction complete, remove from active bot answers |
| **Coming Soon** | Not yet released to market, useful for early-access campaigns |

## 1.4 Listing Schema — Core Fields (Required — drives bot's Phase 1 query answering)

| Field | Type | Example |
|---|---|---|
| `listing_id` | String (unique) | `LST-00231` |
| `title` | String | "3BR Apartment in Banani" |
| `property_category` | Enum | Apartment / House / Land / Commercial / Pre-launch |
| `transaction_type` | Enum | Sale / Rent / Investment / Lease |
| `location` | String / Geo | "Banani, Dhaka" + optional lat/long |
| `price` | Number | 8,500,000 |
| `currency` | String | BDT |
| `size` | Number + unit | 1450 sq.ft |
| `bedrooms` | Number (nullable for land/commercial) | 3 |
| `bathrooms` | Number (nullable) | 3 |
| `availability_status` | Enum | Available / Reserved / Under Offer / Sold / Coming Soon |
| `amenities` | Array (nullable for land) | ["Lift", "Parking", "Generator", "Security"] |

## 1.5 Listing Schema — Supporting Fields (needed for campaigns, dashboard, and trust)

| Field | Type | Purpose |
|---|---|---|
| `photos` | Array of image URLs | Used in campaign carousels and bot replies |
| `description` | Text | Free-text detail for richer bot answers |
| `broker_assigned` | Reference to Broker ID | Owns follow-up/viewing for this listing |
| `last_updated` | Timestamp | Confirms data freshness — critical since bot must reflect "live" data |
| `installment_plan` | Object (nullable) | Only for pre-launch: booking %, installment schedule |
| `zoning` | String (nullable) | Only for land/commercial |
| `floor_number` | Number (nullable) | Only for apartments/commercial in multi-floor buildings |
| `year_built / completion_date` | Date | Especially relevant for pre-launch/under construction |

---

# Part 2: Contact Lists — Types & Schema

The system needs several contact lists, each functionally different — not just tags on one flat table. They differ in **what they're used for**, **what data they carry**, and **what kind of messages they should receive**.

| List | Status | Relationship | Primary Use |
|---|---|---|---|
| **Broker List** | Core — confirmed in brief | Internal partner/agent | Operational updates, new listing alerts |
| **Customer List** | Core — confirmed in brief | Existing transacted customer | Retention, referral, upsell campaigns |
| **Prospect List** | Core — confirmed in brief | Potential customer, not yet transacted | Lead nurturing, AI bot conversations |
| **Opt-out / Suppression List** | Core — compliance requirement | N/A (not a targeting list) | Blocks future marketing sends |
| **Property Owner / Landlord List** | Conditional — confirm with client | Owns property managed by the client | Owner-facing updates, not sales |
| **Developer / Partner List** | Conditional — confirm with client | External developer whose units are sold via client | Project status, sales performance updates |
| **Referral Partner List** | Conditional — confirm with client | Formal external partners sending leads | Partner incentives, lead tracking |
| **Internal Staff / System Users** | Required, but not a WhatsApp list | Client's own team | Dashboard access, roles/permissions |
| **Event/Open-House Attendees** | Optional sub-segment | Subset of Prospects | Event follow-up, conversion tracking |

## 2A. Core Lists (Confirmed by Solution Brief)

### 2A.1 Broker List

Brokers are internal stakeholders, not customers. Messaging content and cadence should differ from client/prospect campaigns (operational notices, not sales pitches).

| Field | Type | Notes |
|---|---|---|
| `broker_id` | String (unique) | |
| `name` | String | |
| `phone` | String | WhatsApp-verified number |
| `email` | String (optional) | |
| `region_area` | String | Where they operate |
| `specialization` | Enum (optional) | Residential / Commercial / Land |
| `active_status` | Enum | Active / Inactive |
| `listings_assigned` | Array (ref. Listing IDs) | Properties they currently handle |
| `join_date` | Date | |
| `opt_in_status` | Boolean | Still required even for internal contacts |

**Typical campaigns:** new listing added, commission/policy updates, training/event invites.

### 2A.2 Customer List

People who have already bought, rented, or invested through the client.

| Field | Type | Notes |
|---|---|---|
| `customer_id` | String (unique) | |
| `name` | String | |
| `phone` | String | |
| `email` | String (optional) | |
| `property_owned_or_rented` | Reference to Listing ID | Links to Listings schema (Part 1) |
| `transaction_type` | Enum | Bought / Rented / Invested |
| `transaction_date` | Date | |
| `assigned_broker` | Reference to Broker ID | Who closed/manages this relationship |
| `referral_count` | Number | Tracks referral potential/history |
| `opt_in_status` | Boolean | |
| `tags` | Array (custom) | e.g. "high-value," "repeat customer" |

**Typical campaigns:** retention offers, similar-property alerts, referral incentives.

### 2A.3 Prospect List

People who haven't transacted yet but have shown interest. Most tightly coupled to the AI bot.

| Field | Type | Notes |
|---|---|---|
| `prospect_id` | String (unique) | |
| `name` | String | Captured by bot or campaign form |
| `phone` | String | |
| `budget_range` | String/Number range | Captured during bot conversation |
| `preferred_location` | String | |
| `property_type_interest` | Enum | Apartment / House / Land / Commercial / Pre-launch |
| `intent` | Enum | Buy / Rent / Invest |
| `lead_source` | String | Which campaign/channel brought them in |
| `lead_stage` | Enum | New / Qualified / Viewing Booked / Cold |
| `last_interaction_date` | Timestamp | Drives the 24-hour WhatsApp messaging window logic |
| `assigned_broker` | Reference to Broker ID (nullable) | Set once bot escalates to a human |
| `opt_in_status` | Boolean | |
| `conversation_history_ref` | Reference to conversation log | For human handoff context |

**Typical campaigns:** new listing alerts matching interest, price-drop notices, open house invites, cold-lead re-engagement.

### 2A.4 Opt-out / Suppression List

Not a targeting segment — a compliance gate. Every campaign send must check against this list first.

| Field | Type | Notes |
|---|---|---|
| `phone` | String (unique) | |
| `opted_out_date` | Timestamp | |
| `source` | String | Which list they were removed from |

## 2B. Additional Lists (Confirm Need With Client)

These aren't in the original Solution Brief, but may be relevant depending on the client's business model. Each represents a **distinct relationship type**, not just a variation of an existing one — that's the test for whether something deserves its own list.

### 2B.1 Property Owner / Landlord List *(conditional)*

Relevant if the client manages properties **on behalf of** external owners, rather than owning the portfolio outright.

| Field | Type | Notes |
|---|---|---|
| `owner_id` | String (unique) | |
| `name` | String | |
| `phone` | String | |
| `properties_owned` | Array (ref. Listing IDs) | Properties they own that client manages |
| `management_agreement_date` | Date | |
| `payout_details` | Reference/object | Rent collection, commission split, etc. |
| `opt_in_status` | Boolean | |

**Typical messages:** new inquiry on their property, viewing scheduled, rent collected — operational, not sales.

### 2B.2 Developer / Partner List *(conditional)*

Relevant if the client sells units for external developers (common with pre-launch/under-construction listings).

| Field | Type | Notes |
|---|---|---|
| `developer_id` | String (unique) | |
| `company_name` | String | |
| `contact_person` | String | |
| `phone` | String | |
| `projects_assigned` | Array (ref. Listing IDs / Project IDs) | Units/projects they've listed via client |
| `opt_in_status` | Boolean | |

**Typical messages:** units sold update, campaign performance for their project.

### 2B.3 Referral Partner List *(conditional)*

Distinct from customers who refer casually — formal external partners (other agencies, freelance agents, finance/legal partners) who consistently send leads.

| Field | Type | Notes |
|---|---|---|
| `partner_id` | String (unique) | |
| `name` | String | |
| `phone` | String | |
| `partner_type` | Enum | Agency / Freelance Agent / Finance / Legal / Other |
| `leads_referred_count` | Number | |
| `incentive_terms` | Reference/object | Commission or referral fee structure |
| `opt_in_status` | Boolean | |

**Typical messages:** referral incentive updates, lead status tracking.

### 2B.4 Internal Staff / System Users *(required, but not a messaging list)*

Not a WhatsApp contact list — this is access control for the admin dashboard itself.

| Field | Type | Notes |
|---|---|---|
| `user_id` | String (unique) | |
| `name` | String | |
| `email` | String | Dashboard login |
| `role` | Enum | Admin / Campaign Manager / Support Agent / Viewer |
| `permissions` | Array | What they can access/edit |
| `active_status` | Enum | Active / Inactive |

### 2B.5 Event / Open-House Attendees *(optional sub-segment)*

Usually a tag within Prospects rather than a fully separate list — track separately only if the client runs frequent in-person events and wants conversion tracking by event.

| Field | Type | Notes |
|---|---|---|
| `event_id` | String | Which event they attended |
| `prospect_ref` | Reference to Prospect ID | Links back to core Prospect List |
| `attendance_date` | Date | |
| `converted` | Boolean | Did they proceed toward a transaction after |

## 2C. Custom Tags (apply across all contact lists)

Beyond the structured fields above, each contact can carry free-form tags for finer segmentation:
- Location-based tags (neighborhood-level, not just city)
- Budget-tier tags (e.g. "premium," "mid-range")
- Engagement tags (e.g. "responsive," "unresponsive," "VIP")

---

# Part 3: How Listings and Contacts Connect

```
Prospect ──(transacts)──▶ becomes Customer
Prospect ──(bot escalates)──▶ assigned_broker links to Broker List
Customer ──(refers someone)──▶ new entry in Prospect List (lead_source = "referral")
Referral Partner ──(sends lead)──▶ new entry in Prospect List (lead_source = "partner")
Property Owner ──(lists property)──▶ new entry in Listings, managed by assigned Broker
Developer ──(lists project)──▶ new entries in Listings (pre-launch units)
Broker ──(assigned to)──▶ Listings + Customers + Prospects (via assigned_broker / listings_assigned)
Any list ──(opts out)──▶ moves to Suppression List, removed from active targeting
```

**The listings database is the shared backbone:** Module 1 (Campaign Engine) uses it for merge fields (property, price) in broadcasts; Module 2 (AI Assistant) uses it for real-time Q&A with prospects. The contacts database feeds targeting for campaigns and gives the bot somewhere to route captured leads and escalations.

## Lists NOT Recommended for This Project

- **Media/Press list** — not relevant unless client runs PR outreach via WhatsApp
- **Generic newsletter list** — would fragment targeting; the segmented lists above already cover this need

---

# Part 4: Recommended Tech Stack

| Layer | Recommendation | Why |
|---|---|---|
| **Backend** | Node.js + TypeScript (Express or Fastify) | Best-documented SDKs for WhatsApp BSPs (360dialog, Gupshup, Twilio) and the Anthropic API both have mature TypeScript support, reducing integration friction |
| **Database** | PostgreSQL (+ pgvector extension if semantic search is needed later) | Structured relational data (listings, contacts, campaigns) fits naturally; JSON columns handle flexible fields like amenities/tags without a second database; pgvector adds AI-powered matching later without new infrastructure |
| **AI / Conversational Layer** | Claude API, using tool use / function calling | Lets Claude query the live listings database directly instead of having data pasted into every prompt — keeps answers accurate as the portfolio changes, matching the brief's "not fine-tuned on static data" requirement |
| **Campaign Queue** | Redis + BullMQ (Node) or Celery + Redis (Python alt.) | Campaign sending must respect WhatsApp rate limits and messaging tiers; a proper job queue handles retries, throttling, and scheduling reliably instead of custom-built logic |
| **WhatsApp Access** | BSP of choice — 360dialog, Gupshup, Twilio, Bird, Interakt, or WATI | Required by Meta — cannot access the Cloud API directly without an approved BSP |
| **Admin Dashboard (Frontend)** | React + Next.js | Most BSP dashboard examples and UI component libraries assume React; Next.js allows frontend + lightweight backend routes in one framework; libraries like Tremor/Recharts speed up analytics views |
| **Hosting / Infrastructure** | Railway or Render (simple projects) / AWS (if scaling is expected) | Keeps operations simple early on; webhook endpoints (from Meta/BSP) need reliable uptime without cold-start delays |
| **File/Image Storage** | Cloud object storage (e.g. AWS S3 or Cloudinary) | Listing photos and campaign carousel images need reliable, fast-loading external hosting rather than storing binary files in the database |

### Why this stack overall

This is a deliberately standard, well-supported combination — nothing exotic. The hard parts of this project are the **compliance, BSP selection, and data-modeling decisions**, not unusual technical requirements. A boring, well-documented stack reduces integration risk with WhatsApp's API and Meta's approval processes, which are already the project's biggest sources of delay.

---

# Part 5: Combined Open Items to Confirm with Client

**Listings:**
1. Which listing categories actually apply to the client's portfolio (pure resale vs. also pre-launch/commercial/land) — determines which optional schema fields are needed.
2. Does an existing CRM/listings system exist to sync from, or is this schema being built from scratch as the source of truth (Section 8, Solution Brief)?
3. Currency and localization needs (likely BDT, confirm if any listings are in other currencies).

**Contacts:**
4. Does the client manage properties on behalf of external owners, or own the portfolio outright? *(determines if Owner List is needed)*
5. Does the client sell units for external developers, or only their own inventory? *(determines if Developer List is needed)*
6. Are there formal referral partners (agencies, freelancers) distinct from casual customer referrals?
7. Do brokers need two-way WhatsApp interaction, or are they a one-way broadcast list in Phase 1?
8. Is customer/owner/developer data available anywhere currently, or does it need manual onboarding into this system?
9. How should "cold" prospects be defined — after how many days of no interaction should lead_stage auto-update?

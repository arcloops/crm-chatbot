# Claude + Live WhatsApp Integration Guide

This guide lists **everything you need from outside the repo**, then walks through **how to integrate Claude and Live WhatsApp** into **arXcrm** (this monorepo).

**Stack context**

- Backend: Fastify + Postgres + Redis (Railway)
- Frontend: Next.js (Vercel)
- AI: Anthropic Messages API (tool use) via `ClaudeAgent`
- WhatsApp: `WhatsAppProvider` — **MOCK** for local/dev; **LIVE** = Meta Cloud API (`MetaWhatsApp`)

Related docs: [ENV_RAILWAY_VERCEL.md](./ENV_RAILWAY_VERCEL.md), [RUNBOOKS.md](./RUNBOOKS.md).

---

## Part 1 — Everything you need (checklist)



### 1.1 Always required (hosting)


| Item                                  | Where                 | Purpose                        |
| ------------------------------------- | --------------------- | ------------------------------ |
| Railway (or similar) public HTTPS API | Hosting               | Backend + webhooks             |
| Postgres                              | `DATABASE_URL`        | CRM + conversations + listings |
| Redis                                 | `REDIS_URL`           | Campaign queues                |
| Vercel frontend                       | `NEXT_PUBLIC_API_URL` | Dashboard                      |
| `JWT_SECRET` (≥16 chars)              | Backend env           | Auth                           |
| `CORS_ORIGIN` includes Vercel URL     | Backend env           | Browser login/API              |




### 1.2 Claude (Anthropic)


| Item                                | Type        | Required?                                |
| ----------------------------------- | ----------- | ---------------------------------------- |
| Anthropic account                   | Outside     | Yes for real AI                          |
| `ANTHROPIC_API_KEY`                 | Backend env | Yes for Claude                           |
| Billing / rate limits               | Outside     | Recommended                              |
| Listing inventory in DB             | Data        | Yes (Claude searches live listings)      |
| Model fine-tuning / reply templates | —           | **Not needed** for free-form bot replies |


Without the key, the app uses `MockAgent` (same tools, heuristic replies).

### 1.3 WhatsApp MOCK (no Meta)


| Item                                 | Required?                  |
| ------------------------------------ | -------------------------- |
| App Settings → `whatsappMode = MOCK` | Yes for demos without Meta |
| Seeded/staff login                   | Yes                        |
| Listings data                        | Recommended                |




### 1.4 WhatsApp LIVE (real phones)



#### From Meta Business


| Item                              | Notes                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| Meta Business Manager             | business.facebook.com                                              |
| WhatsApp Business Account (WABA)  | Under the Business                                                 |
| WhatsApp business phone number    | Added + verified                                                   |
| **System User** + permanent token | Do **not** use 24h temporary tokens                                |
| Permissions                       | `whatsapp_business_messaging`, `whatsapp_business_management`      |
| **Phone Number ID**               | From WhatsApp → API Setup                                          |
| **Webhook verify token**          | Any secret string **you** invent                                   |
| Public webhook URL                | `https://<YOUR-API>/webhooks/whatsapp`                             |
| Webhook subscription              | Field: `messages`                                                  |
| Approved **message templates**    | Required for campaigns and outbound outside the 24h session window |




#### Env vars (backend)


| Variable                        | Purpose                                                                     |
| ------------------------------- | --------------------------------------------------------------------------- |
| `WHATSAPP_PHONE_NUMBER_ID`      | Graph API path for send                                                     |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Must match Meta webhook verify token                                        |
| `WHATSAPP_API_KEY`              | Store Meta **system user token** here (see adapter mapping below)           |
| `WHATSAPP_API_SECRET`           | Optional; can mirror token or leave unused if adapter only needs one secret |
| `WHATSAPP_BSP`                  | Optional label, e.g. `meta`                                                 |




#### Implemented in this repo


| Item | Path |
| --- | --- |
| Meta Cloud API provider | `backend/src/whatsapp/meta.ts` |
| LIVE factory wiring | `backend/src/whatsapp/index.ts` → `MetaWhatsApp` when credentials present |
| Graph send + webhook parse | `sendText` / `sendTemplate` / `sendMedia` / `verifyWebhook` / `parseWebhook` |

This project does **not** use Twilio.


---



## Part 2 — How the product already works (no extra “training”)



### Claude path (when key is set)

1. Prospect message (WhatsApp) or staff message (Chat) hits the API.
2. Backend loads conversation history and calls `getAgent()` → `ClaudeAgent` if `ANTHROPIC_API_KEY` is set.
3. Claude uses tools against **live Postgres** (`search_listings`, `get_listing_detail`, `capture_lead`, `handoff_to_human`, `schedule_viewing`).
4. Claude writes a short reply from tool results only (no RAG / no fine-tuning).
5. Reply is stored and sent via WhatsApp provider (MOCK or LIVE).

**You do not** create Anthropic “reply templates” or train a custom model for normal bot chats.

### WhatsApp templates (Meta) vs Claude replies


| Kind                | Who writes it               | When used                              |
| ------------------- | --------------------------- | -------------------------------------- |
| Free-form bot reply | Claude (automatic)          | Inside 24h customer-care window        |
| Meta template       | You create in Meta Business | Campaigns, marketing, reopen after 24h |


---



## Part 3 — Procedure: integrate Claude



### Step 1 — Create the API key

1. Open [Anthropic Console](https://console.anthropic.com/).
2. Create an organization / project if needed.
3. Create an API key. Copy it once; store it in a password manager.



### Step 2 — Set env on the backend

**Local** — root `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Railway** — Backend service → Variables → add the same key → redeploy.

Do **not** put this key on Vercel frontend.

### Step 3 — Restart and verify

1. Restart local API or wait for Railway redeploy.
2. Sign in to the dashboard.
3. Open **Chat** (`/dashboard/bot`).
4. Confirm status shows **Anthropic / Claude** (not Mock).
5. Ask: e.g. “2 bed in Gulshan under 90 lakh”.
6. Expect a short answer citing real listing codes from your DB.



### Step 4 — Optional quality checks

- Empty search → bot asks to widen criteria (not invent listings).
- “Talk to a broker” / contract / legal → handoff → Inbox escalated.
- Listing code `LST-xxxxx` → detail tool path.
- Prospects page shows captured budget / location / intent when tools ran.



### Step 5 — Production notes

- Monitor Anthropic usage / spend caps.
- On API failure, backend falls back to `MockAgent` (see runbooks).
- Keep listing data fresh; Claude only answers from live inventory tools.

---



## Part 4 — Procedure: integrate Live WhatsApp (Meta Cloud API)

Do this **after** Claude works in Chat (recommended), so you can separate AI issues from channel issues.

### Step 1 — Meta Business setup

1. Meta Business Manager → create/select Business.
2. WhatsApp → add a phone number (or use client number).
3. **Business Settings → Users → System Users** → create a System User.
4. Assign the System User to the WhatsApp Business Account with messaging + management permissions.
5. Generate a token with **no expiry** (permanent). Save as your API token.
6. From WhatsApp → API Setup, copy **Phone number ID**.



### Step 2 — Choose webhook verify token

Invent any secret string, e.g. `arxcrm_wa_verify_2026`.  
You will use the **same** value in Meta and in `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

### Step 3 — Confirm Meta provider is wired (already in repo)

LIVE WhatsApp uses **`MetaWhatsApp`** only (no Twilio):

- Implementation: `backend/src/whatsapp/meta.ts`
- Factory: `getWhatsAppProvider()` returns Meta when `whatsappMode=LIVE` and `WHATSAPP_API_KEY` + `WHATSAPP_PHONE_NUMBER_ID` are set; otherwise falls back to MOCK with a warning.

Env mapping:

- `WHATSAPP_API_KEY` = Meta system user token  
- `WHATSAPP_PHONE_NUMBER_ID` = Phone number ID  
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` = your verify string  
- `WHATSAPP_API_SECRET` = unused for Meta Graph (optional)  
- `WHATSAPP_BSP=meta` = label only  

Provider interface: `backend/src/whatsapp/types.ts`.

Routes already in place:

- `GET/POST /webhooks/whatsapp` — verify + inbound  
- `handleInboundMessage` — Claude/Mock agent + history  
- Campaign worker — `sendTemplate` via provider  



### Step 4 — Set Railway env

```env
WHATSAPP_BSP=meta
WHATSAPP_API_KEY=EAAG...your-system-user-token...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_WEBHOOK_VERIFY_TOKEN=arxcrm_wa_verify_2026
ANTHROPIC_API_KEY=sk-ant-...   # keep for AI replies
```

Redeploy the API. Confirm `GET /health` is OK.

### Step 5 — Register the Meta webhook

1. Meta App → WhatsApp → Configuration → Webhook.
2. Callback URL:
  ```text
   https://YOUR-RAILWAY-API.up.railway.app/webhooks/whatsapp
  ```
3. Verify token = exact `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. Verify — Meta sends `GET` with challenge; your API must echo it (200).
5. Subscribe to `messages`.



### Step 6 — Create Meta message templates

In Meta Business → WhatsApp → Message templates:

1. Create at least one **utility/marketing** template you will use for campaigns (e.g. greeting / listing alert).
2. Wait until status is **APPROVED**.
3. Ensure the same template name exists in your CRM template catalog (seed/settings/campaigns UI) and is marked APPROVED if your preflight checks status.

Free-form Claude replies do **not** use these templates inside the 24h window.

### Step 7 — Flip the app to LIVE

1. Dashboard → **Settings** → WhatsApp mode → **LIVE** → save.
2. Send a WhatsApp message from a personal phone **to** the business number.
3. Confirm:
  - Message appears in **Inbox**
  - Bot replies (Claude if key set)
  - Prospect updated if tools captured fields
4. Send a **campaign** with an approved template to an internal opt-in number; confirm delivery status updates.
5. Reply **STOP** → suppression list blocks further marketing.



### Step 8 — Staging cutover checklist

1. Staging WABA / sandbox number first (not production client number).
2. Env + LIVE adapter + webhook verify on staging.
3. One inbound + one template send + STOP test signed off.
4. Promote same image + env pattern to production WABA.
5. Pause campaigns before any risky deploy; see [RUNBOOKS.md](./RUNBOOKS.md).

---



## Part 5 — Recommended order of work

```text
1. Hosting healthy (Railway API + Vercel + DB + Redis + CORS)
2. MOCK WhatsApp + inventory data (CRM usable)
3. ANTHROPIC_API_KEY → verify Chat
4. Meta env vars + webhook + templates (provider already in repo)
5. Settings LIVE → real phone E2E
```

---



## Part 6 — Troubleshooting


| Symptom                              | Likely cause                                                    |
| ------------------------------------ | --------------------------------------------------------------- |
| Chat always “Mock”                   | Missing/empty `ANTHROPIC_API_KEY` or API not restarted          |
| Claude errors → mock replies         | Anthropic downtime / bad key / billing                          |
| Webhook verify fails                 | Verify token mismatch or API not publicly reachable             |
| LIVE send fails / falls back to MOCK | Missing `WHATSAPP_API_KEY` or `WHATSAPP_PHONE_NUMBER_ID`, or Meta Graph error |
| Bot silent but message in Inbox      | `humanTakeover` / bot disabled, or outside 24h without template |
| Campaign won’t start                 | Template not APPROVED or Redis/worker down                      |
| Login works locally, fails on Vercel | `NEXT_PUBLIC_API_URL` still localhost — see ENV guide           |


---



## Part 7 — What “done” looks like

- [ ] `ANTHROPIC_API_KEY` set; Chat shows Claude  
- [ ] Meta provider implemented and selected when LIVE  
- [ ] Webhook verifies and receives messages  
- [ ] Inbound → Claude tools → outbound WhatsApp text  
- [ ] Inbox shows escalations / viewing / qualification  
- [ ] Campaign template send + status webhooks  
- [ ] STOP → suppression enforced  

---



## Code map (quick reference)


| Concern              | Path                                                       |
| -------------------- | ---------------------------------------------------------- |
| Agent factory        | `backend/src/agent/index.ts`                               |
| Claude tool loop     | `backend/src/agent/claude.ts`                              |
| Tools / executors    | `backend/src/agent/toolDefinitions.ts`, `toolExecutors.ts` |
| WhatsApp factory     | `backend/src/whatsapp/index.ts`                            |
| Meta Cloud API       | `backend/src/whatsapp/meta.ts`                             |
| MOCK provider        | `backend/src/whatsapp/mock.ts`                             |
| Inbound bot pipeline | `backend/src/whatsapp/inbound.ts`                          |
| Webhooks             | `backend/src/routes/whatsapp.ts`                           |
| Staff Chat UI        | `frontend/src/app/dashboard/bot/page.tsx`                  |
| WhatsApp mode UI     | `frontend/src/app/dashboard/settings/page.tsx`             |



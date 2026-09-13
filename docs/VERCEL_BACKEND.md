# Deploy backend on Vercel (CRUD/auth; campaigns disabled)

This Fastify API can run as a **Vercel Function** (Fluid compute).  
**Campaign send/queue (BullMQ) is disabled** on Vercel. Use Railway/Fly for a worker if you need broadcasts.

## What works on Vercel

- Auth / staff / listings / contacts / developers  
- Inbox reply (Mock WhatsApp), analytics GETs, privacy, settings  
- Health + cron stub `GET /cron/campaigns/tick`

## What does not

- `POST /campaigns/:id/start` → **503** `CAMPAIGNS_DISABLED_ON_VERCEL`  
- In-process BullMQ worker / scheduled campaign poller  

## Prerequisites

1. Hosted **Postgres** (Neon, Vercel Postgres, Railway, etc.)  
2. Run migrations from your machine/CI (not on every invoke):

```bash
DATABASE_URL="postgres://..." npm run db:migrate:deploy -w backend
DATABASE_URL="postgres://..." npm run db:seed -w backend
```

3. Prefer a **pooled** `DATABASE_URL` for serverless (Neon pooler / PgBouncer).

## Deploy steps

1. Push this repo to GitHub.  
2. Vercel → **Add New Project** → import the repo.  
3. Settings:
   - **Root Directory:** `backend`
   - Framework: leave auto / Other (Fastify detected via `src/app.ts`)
4. Environment variables:

| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Pooled Postgres URL |
| `JWT_SECRET` | yes | ≥16 chars |
| `CORS_ORIGIN` | yes | Frontend origin(s), comma-separated |
| `JWT_EXPIRES_IN` | no | default `7d` |
| `REDIS_URL` | no | Unused on Vercel; omit OK |
| `CRON_SECRET` | recommended | Bearer token for `/cron/campaigns/tick` |
| `ANTHROPIC_API_KEY` | no | Bot uses MockAgent if unset |
| `SENTRY_DSN` | no | |

5. Deploy. Open `https://YOUR-PROJECT.vercel.app/health` — expect `phase: "10-13"`, `runtime: "vercel"`, redis `skipped` if no Redis.  
6. `GET /` should show `campaigns.mode: "disabled_on_vercel"`.  
7. Point the frontend `NEXT_PUBLIC_API_URL` at this URL.

## Cron stub

[`vercel.json`](../backend/vercel.json) schedules hourly `GET /cron/campaigns/tick`.  
It returns `{ skipped: true }` until you add a real batch sender or an external worker.

Protect with:

```http
Authorization: Bearer <CRON_SECRET>
```

## Local still uses BullMQ

```bash
npm run dev -w backend   # src/app.ts listens + starts worker when not on Vercel
```

## Hybrid (recommended for campaigns)

| Service | Host |
|---|---|
| API (CRUD) | Vercel (this guide) |
| Campaign worker | Railway `npm run worker -w backend` + Redis |
| Frontend | Separate Vercel project, Root = `frontend` |

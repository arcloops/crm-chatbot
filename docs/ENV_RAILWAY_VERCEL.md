# Deploy env vars — Railway (API) vs Vercel (frontend)

Login fails most often because the **Vercel frontend still calls `localhost:4000`**.  
`NEXT_PUBLIC_API_URL` must be your **Railway public API URL**, then **redeploy** the frontend.

---

## A) Railway — Backend service

Set these on the **API / backend** service (not on Postgres/Redis themselves — reference those).

```env
NODE_ENV=production
LOG_LEVEL=info

# Railway injects PORT — you usually do NOT set PORT yourself

# Link from Railway Postgres / Redis (use Variable References in UI):
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
# If Redis uses TLS, Railway usually provides rediss:// automatically via REDIS_URL.
# Confirm the backend service has Redis linked (Variables → Add Reference → Redis.REDIS_URL).
# A wrong/missing REDIS_URL causes /health redis error / degraded status.

# Auth — use a long random string (≥16 chars), keep it secret
JWT_SECRET=paste-a-long-random-secret-here
JWT_EXPIRES_IN=7d

# MUST include your Vercel frontend origin (no trailing slash)
CORS_ORIGIN=https://crm-chatbot-frontend.vercel.app,http://localhost:3000

# Optional
ANTHROPIC_API_KEY=
SENTRY_DSN=
CRON_SECRET=
S3_BUCKET=
S3_REGION=ap-southeast-1
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_ENDPOINT=
S3_PUBLIC_URL=
WHATSAPP_BSP=meta
WHATSAPP_API_KEY=                 # Meta system user token
WHATSAPP_API_SECRET=              # unused for Meta
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
```

Claude + Live WhatsApp (Meta Cloud API only — no Twilio): **[CLAUDE_AND_WHATSAPP_LIVE.md](./CLAUDE_AND_WHATSAPP_LIVE.md)**.

### After saving vars on Railway

1. Redeploy / restart the backend.
2. Open `https://YOUR-RAILWAY-API.up.railway.app/health` — must be OK.
3. Test login against the API (replace host):

```bash
curl -X POST https://YOUR-RAILWAY-API.up.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@arcloops.local\",\"password\":\"Admin123!ChangeMe\"}"
```

You should get JSON with a `token`.

---

## B) Vercel — Frontend project

Root Directory: **`frontend`**

Only these are required for login:

```env
NEXT_PUBLIC_API_URL=https://YOUR-RAILWAY-API.up.railway.app
NEXT_PUBLIC_APP_URL=https://crm-chatbot-frontend.vercel.app
```

Optional:

```env
NEXT_PUBLIC_SENTRY_DSN=
```

### Critical rules

| Rule | Why |
|---|---|
| No trailing slash on URLs | Avoids broken paths |
| Set on **Production** and **Preview** | Preview deploys need the same API |
| **Redeploy** after changing `NEXT_PUBLIC_*` | Values are baked in at build time |
| Do **not** put `DATABASE_URL` / `JWT_SECRET` on Vercel frontend | Frontend never talks to Postgres |

### Wrong (causes failed login from Vercel)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Your laptop `.env.local` can keep localhost for local dev. **Vercel dashboard** must use the Railway URL.

---

## C) Local laptop (optional, for `npm run dev`)

**Root `.env`** (backend):

```env
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=change-me-to-a-long-random-secret
JWT_EXPIRES_IN=7d
DATABASE_URL=...your local or Railway postgres...
REDIS_URL=...your local or Railway redis...
LOG_LEVEL=info
```

**`frontend/.env.local`** (local UI only):

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000
```

To test production API from local UI temporarily:

```env
NEXT_PUBLIC_API_URL=https://YOUR-RAILWAY-API.up.railway.app
```

---

## D) Checklist if login still fails

1. Vercel → Settings → Environment Variables → `NEXT_PUBLIC_API_URL` = Railway API (not localhost).
2. Vercel → Deployments → **Redeploy**.
3. Browser DevTools → Network → Sign in → request URL should be `https://…railway.app/auth/login`, not localhost.
4. Railway `CORS_ORIGIN` includes `https://crm-chatbot-frontend.vercel.app`.
5. Seed already done; credentials: `admin@arcloops.local` / `Admin123!ChangeMe`.

---

## Login credentials (after seed)

| Email | Password |
|---|---|
| `admin@arcloops.local` | `Admin123!ChangeMe` |
| `viewer@arcloops.local` | `Viewer123!ChangeMe` |

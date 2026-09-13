# Arcloops CRM — WhatsApp Broadcast & AI Property Assistant

Same-repo split:

```
frontend/   → Next.js dashboard (port 3000)
backend/    → Fastify API + Prisma (port 4000)
```

## Quick start

```bash
cp .env.example .env   # set DATABASE_URL, REDIS_URL, JWT_SECRET
npm install
npm run db:migrate:deploy
npm run db:seed
npm run dev            # API + web
```

- Frontend: http://localhost:3000/login
- Backend health: http://localhost:4000/health

### Seeded logins

| Role   | Email                   | Password             |
| ------ | ----------------------- | -------------------- |
| Admin  | `admin@arcloops.local`  | `Admin123!ChangeMe`  |
| Viewer | `viewer@arcloops.local` | `Viewer123!ChangeMe` |

## Current phase

Phases **0–13**: CRM, WhatsApp campaigns/bot/inbox, analytics, developer partners, production hardening docs + E2E smoke.

See also:

- `docs/SCALE_AND_INTEGRATIONS.md`
- `docs/RUNBOOKS.md`
- `docs/VERCEL_BACKEND.md` — deploy API on Vercel (campaigns disabled)
- `node scripts/verify-phase1013.js` / `node scripts/e2e-smoke.js` (API must be running)

## Scripts

| Script                      | Purpose                      |
| --------------------------- | ---------------------------- |
| `npm run dev`               | Backend + frontend           |
| `npm run db:migrate:deploy` | Apply Prisma migrations      |
| `npm run db:seed`           | Seed admin + sample CRM data |

See `PHASE_BY_PHASE_FEATURE_PLAN.md` for the full roadmap.

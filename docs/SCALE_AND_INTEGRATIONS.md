# Scale and Integrations Roadmap

This document describes the current Arcloops CRM architecture (Phases 0–13) and the deferred integration/scale path. **No outbound CRM sync, public lead forms, or webhook dispatcher is implemented in this pass.**

## Current architecture

| Layer    | Choice                                                    |
| -------- | --------------------------------------------------------- |
| API      | Fastify + TypeScript (`backend/`)                         |
| Web      | Next.js App Router (`frontend/`)                          |
| Database | PostgreSQL via Prisma                                     |
| Queue    | Redis + BullMQ (campaign sends)                           |
| WhatsApp | `WhatsAppProvider` with `MockWhatsApp` (LIVE Twilio stub) |
| AI       | `MockAgent` / Claude when `ANTHROPIC_API_KEY` is set      |
| Auth     | JWT staff roles + permission matrix                       |

## Scale levers already in place

- Campaign rate limiting (`rateLimitPerSec` + BullMQ limiter)
- Suppression + opt-in gates on send (`assertCanMessage`)
- 24-hour WhatsApp session window enforcement
- Conversation retention job (`POST /privacy/retention/run` + `conversationRetentionDays`)
- Soft-delete / archive for listings; anonymize path for privacy delete
- Health checks for Postgres, Redis, optional S3

## Future integration slots (not implemented)

### Outbound webhooks

Suggested events: `lead.created`, `listing.sold`, `campaign.completed`, `conversation.escalated`.

Reserved setting: `AppSettings.integrationWebhookUrl` (stored, unused). When implemented, POST signed JSON payloads to this URL with retries via BullMQ.

### Public lead capture

Suggested `POST /public/leads` (API key or signed form token) creating a Prospect with `leadSource=web_form` and opt-in consent timestamp.

### External CRM / listings sync

Adapter interface: pull listings/contacts from source of truth, upsert by external ID. Open client decision (#2 in feature plan).

### Semantic listing search

pgvector on listing descriptions when portfolio size justifies it; bot tools already filter Available / Coming Soon.

### Read replicas + listing cache

Cache hot listing search results in Redis for bot latency; route analytics reads to replica when DB load grows.

### Multi-tenant / multi-branch

Would require `orgId` / `branchId` on staff and CRM entities — not in schema today.

### Feature flags

Recommendation: env vars for infra flags + `AppSettings` JSON or boolean fields for product flags (gradual rollout of LIVE WhatsApp, Claude, outbound webhooks).

## Railway → AWS migration checklist

1. Snapshot Postgres (Railway backup / `pg_dump`)
2. Provision RDS + ElastiCache Redis + ECS/Fargate or Elastic Beanstalk for API
3. Point `DATABASE_URL` / `REDIS_URL`; run `prisma migrate deploy`
4. Configure S3 bucket (replace optional MinIO/R2)
5. Cut DNS / reverse proxy; verify `/health` and campaign worker
6. Staging WABA before production Meta cutover (see `docs/RUNBOOKS.md`)

## Performance budgets (targets)

| Path                              | Target            |
| --------------------------------- | ----------------- |
| Bot mock reply                    | < 5s end-to-end   |
| Analytics APIs on seed data       | < 500ms           |
| Campaign enqueue (100 recipients) | < 2s API response |

## Related docs

- [`docs/RUNBOOKS.md`](RUNBOOKS.md) — ops incidents and rollback
- [`PHASE_BY_PHASE_FEATURE_PLAN.md`](../PHASE_BY_PHASE_FEATURE_PLAN.md) — Phase 12 feature inventory

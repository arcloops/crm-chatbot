# Operations Runbooks

## Backup and restore drill (Postgres)

### Backup (Railway)

1. Open Railway project → Postgres service → **Backups** (or Data → Download).
2. Alternatively from a machine with `DATABASE_URL`:

```bash
pg_dump "$DATABASE_URL" --format=custom --file="crm-$(date +%Y%m%d).dump"
```

3. Store the dump off-platform (S3 / secure drive). Note schema version (`prisma migrate status`).

### Restore drill

1. Provision empty Postgres (or restore to a staging branch).
2. Restore:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" crm-YYYYMMDD.dump
```

3. Run `npm run db:migrate:deploy` if dump is pre-migration.
4. Verify: `GET /health`, admin login, `/stats`, one campaign report.
5. Document time-to-restore in your ops log.

Local Docker volumes (`postgres_data`) are **not** a backup strategy — they only persist across container restarts.

---

## BSP / WhatsApp outage

1. Pause running campaigns: `POST /campaigns/:id/pause` for each `RUNNING` campaign (or cancel).
2. Set Settings → WhatsApp mode to `MOCK` only if you must keep Lab testing; production should stay `LIVE` but stop outbound.
3. Inbox remains usable for reading threads; agent replies will fail if BSP is down — notify Support Agents.
4. When BSP recovers: resume paused campaigns carefully (or clone + start fresh); check delivery webhooks.

## Meta template rejection

1. Mark template status non-APPROVED in `WhatsAppTemplate` (or remove from catalog).
2. Campaign preflight will block start until an APPROVED template is selected.
3. Update seed / sync catalog when Meta re-approves.

## Claude API downtime

- Agent factory uses Claude only when `ANTHROPIC_API_KEY` is set; on API failure it falls back to `MockAgent`.
- Expect keyword/tool-based replies (listing search still hits Postgres).
- Escalate path still works via keywords (“talk to broker”).

## Redis queue backlog / worker stuck

1. Check `GET /health` Redis status.
2. Ensure API process started campaign worker (`Campaign worker started` in logs) or run `npm run worker -w backend`.
3. Pause campaigns if backlog grows unbounded.
4. Inspect BullMQ jobs; remove stuck delayed jobs for cancelled campaigns via pause/cancel endpoints.

## Rollback procedure

1. **Pause all RUNNING campaigns** before schema rollback.
2. Redeploy previous git SHA of `backend` + `frontend`.
3. If a migration must be reversed: restore DB from backup taken before migrate (preferred) — Prisma does not auto-down.
4. Confirm `/` reports expected phase and `/health` is green.
5. Re-seed only if staging; never re-seed production blindly.

## Staging WABA cutover checklist

1. Create staging WhatsApp Business Account / sandbox number.
2. Set `WHATSAPP_*` env on staging; `whatsappMode=LIVE`.
3. Verify webhook challenge `GET /webhooks/whatsapp`.
4. Send one approved template to internal number; confirm Message + delivery status.
5. Run STOP → suppression → campaign skip smoke test.
6. Sign off UAT; promote same image + env pattern to production with production WABA.

## Performance notes

- Analytics APIs should stay under ~500ms on seed-sized data.
- Mock bot reply target < 5s.
- Prefer indexes already present on `leadStage`, campaign status, message conversationId.

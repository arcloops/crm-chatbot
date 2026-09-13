/**
 * Print Postgres backup/restore checklist (no credentials required).
 * See docs/RUNBOOKS.md for the full drill.
 */
console.log(`
Arcloops CRM — backup notes
============================
1. Prefer Railway Postgres Backups UI for scheduled snapshots.
2. Manual: pg_dump "$DATABASE_URL" -Fc -f crm-$(date +%Y%m%d).dump
3. Restore drill: pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" dumpfile
4. After restore: npm run db:migrate:deploy && curl localhost:4000/health
5. Never rely solely on local Docker volumes as backup.

Full runbook: docs/RUNBOOKS.md
`);

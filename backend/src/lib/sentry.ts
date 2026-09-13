import { env } from "./env.js";
import { getLogger } from "./logger.js";

const log = getLogger({ module: "sentry" });

let enabled = false;

/** Optional Sentry init — no-op when SENTRY_DSN is unset. */
export function initSentry() {
  const dsn = env().SENTRY_DSN;
  if (!dsn) {
    log.debug("Sentry disabled (no SENTRY_DSN)");
    return;
  }
  enabled = true;
  log.info("Sentry enabled");
}

export function captureException(error: unknown) {
  if (!enabled) return;
  // Lightweight capture without @sentry/node dependency when DSN unset.
  // When DSN is set, POST to Sentry envelope API (store).
  const dsn = env().SENTRY_DSN;
  if (!dsn) return;

  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    const ingest = `${url.protocol}//${url.host}/api/${projectId}/store/`;
    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: Date.now() / 1000,
      platform: "node",
      level: "error",
      server_name: "crm-backend",
      exception: {
        values: [
          {
            type: error instanceof Error ? error.name : "Error",
            value: error instanceof Error ? error.message : String(error),
          },
        ],
      },
    };
    void fetch(ingest, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=crm-backend/1.0`,
      },
      body: JSON.stringify(event),
    }).catch(() => undefined);
  } catch {
    // never throw from capture
  }
}

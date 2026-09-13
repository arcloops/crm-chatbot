import pino from "pino";
import { env } from "./env.js";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
          },
        },
      }
    : {}),
  base: {
    service: "crm-backend",
  },
});

export function getLogger(bindings: Record<string, unknown> = {}) {
  try {
    return logger.child({
      ...bindings,
      env: env().NODE_ENV,
    });
  } catch {
    return logger.child(bindings);
  }
}

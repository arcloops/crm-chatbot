import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  value === "" || value === undefined || value === null ? undefined : value;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  S3_BUCKET: z.preprocess(emptyToUndefined, z.string().optional()),
  S3_REGION: z.preprocess(emptyToUndefined, z.string().default("ap-southeast-1")),
  S3_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  S3_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  S3_ENDPOINT: z.preprocess(emptyToUndefined, z.string().url().optional()),
  S3_PUBLIC_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),

  ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),

  SENTRY_DSN: z.preprocess(emptyToUndefined, z.string().optional()),

  WHATSAPP_BSP: z.preprocess(emptyToUndefined, z.string().optional()),
  WHATSAPP_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  WHATSAPP_API_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  WHATSAPP_PHONE_NUMBER_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new Error(`Invalid environment variables:\n${details}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function isStorageConfigured(): boolean {
  const e = env();
  return Boolean(e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY);
}

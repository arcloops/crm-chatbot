/** Runtime helpers for local vs Vercel serverless. */
export function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

/** Campaign queue/worker are not supported on Vercel Functions. */
export function campaignsQueueEnabled(): boolean {
  if (isVercelRuntime()) return false;
  if (process.env.CAMPAIGNS_QUEUE_DISABLED === "1") return false;
  return true;
}

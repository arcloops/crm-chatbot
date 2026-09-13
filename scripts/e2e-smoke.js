require("dotenv").config();

/**
 * API smoke tests for Phases 10–13 (campaign, bot/inbox, STOP skip, analytics, developer).
 * Run against a live API with seed data: node scripts/e2e-smoke.js
 */
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function req(path, { method = "GET", token, body } = {}) {
  const headers = {
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("E2E smoke against", API);

  const login = await req("/auth/login", {
    method: "POST",
    body: { email: "admin@arcloops.local", password: "Admin123!ChangeMe" },
  });
  assert(login.status === 200, "admin login failed");
  const token = login.data.token;

  const root = await req("/");
  assert(root.data?.phase === "10-13", `expected phase 10-13 got ${root.data?.phase}`);

  // 1) Campaign create → preview → start → report
  const campaign = await req("/campaigns", {
    method: "POST",
    token,
    body: {
      name: `Smoke ${Date.now()}`,
      audienceType: "PROSPECTS",
      audienceFilters: { optInOnly: true },
      templateName: "listing_share",
      rateLimitPerSec: 20,
    },
  });
  assert(campaign.status === 201, "campaign create failed");
  const id = campaign.data.id;

  const preview = await req(`/campaigns/${id}/preview`, { method: "POST", token });
  assert(preview.status === 200, "preview failed");

  const preflight = await req(`/campaigns/${id}/preflight`, { method: "POST", token });
  assert(preflight.data?.ok === true, "preflight not ok");

  const start = await req(`/campaigns/${id}/start`, { method: "POST", token });
  assert(start.status === 200, "start failed");

  let sent = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const report = await req(`/campaigns/${id}/report`, { token });
    sent = report.data?.campaign?.sentCount ?? 0;
    if (sent > 0) break;
  }
  assert(sent > 0, "expected campaign sends in report");
  console.log("campaign sent", sent);

  // 2) Mock inbound → bot → escalate → inbox reply
  const botPhone = `01713${String(Date.now()).slice(-6)}`;
  const inbound = await req("/whatsapp/mock/inbound", {
    method: "POST",
    token,
    body: { from: botPhone, body: "Looking for 2BR in Gulshan" },
  });
  assert(inbound.data?.action === "bot_replied", "expected bot_replied");

  const escalate = await req("/whatsapp/mock/inbound", {
    method: "POST",
    token,
    body: { from: botPhone, body: "talk to a broker please" },
  });
  assert(escalate.data?.action === "escalated", "expected escalated");

  const inbox = await req("/inbox/conversations?filter=escalated", { token });
  assert(inbox.status === 200, "inbox failed");
  const thread = (inbox.data?.data ?? []).find((c) => c.phoneE164?.includes("1713"));
  assert(thread, "escalated conversation not found");

  const reply = await req(`/inbox/conversations/${thread.id}/reply`, {
    method: "POST",
    token,
    body: { body: "Hello from smoke test agent" },
  });
  assert(reply.status === 200 || reply.status === 201, "inbox reply failed");

  // 3) STOP → suppressed → campaign skips phone
  const stopPhone = `01714${String(Date.now()).slice(-6)}`;
  await req("/whatsapp/mock/inbound", {
    method: "POST",
    token,
    body: { from: stopPhone, body: "hello" },
  });
  const stop = await req("/whatsapp/mock/inbound", {
    method: "POST",
    token,
    body: { from: stopPhone, body: "STOP" },
  });
  assert(stop.data?.action === "stop", `expected stop got ${stop.data?.action}`);

  let stopE164 = stop.data?.phoneE164;
  if (!stopE164) {
    const check = await req("/suppression/check", {
      method: "POST",
      token,
      body: { phone: stopPhone },
    });
    assert(check.data?.suppressed === true, "STOP phone should be suppressed");
    stopE164 = check.data.phoneE164;
  }

  const skipCampaign = await req("/campaigns", {
    method: "POST",
    token,
    body: {
      name: `Skip ${Date.now()}`,
      audienceType: "PROSPECTS",
      audienceFilters: { optInOnly: false },
      templateName: "hello_world",
      rateLimitPerSec: 20,
    },
  });
  assert(skipCampaign.status === 201, "skip campaign create failed");
  await req(`/campaigns/${skipCampaign.data.id}/start`, { method: "POST", token });
  await sleep(2500);
  const skipReport = await req(`/campaigns/${skipCampaign.data.id}/report`, { token });
  const skipped = skipReport.data?.byStatus?.SKIPPED ?? 0;
  assert(skipped >= 1, `expected at least 1 SKIPPED got ${skipped}`);
  const skipRecipients = await req(`/campaigns/${skipCampaign.data.id}/recipients`, {
    token,
  });
  const stopRecipient = (skipRecipients.data?.data ?? []).find(
    (r) => r.phoneE164 === stopE164 || r.phoneE164?.endsWith(stopPhone.slice(-8)),
  );
  assert(
    stopRecipient?.status === "SKIPPED",
    `STOP phone should be SKIPPED, got ${JSON.stringify(stopRecipient)}`,
  );
  console.log("skip campaign statuses", skipReport.data?.byStatus);

  // Analytics + developer
  const overview = await req("/analytics/overview", { token });
  assert(overview.status === 200, "analytics overview failed");
  assert(typeof overview.data?.campaignsRun === "number", "overview shape");

  const funnel = await req("/analytics/funnel", { token });
  assert(funnel.status === 200 && Array.isArray(funnel.data?.funnel), "funnel failed");

  const developers = await req("/developers", { token });
  assert(developers.status === 200, "developers list failed");
  assert((developers.data?.data?.length ?? 0) >= 1, "expected seeded developer");

  const stats = await req("/stats", { token });
  assert(typeof stats.data?.campaignsTotal === "number", "stats missing campaignsTotal");

  console.log("E2E smoke OK");
}

main().catch((err) => {
  console.error("E2E smoke FAILED", err);
  process.exit(1);
});

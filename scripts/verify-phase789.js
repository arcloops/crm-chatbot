require("dotenv").config();

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
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const login = await req("/auth/login", {
    method: "POST",
    body: { email: "admin@arcloops.local", password: "Admin123!ChangeMe" },
  });
  assert(login.status === 200, "admin login failed");
  const token = login.data.token;

  const root = await req("/");
  console.log("phase", root.data?.phase);

  // Bot inbound search (fresh phone so takeover from prior runs doesn't block)
  const botPhone = `01712${String(Date.now()).slice(-6)}`;
  const inbound = await req("/whatsapp/mock/inbound", {
    method: "POST",
    token,
    body: {
      from: botPhone,
      body: "Looking for 3BR in Banani under 1 cr",
    },
  });
  console.log("bot inbound", inbound.status, inbound.data?.action);
  assert(inbound.data?.action === "bot_replied", "expected bot_replied");

  const escalate = await req("/whatsapp/mock/inbound", {
    method: "POST",
    token,
    body: { from: botPhone, body: "Please talk to a broker" },
  });
  console.log("escalate", escalate.status, escalate.data?.action);
  assert(escalate.data?.action === "escalated", "expected escalated");

  const inbox = await req("/inbox/conversations?filter=escalated", { token });
  console.log("inbox escalated", inbox.status, inbox.data?.data?.length);

  // Campaign flow
  const campaign = await req("/campaigns", {
    method: "POST",
    token,
    body: {
      name: `Verify ${Date.now()}`,
      audienceType: "PROSPECTS",
      audienceFilters: { optInOnly: true },
      templateName: "listing_share",
      rateLimitPerSec: 10,
    },
  });
  console.log("campaign create", campaign.status, campaign.data?.id);
  assert(campaign.status === 201, "campaign create failed");
  const id = campaign.data.id;

  const preflight = await req(`/campaigns/${id}/preflight`, {
    method: "POST",
    token,
  });
  console.log("preflight", preflight.status, preflight.data?.ok);

  const preview = await req(`/campaigns/${id}/preview`, {
    method: "POST",
    token,
  });
  console.log("preview", preview.status, preview.data);

  const start = await req(`/campaigns/${id}/start`, { method: "POST", token });
  console.log("start", start.status, start.data?.status ?? start.data?.error);
  assert(start.status === 200, `campaign start failed: ${JSON.stringify(start.data)}`);

  // Wait briefly for worker
  await new Promise((r) => setTimeout(r, 5000));
  const report = await req(`/campaigns/${id}/report`, { token });
  console.log("report", report.status, report.data?.campaign);
  assert(
    (report.data?.campaign?.sentCount ?? 0) > 0 ||
      (report.data?.byStatus?.DELIVERED ?? 0) > 0 ||
      (report.data?.byStatus?.QUEUED ?? 0) > 0,
    "expected some recipients processed",
  );

  // STOP compliance
  const stopPhone = `01711${String(Date.now()).slice(-6)}`;
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
  console.log("stop", stop.status, stop.data?.action);
  const check = await req("/suppression/check", {
    method: "POST",
    token,
    body: { phone: stopPhone },
  });
  console.log("suppressed after STOP", check.data);

  const startKw = await req("/whatsapp/mock/inbound", {
    method: "POST",
    token,
    body: { from: stopPhone, body: "START" },
  });
  console.log("start keyword", startKw.status, startKw.data?.action);

  console.log("Phase 7–9 verify OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

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

async function main() {
  const login = await req("/auth/login", {
    method: "POST",
    body: { email: "admin@arcloops.local", password: "Admin123!ChangeMe" },
  });
  assert(login.status === 200, "login failed");
  const token = login.data.token;

  const root = await req("/");
  assert(root.data?.phase === "10-13", "phase");

  const stats = await req("/stats", { token });
  assert(typeof stats.data.campaignsTotal === "number", "campaignsTotal");
  assert(stats.data.campaignsByStatus, "campaignsByStatus");

  const overview = await req("/analytics/overview", { token });
  assert(overview.status === 200, "overview");

  const campaigns = await req("/analytics/campaigns", { token });
  assert(Array.isArray(campaigns.data?.data), "campaigns analytics");

  const funnel = await req("/analytics/funnel", { token });
  assert(funnel.data?.funnel?.length >= 1, "funnel");

  const inventory = await req("/analytics/inventory", { token });
  assert(inventory.status === 200, "inventory");

  const attr = await req("/analytics/attribution", { token });
  assert(attr.status === 200, "attribution");

  const lead = await req("/analytics/brokers/leaderboard", { token });
  assert(lead.status === 200, "leaderboard");

  const inbox = await req("/analytics/inbox/metrics", { token });
  assert(inbox.status === 200, "inbox metrics");

  const developers = await req("/developers", { token });
  assert((developers.data?.data?.length ?? 0) >= 1, "developer seed");
  const devId = developers.data.data[0].id;

  const detail = await req(`/developers/${devId}`, { token });
  assert(detail.status === 200, "developer detail");
  assert((detail.data.projects?.length ?? 0) >= 1, "project seed");

  const projectId = detail.data.projects[0].id;
  const bulk = await req(`/projects/${projectId}/listings/bulk`, {
    method: "POST",
    token,
    body: {
      titlePrefix: "Verify Unit",
      unitNumbers: [`V${Date.now() % 10000}`],
      price: 9900000,
    },
  });
  assert(bulk.status === 201, `bulk failed ${JSON.stringify(bulk.data)}`);
  assert(bulk.data.count === 1, "bulk count");

  // repliedCount increment path: campaign recipient then inbound
  const camp = await req("/campaigns", {
    method: "POST",
    token,
    body: {
      name: `Reply metric ${Date.now()}`,
      audienceType: "PROSPECTS",
      audienceFilters: { optInOnly: true },
      templateName: "hello_world",
      rateLimitPerSec: 20,
    },
  });
  assert(camp.status === 201, "camp");
  await req(`/campaigns/${camp.data.id}/start`, { method: "POST", token });
  await new Promise((r) => setTimeout(r, 2500));
  const before = await req(`/campaigns/${camp.data.id}/report`, { token });
  const replyPhone = before.data?.byStatus ? null : null;
  void replyPhone;
  const recipients = await req(`/campaigns/${camp.data.id}/recipients`, { token });
  const target = (recipients.data?.data ?? []).find(
    (r) => r.status === "SENT" || r.status === "DELIVERED" || r.status === "QUEUED",
  );
  if (target) {
    await req("/whatsapp/mock/inbound", {
      method: "POST",
      token,
      body: { from: target.phoneE164, body: "Interested!" },
    });
    const after = await req(`/campaigns/${camp.data.id}/report`, { token });
    assert(
      (after.data?.campaign?.repliedCount ?? 0) >= 1 ||
        (after.data?.byStatus?.REPLIED ?? 0) >= 1,
      "repliedCount not incremented",
    );
  }

  console.log("verify-phase1013 OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

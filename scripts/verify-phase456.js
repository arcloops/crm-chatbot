require("dotenv").config();

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function req(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

  const settings = await req("/settings", { token });
  console.log("settings", settings.status, settings.data?.whatsappMode);

  const search = await req("/search?q=Banani", { token });
  console.log("search", search.status, {
    listings: search.data?.listings?.length,
    prospects: search.data?.prospects?.length,
  });

  const prospects = await req("/prospects", { token });
  const prospect = prospects.data?.data?.find((p) => !p.convertedAt);
  assert(prospect, "need an open prospect");

  const viewing = await req(`/prospects/${prospect.id}/viewing`, {
    method: "POST",
    token,
    body: { viewingNote: "verify viewing" },
  });
  console.log("viewing", viewing.status, viewing.data?.leadStage);

  const customers = await req("/customers", { token });
  const customer = customers.data?.data?.[0];
  assert(customer, "need a customer");

  const referralPhone = `01711${String(Date.now()).slice(-6)}`;
  const referral = await req(`/customers/${customer.id}/referrals`, {
    method: "POST",
    token,
    body: {
      name: "Referral Lead",
      phone: referralPhone,
      intent: "BUY",
    },
  });
  console.log("referral", referral.status, referral.data?.leadSource);

  const brokers = await req("/brokers", { token });
  const broker = brokers.data?.data?.[0];
  const workload = await req(`/brokers/${broker.id}/workload`, { token });
  console.log("workload", workload.status, workload.data?.counts);

  const templates = await req("/whatsapp/templates", { token });
  console.log("templates", templates.status, templates.data?.data?.length);

  const tplName = templates.data?.data?.[0]?.name ?? "hello_world";
  const send = await req("/whatsapp/send", {
    method: "POST",
    token,
    body: {
      to: "+8801711000003",
      type: "TEMPLATE",
      templateName: tplName,
    },
  });
  console.log("send template", send.status, send.data?.message?.status);

  const inbound = await req("/whatsapp/mock/inbound", {
    method: "POST",
    token,
    body: { from: "+8801711000003", body: "verify inbound" },
  });
  console.log(
    "inbound",
    inbound.status,
    inbound.data?.conversation?.messages?.length ?? inbound.data?.conversation?.id,
  );

  const textSend = await req("/whatsapp/send", {
    method: "POST",
    token,
    body: {
      to: "+8801711000003",
      type: "TEXT",
      body: "follow-up inside window",
    },
  });
  console.log("send text", textSend.status, textSend.data?.message?.status);

  console.log("Phase 4–6 verify OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

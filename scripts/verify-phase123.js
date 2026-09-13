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

async function main() {
  const login = await req("/auth/login", {
    method: "POST",
    body: { email: "admin@arcloops.local", password: "Admin123!ChangeMe" },
  });
  console.log("admin login", login.status, login.data?.user?.role);
  const token = login.data.token;

  const viewerLogin = await req("/auth/login", {
    method: "POST",
    body: { email: "viewer@arcloops.local", password: "Viewer123!ChangeMe" },
  });
  const viewerToken = viewerLogin.data.token;

  const viewerCreate = await req("/listings", {
    method: "POST",
    token: viewerToken,
    body: {
      title: "Should fail",
      propertyCategory: "APARTMENT",
      transactionType: "SALE",
      location: "Dhaka",
      price: 100,
    },
  });
  console.log("viewer create listing (expect 403)", viewerCreate.status);

  const listings = await req("/listings?activeOnly=true", { token });
  console.log("listings count", listings.status, listings.data?.data?.length);

  const checkOk = await req("/suppression/check", {
    method: "POST",
    token,
    body: { phone: "0171100001" },
  });
  console.log("check unsuppressed", checkOk.status, checkOk.data);

  const addSupp = await req("/suppression", {
    method: "POST",
    token,
    body: { phone: "01711999999", source: "test" },
  });
  console.log("add suppression", addSupp.status, addSupp.data?.phoneE164);

  const checkBlocked = await req("/suppression/check", {
    method: "POST",
    token,
    body: { phone: "01711999999" },
  });
  console.log("check suppressed", checkBlocked.status, checkBlocked.data);

  const stats = await req("/stats", { token });
  console.log("stats", stats.status, {
    staff: stats.data?.staffActive,
    brokers: stats.data?.brokersActive,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

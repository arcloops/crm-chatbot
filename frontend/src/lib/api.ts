const TOKEN_KEY = "crm_access_token";

export type StaffRole = "ADMIN" | "CAMPAIGN_MANAGER" | "SUPPORT_AGENT" | "VIEWER";

export type Permission =
  | "staff:read"
  | "staff:write"
  | "listings:read"
  | "listings:write"
  | "contacts:read"
  | "contacts:write"
  | "suppression:read"
  | "suppression:write"
  | "campaigns:read"
  | "campaigns:write"
  | "inbox:read"
  | "inbox:write"
  | "privacy:admin";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  permissions: Permission[];
};

export function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function formatErrorBody(body: unknown): string {
  if (typeof body === "string") return body;
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string") return err;
    try {
      return JSON.stringify(err);
    } catch {
      return "Request failed";
    }
  }
  return "Request failed";
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`${formatErrorBody(body)} (${status})`);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (res.status === 401 && typeof window !== "undefined") {
    clearToken();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }

  return body as T;
}

export function can(user: AuthUser | null, permission: Permission): boolean {
  return Boolean(user?.permissions.includes(permission));
}

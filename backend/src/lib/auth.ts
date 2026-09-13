import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { StaffRole } from "@prisma/client";
import { env } from "./env.js";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: StaffRole;
  name: string;
};

function secretKey() {
  return new TextEncoder().encode(env().JWT_SECRET);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signAccessToken(payload: AuthTokenPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(env().JWT_EXPIRES_IN)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey());
  if (
    !payload.sub ||
    typeof payload.email !== "string" ||
    typeof payload.role !== "string"
  ) {
    throw new Error("Invalid token payload");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    role: payload.role as StaffRole,
    name: typeof payload.name === "string" ? payload.name : "",
  };
}

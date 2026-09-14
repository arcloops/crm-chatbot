import type { FastifyPluginAsync } from "fastify";
import { ActiveStatus, StaffRole } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { hashPassword, signAccessToken, verifyPassword } from "../lib/auth.js";
import { prisma } from "../lib/db.js";
import { env } from "../lib/env.js";
import { getLogger } from "../lib/logger.js";
import { permissionsForRole } from "../lib/permissions.js";
import { authenticate } from "../plugins/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const signupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(128),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function staffPayload(staff: {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}) {
  return {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    permissions: permissionsForRole(staff.role),
  };
}

async function issueToken(staff: {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}) {
  const token = await signAccessToken({
    sub: staff.id,
    email: staff.email,
    role: staff.role,
    name: staff.name,
  });
  return { token, user: staffPayload(staff) };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid credentials payload" });
    }

    const email = parsed.data.email.toLowerCase();
    const staff = await prisma.staffUser.findUnique({ where: { email } });
    if (!staff || staff.activeStatus !== ActiveStatus.ACTIVE) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const ok = await verifyPassword(parsed.data.password, staff.passwordHash);
    if (!ok) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    return issueToken(staff);
  });

  app.post("/auth/signup", async (request, reply) => {
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid signup payload" });
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.staffUser.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: "An account with this email already exists" });
    }

    const staffCount = await prisma.staffUser.count();
    const staff = await prisma.staffUser.create({
      data: {
        name: parsed.data.name.trim(),
        email,
        passwordHash: await hashPassword(parsed.data.password),
        // First account becomes admin; later signups are viewers until promoted.
        role: staffCount === 0 ? StaffRole.ADMIN : StaffRole.VIEWER,
        activeStatus: ActiveStatus.ACTIVE,
      },
    });

    return reply.status(201).send(await issueToken(staff));
  });

  app.post("/auth/forgot-password", async (request, reply) => {
    const parsed = forgotSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Valid email required" });
    }

    const email = parsed.data.email.toLowerCase();
    const generic = {
      ok: true,
      message: "If an account exists for that email, reset instructions were sent.",
    };

    const staff = await prisma.staffUser.findUnique({ where: { email } });
    if (!staff || staff.activeStatus !== ActiveStatus.ACTIVE) {
      return generic;
    }

    await prisma.passwordResetToken.updateMany({
      where: { staffUserId: staff.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: hashToken(rawToken),
        expiresAt,
        staffUserId: staff.id,
      },
    });

    const appOrigin = env().CORS_ORIGIN.replace(/\/+$/, "");
    const resetUrl = `${appOrigin}/reset-password?token=${rawToken}`;
    getLogger({ route: "auth/forgot-password" }).info(
      { email, resetUrl },
      "Password reset link created",
    );

    // No mailer configured yet — expose the link outside production for local testing.
    if (env().NODE_ENV !== "production") {
      return { ...generic, devResetUrl: resetUrl };
    }
    return generic;
  });

  app.post("/auth/reset-password", async (request, reply) => {
    const parsed = resetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid reset payload" });
    }

    const tokenHash = hashToken(parsed.data.token);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { staffUser: true },
    });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt.getTime() < Date.now() ||
      record.staffUser.activeStatus !== ActiveStatus.ACTIVE
    ) {
      return reply.status(400).send({ error: "Reset link is invalid or expired" });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.$transaction([
      prisma.staffUser.update({
        where: { id: record.staffUserId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.updateMany({
        where: { staffUserId: record.staffUserId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    return { ok: true, message: "Password updated. You can sign in now." };
  });

  app.get("/auth/me", { preHandler: authenticate }, async (request) => {
    const staff = await prisma.staffUser.findUniqueOrThrow({
      where: { id: request.authUser!.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        activeStatus: true,
        permissions: true,
      },
    });
    return {
      ...staff,
      permissions: permissionsForRole(staff.role),
    };
  });

  app.post("/auth/logout", async () => ({ ok: true }));
};

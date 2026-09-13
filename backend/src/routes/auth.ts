import type { FastifyPluginAsync } from "fastify";
import { ActiveStatus } from "@prisma/client";
import { z } from "zod";
import { signAccessToken, verifyPassword } from "../lib/auth.js";
import { prisma } from "../lib/db.js";
import { permissionsForRole } from "../lib/permissions.js";
import { authenticate } from "../plugins/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

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

    const token = await signAccessToken({
      sub: staff.id,
      email: staff.email,
      role: staff.role,
      name: staff.name,
    });

    return {
      token,
      user: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        permissions: permissionsForRole(staff.role),
      },
    };
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

import type { FastifyPluginAsync } from "fastify";
import { ActiveStatus, StaffRole } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../lib/auth.js";
import { prisma } from "../lib/db.js";
import { permissionsForRole } from "../lib/permissions.js";
import { requirePermission } from "../plugins/auth.js";

const staffBodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.nativeEnum(StaffRole),
  activeStatus: z.nativeEnum(ActiveStatus).optional(),
});

export const staffRoutes: FastifyPluginAsync = async (app) => {
  app.get("/staff", { preHandler: requirePermission("staff:read") }, async () => {
    const users = await prisma.staffUser.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        activeStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { data: users };
  });

  app.post(
    "/staff",
    { preHandler: requirePermission("staff:write") },
    async (request, reply) => {
      const parsed = staffBodySchema.safeParse(request.body);
      if (!parsed.success || !parsed.data.password) {
        return reply
          .status(400)
          .send({ error: "Invalid staff payload (password required)" });
      }

      const email = parsed.data.email.toLowerCase();
      const existing = await prisma.staffUser.findUnique({ where: { email } });
      if (existing) {
        return reply.status(409).send({ error: "Email already exists" });
      }

      const user = await prisma.staffUser.create({
        data: {
          name: parsed.data.name,
          email,
          passwordHash: await hashPassword(parsed.data.password),
          role: parsed.data.role,
          permissions: permissionsForRole(parsed.data.role),
          activeStatus: parsed.data.activeStatus ?? ActiveStatus.ACTIVE,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          activeStatus: true,
        },
      });

      return reply.status(201).send(user);
    },
  );

  app.patch(
    "/staff/:id",
    { preHandler: requirePermission("staff:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = staffBodySchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid staff payload" });
      }

      const data: Record<string, unknown> = { ...parsed.data };
      delete data.password;
      if (parsed.data.email) data.email = parsed.data.email.toLowerCase();
      if (parsed.data.role) data.permissions = permissionsForRole(parsed.data.role);
      if (parsed.data.password) {
        data.passwordHash = await hashPassword(parsed.data.password);
      }

      try {
        const user = await prisma.staffUser.update({
          where: { id },
          data,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            activeStatus: true,
          },
        });
        return user;
      } catch {
        return reply.status(404).send({ error: "Staff not found" });
      }
    },
  );
};

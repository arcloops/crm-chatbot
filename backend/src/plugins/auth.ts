import type { FastifyReply, FastifyRequest } from "fastify";
import { ActiveStatus, type StaffRole } from "@prisma/client";
import { verifyAccessToken, type AuthTokenPayload } from "../lib/auth.js";
import { prisma } from "../lib/db.js";
import {
  hasPermission,
  permissionsForRole,
  type Permission,
} from "../lib/permissions.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthTokenPayload & { permissions: Permission[] };
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  try {
    const token = header.slice("Bearer ".length);
    const payload = await verifyAccessToken(token);
    const staff = await prisma.staffUser.findUnique({ where: { id: payload.sub } });
    if (!staff || staff.activeStatus !== ActiveStatus.ACTIVE) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    request.authUser = {
      ...payload,
      role: staff.role,
      permissions: permissionsForRole(staff.role),
    };
  } catch {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}

export function requirePermission(...permissions: Permission[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const role = request.authUser!.role as StaffRole;
    const missing = permissions.filter((p) => !hasPermission(role, p));
    if (missing.length > 0) {
      return reply.status(403).send({ error: "Forbidden", missing });
    }
  };
}

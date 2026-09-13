import { prisma } from "./db.js";

export async function nextCode(
  prefix: string,
  table: "listing" | "broker" | "customer" | "prospect" | "developer" | "project",
) {
  const count =
    table === "listing"
      ? await prisma.listing.count()
      : table === "broker"
        ? await prisma.broker.count()
        : table === "customer"
          ? await prisma.customer.count()
          : table === "prospect"
            ? await prisma.prospect.count()
            : table === "developer"
              ? await prisma.developer.count()
              : await prisma.project.count();
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}

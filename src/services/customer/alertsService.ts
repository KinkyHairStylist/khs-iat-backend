import prisma from "../../lib/prisma/prisma";

/**
 * The platform alerts customers (or merchants) should see right now (staff
 * create them in khs-iat-staff-fe): active, for that audience or everyone, and not expired.
 */
export function listActiveCustomerAlerts(audience: "customer" | "merchant" = "customer") {
  return prisma.system_alerts.findMany({
    where: {
      isActive: true,
      audience: { in: [audience, "all"] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, message: true, severity: true },
  });
}

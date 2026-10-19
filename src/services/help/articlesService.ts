import prisma from "../../lib/prisma/prisma";

// Help-centre articles, written by the KHS team in the staff app.

export const HELP_SECTIONS = ["get_started", "payment_method", "booking_management"] as const;
export type HelpSection = (typeof HELP_SECTIONS)[number];

/** A section's articles, oldest first (the order the team wrote them in). */
export function listArticles(section: HelpSection) {
  return prisma.articles.findMany({
    where: { section },
    select: { id: true, section: true, title: true, content: true, fileUrl: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

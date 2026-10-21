import prisma from "../../lib/prisma/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/centralAppError";
import type { SubscribeNewsletterInput } from "../../schemas/customer/landing.schema";

// The public content on the landing page. Staff manage all of it in
// khs-iat-staff-be; this service only ever reads what is live, plus the
// newsletter sign-up.

export function listActiveStats() {
  return prisma.landing_statistics.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
}

export function listApprovedTestimonials() {
  return prisma.testimonials.findMany({
    // A rejected testimonial stays hidden even if it was approved earlier.
    where: { isApproved: true, isRejected: false },
    orderBy: { createdAt: "desc" },
  });
}

export function listPublishedBlogPosts() {
  return prisma.blog_posts.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: "desc" },
  });
}

/** One published post by its slug; a draft or unknown slug is "not found". */
export async function getPublishedBlogPost(slug: string) {
  const post = await prisma.blog_posts.findFirst({ where: { slug, isPublished: true } });
  if (!post) throw AppError.notFound("Blog post");
  return post;
}

export function listActiveFaqs() {
  return prisma.faqs.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
}

export function listPublishedStories() {
  return prisma.stories.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function subscribeNewsletter({ email }: SubscribeNewsletterInput): Promise<void> {
  // Older sign-ups were stored as typed, so match without regard to case.
  const existing = await prisma.newsletter_subscribers.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) throw AppError.conflict("This email is already subscribed.", "ALREADY_SUBSCRIBED");

  try {
    await prisma.newsletter_subscribers.create({ data: { email } });
  } catch (err) {
    // Two sign-ups for the same address at the same moment: the second hits
    // the unique index after passing the check above.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw AppError.conflict("This email is already subscribed.", "ALREADY_SUBSCRIBED");
    }
    throw err;
  }
}

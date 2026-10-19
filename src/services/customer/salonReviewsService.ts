import prisma from "../../lib/prisma/prisma";
import redis from "../../lib/redis/redis";
import { AppError } from "../../middlewares/centralAppError";
import { assertPublicSalon } from "./salonDetailService";

// A salon's reviews (the "Salon Review" section of the salon page) and the
// "Helpful" button on each one.

// The newest reviews are listed; the average and star counts cover them all.
const MAX_LISTED_REVIEWS = 100;

interface ReviewRow {
  id: string;
  rating: number;
  comment: string;
  clientName: string;
  clientProfileImage: string | null;
  service: string;
  likes: number;
  reply: string | null;
  replyTime: Date | null;
  createdAt: Date;
}

export async function getSalonReviews(businessId: string) {
  await assertPublicSalon(businessId);

  const [reviews, counts] = await Promise.all([
    prisma.$queryRaw<ReviewRow[]>`
      SELECT id, rating::float AS rating, comment, "clientName", "clientProfileImage", service, likes,
             reply, "replyTime", "createdAt"
      FROM reviews WHERE "businessId" = ${businessId}::uuid
      ORDER BY "createdAt" DESC, id
      LIMIT ${MAX_LISTED_REVIEWS}`,
    prisma.$queryRaw<Array<{ stars: number; count: number; total: number }>>`
      SELECT ROUND(rating)::int AS stars, COUNT(*)::int AS count, SUM(rating)::float AS total
      FROM reviews WHERE "businessId" = ${businessId}::uuid
      GROUP BY ROUND(rating)`,
  ]);

  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const ratingSum = counts.reduce((sum, c) => sum + c.total, 0);
  return {
    reviews,
    average: total > 0 ? Math.round((ratingSum / total) * 10) / 10 : 0,
    total,
    breakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts.find((c) => c.stars === stars)?.count ?? 0 })),
  };
}

// Who has marked a review helpful, so each customer counts once. The reviews
// table only has a bare counter, so the voters are kept in Redis.
const votersKey = (reviewId: string) => `customer-review-helpful:${reviewId}`;

/** Counts the customer's "Helpful" once per review; a second tap changes nothing. */
export async function markReviewHelpful(userId: string, reviewId: string): Promise<{ likes: number }> {
  const review = await prisma.reviews.findUnique({ where: { id: reviewId }, select: { likes: true } });
  if (!review) throw AppError.notFound("Review");

  const firstVote = (await redis.sadd(votersKey(reviewId), userId)) === 1;
  if (!firstVote) return { likes: review.likes };

  try {
    const updated = await prisma.reviews.update({
      where: { id: reviewId },
      data: { likes: { increment: 1 } },
      select: { likes: true },
    });
    return { likes: updated.likes };
  } catch (err) {
    // Not counted, so let them try again.
    await redis.srem(votersKey(reviewId), userId);
    throw err;
  }
}

/** Which of the salon's listed reviews the customer has already marked helpful. */
export async function helpfulReviewIds(userId: string, businessId: string): Promise<string[]> {
  const listed = await prisma.reviews.findMany({
    where: { businessId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: MAX_LISTED_REVIEWS,
    select: { id: true },
  });
  if (listed.length === 0) return [];
  const pipeline = redis.pipeline();
  for (const { id } of listed) pipeline.sismember(votersKey(id), userId);
  const results = (await pipeline.exec()) ?? [];
  return listed.filter((_, i) => results[i]?.[1] === 1).map((r) => r.id);
}

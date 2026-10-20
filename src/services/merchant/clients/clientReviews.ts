import prisma from "../../../lib/prisma/prisma";
import { reviewReplyEmail } from "../../../emails";
import { sendEmailInBackground } from "../../../lib/emailEngine/sendgrid";
import { AppError } from "../../../middlewares/centralAppError";
import { requireMerchantBusiness } from "../merchantBusiness";
import { ownClient } from "./clientQueries";

// A client's reviews of the owner's salons, and the salon's reply. Reviews
// belong to the customer's KHS account, matched to the client record by email
// (the old page looked them up by the record's own id, which reviews never
// carry, so a client's real reviews never showed).

const SELECT = {
  id: true, rating: true, comment: true, reply: true, replyTime: true, replyBy: true, likes: true, clientName: true, service: true,
  clientType: true, createdAt: true, staffRating: true,
} as const;

async function customerIds(email: string): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  return users.map((u) => u.id);
}

async function ownerBusinessIds(ownerId: string): Promise<string[]> {
  return (await prisma.businesses.findMany({ where: { owner_id: ownerId }, select: { id: true } })).map((b) => b.id);
}

const view = (r: Awaited<ReturnType<typeof listRows>>[number]) => ({ ...r, rating: Number(r.rating), staffRating: r.staffRating === null ? null : Number(r.staffRating) });

function listRows(clientIds: string[], businessIds: string[]) {
  return prisma.reviews.findMany({
    where: { clientId: { in: clientIds }, businessId: { in: businessIds } },
    select: SELECT,
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function clientReviews(userId: string, clientId: string) {
  const business = await requireMerchantBusiness(userId);
  const client = await ownClient(business.ownerId, clientId);
  const [ids, businessIds] = await Promise.all([customerIds(client.email), ownerBusinessIds(business.ownerId)]);
  if (ids.length === 0) return [];
  const rows = await listRows(ids, businessIds);
  // Ones still waiting for a reply first.
  return rows.map(view).sort((a, b) => Number(!!a.reply) - Number(!!b.reply));
}

/** The salon's reply to one of this client's reviews (once), and an email telling them. */
export async function replyToReview(userId: string, clientId: string, reviewId: string, reply: string) {
  const business = await requireMerchantBusiness(userId);
  const client = await ownClient(business.ownerId, clientId);
  const [ids, businessIds] = await Promise.all([customerIds(client.email), ownerBusinessIds(business.ownerId)]);
  const owner = await prisma.user.findUnique({ where: { id: business.ownerId }, select: { firstName: true, surname: true } });
  const replyBy = `${owner?.firstName ?? ""} ${owner?.surname ?? ""}`.trim() || business.businessName;

  const updated = await prisma.reviews.updateMany({
    where: { id: reviewId, clientId: { in: ids }, businessId: { in: businessIds }, reply: null },
    data: { reply, replyBy, replyTime: new Date(), updatedAt: new Date() },
  });
  if (updated.count === 0) {
    const exists = await prisma.reviews.findFirst({ where: { id: reviewId, clientId: { in: ids }, businessId: { in: businessIds } }, select: { id: true } });
    if (!exists) throw AppError.notFound("Review");
    throw AppError.conflict("This review already has a reply.", "ALREADY_REPLIED");
  }
  const review = await prisma.reviews.findUniqueOrThrow({ where: { id: reviewId }, select: SELECT });
  sendEmailInBackground({ to: client.email, ...reviewReplyEmail({ businessName: business.businessName, clientName: client.firstName, comment: review.comment, reply }) });
  return view(review);
}

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../entities/review.entity';
import { ApiResponse } from '../types/client.types';
import { ClientSchema } from '../entities/client.entity';
import { Business } from '../entities/business.entity';
import { ReviewResponseDto } from '../dtos/requests/ReviewDto';
import { User } from 'src/all_user_entities/user.entity';
import { EmailService } from 'src/email/email.service';
import { TemplateService } from 'src/email/template.service';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,

    @InjectRepository(ClientSchema)
    private readonly clientRepo: Repository<ClientSchema>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,

    private readonly emailService: EmailService,
    private readonly templateService: TemplateService,
  ) {}

  async clientReviewList(
    ownerId: string,
    clientId: string,
  ): Promise<ApiResponse<any>> {
    try {
      // const business = await this.businessRepo.findOne({
      //   where: { owner: { id: ownerId } },
      // });
      // if (!business) {
      //   return {
      //     success: false,
      //     error: 'Business not found',
      //     message: 'No business found for this user',
      //   };
      // }

      // if (!id) {
      //   return {
      //     success: false,
      //     error: 'Settings ID required',
      //     message: 'Settings ID required',
      //   };
      // }

      // Verify client belongs to owner

      const client = await this.clientRepo.findOne({
        where: {
          id: clientId,
          ownerId: ownerId,
          isActive: true,
        },
      });

      if (!client) {
        return {
          success: false,
          error: 'Client not found',
          message: 'Client not found or access denied',
        };
      }

      const clientReviews = await this.reviewRepo
        .createQueryBuilder('review')
        .where('review.clientId = :clientId', { clientId })
        .andWhere('review.ownerId = :ownerId', { ownerId })
        .orderBy('CASE WHEN review.reply IS NULL THEN 0 ELSE 1 END', 'ASC') // null replies first
        .addOrderBy('review.replyTime', 'DESC') // latest reply first
        .addOrderBy('review.createdAt', 'DESC') // fallback order
        .getMany();

      if (clientReviews.length === 0) {
        return {
          success: true,
          data: null,
          message: 'Client has no reviews yet',
        };
      }

      return {
        success: true,
        data: clientReviews,
        message: 'Client reviews retrieved successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch client reviews',
      };
    }
  }

  async clientReviewDetails(
    ownerId: string,
    clientId: string,
    reviewId: string,
  ): Promise<ApiResponse<any>> {
    try {
      // const business = await this.businessRepo.findOne({
      //   where: { owner: { id: ownerId } },
      // });
      // if (!business) {
      //   return {
      //     success: false,
      //     error: 'Business not found',
      //     message: 'No business found for this user',
      //   };
      // }

      // if (!id) {
      //   return {
      //     success: false,
      //     error: 'Settings ID required',
      //     message: 'Settings ID required',
      //   };
      // }

      // Verify client belongs to owner

      const client = await this.clientRepo.findOne({
        where: {
          id: clientId,
          ownerId: ownerId,
          isActive: true,
        },
      });

      if (!client) {
        return {
          success: false,
          error: 'Client not found',
          message: 'Client not found or access denied',
        };
      }

      const clientReview = await this.reviewRepo.findOne({
        where: { id: reviewId, clientId, ownerId },
      });

      if (!clientReview) {
        return {
          success: false,
          error: 'Client review not found',
          message: 'Client review does not exists',
        };
      }

      return {
        success: true,
        data: clientReview,
        message: 'Client review details retrieved successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch client review',
      };
    }
  }

  async getMonthlySatisfaction(
  ownerId: string,
  businessId?: string | null,
): Promise<ApiResponse<any>> {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const qb = this.reviewRepo
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'average')
      .addSelect('COUNT(review.id)', 'count')
      .where('review.ownerId = :ownerId', { ownerId })
      .andWhere('review.createdAt >= :start', { start })
      .andWhere('review.createdAt < :end', { end });

    if (businessId) {
      qb.andWhere('review.businessId = :businessId', { businessId });
    }

    const result = await qb.getRawOne();

    const count = Number(result?.count || 0);
    const rawAverage = Number(result?.average || 0);
    const average = count > 0 ? Number(rawAverage.toFixed(1)) : 0;

    return {
      success: true,
      data: {
        average,
        count,
        percent: count > 0 ? Math.round((average / 5) * 100) : 0,
      },
      message: 'Monthly client satisfaction retrieved',
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      message: 'Failed to fetch monthly satisfaction',
    };
  }
}

  async reviewResponse(
    ownerId: string,
    clientId: string,
    reviewId: string,
    reviewResponseDto: ReviewResponseDto,
  ): Promise<ApiResponse<any>> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: ownerId },
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
          message: 'User not found or access denied',
        };
      }

      // 1️⃣ Validate client exists
      const client = await this.clientRepo.findOne({
        where: {
          id: clientId,
          ownerId: ownerId,
          isActive: true,
        },
      });

      if (!client) {
        return {
          success: false,
          error: 'Client not found',
          message: 'Client not found or access denied',
        };
      }

      // 2️⃣ Find the review
      const clientReview = await this.reviewRepo.findOne({
        where: { id: reviewId, clientId, ownerId },
      });

      if (!clientReview) {
        return {
          success: false,
          error: 'Client review not found',
          message: 'Client review does not exist',
        };
      }

      // 3️⃣ Update review with reply data
      clientReview.reply = reviewResponseDto.reply;
      clientReview.replyBy = user.surname + ' ' + user.firstName;
      clientReview.replyTime = new Date() || null;

      // 4️⃣ Save the updated review
      await this.reviewRepo.save(clientReview);

      const business = await this.businessRepo.findOne({
        where: { id: clientReview.businessId ?? undefined },
      });

      const emailData = {
        clientEmail: client.email,
        clientName: client.firstName + ' ' + client.lastName,
        businessName: business?.businessName ?? 'Kinky Hairstylist',
        message: clientReview.comment,
      };

      await this.sendReviewNotificationMail(emailData);

      return {
        success: true,
        data: clientReview,
        message: 'Client review updated with response successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to submit response to this review',
      };
    }
  }

  // Batch existence check — lets a caller (e.g. the booking list/details
  // endpoints) know which of these orderIds already have a review, so the
  // "Review" action can be hidden/disabled instead of allowing a second
  // review of the same completed booking.
  async getReviewedOrderIds(orderIds: string[]): Promise<Set<string>> {
    if (orderIds.length === 0) return new Set();
    const rows = await this.reviewRepo
      .createQueryBuilder('review')
      .select('DISTINCT review.orderId', 'orderId')
      .where('review.orderId IN (:...orderIds)', { orderIds })
      .getRawMany();
    return new Set(rows.map((r) => r.orderId));
  }

  async createReview(payload: any): Promise<ApiResponse<any>> {
    try {
      // A booking can only be reviewed once — nothing enforced this
      // before (no existence check on either layer), so the same
      // completed booking could be rated repeatedly.
      if (payload.orderId) {
        const existing = await this.reviewRepo.findOne({
          where: { orderId: payload.orderId },
        });
        if (existing) {
          return {
            success: false,
            error: 'Already reviewed',
            message: 'You have already reviewed this booking',
          };
        }
      }

      const review = this.reviewRepo.create(payload as Review);
      const newReview = await this.reviewRepo.save(review);

      if (newReview.businessId) {
        await this.recomputeBusinessPerformance(newReview.businessId);
      }

      return {
        success: true,
        data: newReview,
        message: 'Client review created successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to create client review',
      };
    }
  }

  // business.performance.rating/.reviews previously just sat at whatever
  // was seeded and never actually reflected real reviews — recompute both
  // from the reviews table itself every time a new one is created, so the
  // salon-listing/detail-page star rating stays true rather than stale.
  private async recomputeBusinessPerformance(businessId: string): Promise<void> {
    const { average, count } = await this.reviewRepo
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'average')
      .addSelect('COUNT(review.id)', 'count')
      .where('review.businessId = :businessId', { businessId })
      .getRawOne();

    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business) return;

    business.performance = {
      ...business.performance,
      rating: Math.round(Number(average) * 10) / 10,
      reviews: Number(count),
    };
    await this.businessRepo.save(business);
  }

  //   EMAILS
  // Uses the same shared communication-bulk template every other
  // business-to-client message on the platform uses (see
  // communication.service.ts's sendDirectMessageEmail), instead of
  // building its own raw HTML string. Message content/semantics kept
  // exactly as they were — data.message is the client's original review
  // comment, not the merchant's reply text, which looks like a
  // pre-existing content bug but is out of scope here (flagged
  // separately, not fixed as part of this template swap).
  private async sendReviewNotificationMail(data: any): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
    const html = this.templateService.render('communication-bulk', {
      businessName: data.businessName ?? 'Kinky Hairstylist',
      subject: "We've Responded to Your Review",
      clientName: data.clientName ?? 'Valued Client',
      message: `We've responded to your review:\n\n"${data.message}"\n\nPlease visit our platform to view our full response.`,
      closingRemarks: data.closingRemarks ?? null,
      frontendUrl,
      year: new Date().getFullYear(),
    });
    const text = `We've responded to your review: "${data.message}". Please visit our platform to view our full response.`;

    this.emailService.sendEmail(
      data.clientEmail,
      "We've Responded to Your Review",
      text,
      html,
    );
  }
}

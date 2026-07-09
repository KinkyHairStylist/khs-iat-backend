import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../entities/review.entity';
import { ApiResponse } from '../types/client.types';
import { ClientSchema } from '../entities/client.entity';
import { ReviewResponseDto } from '../dtos/requests/ReviewDto';
import { User } from 'src/all_user_entities/user.entity';
import sgMail from '@sendgrid/mail';

@Injectable()
export class ReviewService {
  private fromEmail: string;
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,

    @InjectRepository(ClientSchema)
    private readonly clientRepo: Repository<ClientSchema>,

    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      throw new Error('SENDGRID_API_KEY and SENDGRID_FROM_EMAIL must be set');
    }

    sgMail.setApiKey(apiKey);
    this.fromEmail = fromEmail;
  }

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
      console.log('Get clients review error:', error);
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
      console.log('Get client review details error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch client review',
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

      const emailData = {
        clientEmail: client.email,
        clientName: client.firstName + ' ' + client.lastName,
        message: clientReview.comment,
      };

      await this.sendReviewNotificationMail(emailData);

      return {
        success: true,
        data: clientReview,
        message: 'Client review updated with response successfully',
      };
    } catch (error) {
      console.log('submit review response error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to submit response to this review',
      };
    }
  }

  async createReview(payload: any): Promise<ApiResponse<any>> {
    try {
      const review = this.reviewRepo.create(payload);
      const newReview = await this.reviewRepo.save(review);

      return {
        success: true,
        data: newReview,
        message: 'Client review created successfully',
      };
    } catch (error) {
      console.log('Create client review error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create client review',
      };
    }
  }

  async clearAllReviews() {
    try {
      const count = await this.reviewRepo.count(); // total reviews before deletion
      if (count === 0) {
        return { message: 'No reviews to delete', deleted: 0 };
      }

      await this.reviewRepo.clear(); // delete all rows
      return { message: '✅ All reviews deleted successfully', deleted: count };
    } catch (err) {
      console.error('Failed to delete reviews:', err);
      throw new HttpException(
        'Failed to delete reviews',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  //   EMAILS
  private async sendReviewNotificationMail(data: any): Promise<void> {
    const emailText = `Dear ${data.clientName ?? 'Valued Client'},

Thank you for taking the time to share your feedback with us.

Your Review:
"${data.message}"

We have responded to your review on our platform. Please log in to view our complete response and continue the conversation.

We value your feedback and look forward to serving you better.

${data.closingRemarks ?? 'Best regards,'}
Kinky Hair Stylist Team`;

    const msg = {
      to: data.clientEmail,
      from: this.fromEmail,
      subject: `We've Responded to Your Review`,
      text: emailText,
      html: `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px;">
      <p>Dear <strong>${data.clientName ?? 'Valued Client'}</strong>,</p>
      
      <p>We've responded to your review:</p>
      
      <blockquote style="background: #f5f5f5; border-left: 3px solid #007bff; margin: 15px 0; padding: 12px 15px; font-style: italic;">
        "${data.message}"
      </blockquote>
      
      <p><strong>Please visit our platform to view our response.</strong></p>
      
      <p>
        ${data.closingRemarks ?? 'Thank you,'}<br>
        Kinky Hair Stylist
      </p>
    </div>
  `,
    };

    const [response] = await sgMail.send(msg);
    // console.log('SendGrid Response Status:', response.statusCode);
    // console.log('SendGrid Headers:', response.headers);
  }
}

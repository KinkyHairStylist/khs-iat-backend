import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ReviewService } from '../services/review.service';
import { ReviewResponseDto } from '../dtos/requests/ReviewDto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';

@ApiTags('Business Promotion Message')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Business, Role.SuperAdmin)
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get('/client/:clientId')
  async getClientReviews(@Request() req, @Param('clientId') clientId: string) {
    const ownerId = req.user.sub || req.user.userId;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.reviewService.clientReviewList(ownerId, clientId);

    return result;
  }

  @Get('/client/details/:clientId/:reviewId')
  async getClientReviewDetails(
    @Request() req,
    @Param('clientId') clientId: string,
    @Param('reviewId') reviewId: string,
  ) {
    const ownerId = req.user.sub || req.user.userId;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.reviewService.clientReviewDetails(
      ownerId,
      clientId,
      reviewId,
    );

    return result;
  }

  @Patch('/client/review-response/:clientId/:reviewId')
  async submitReviewResponse(
    @Request() req,
    @Body() reviewResponseDto: ReviewResponseDto,
    @Param('clientId') clientId: string,
    @Param('reviewId') reviewId: string,
  ) {
    const ownerId = req.user.sub || req.user.userId;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.reviewService.reviewResponse(
      ownerId,
      clientId,
      reviewId,
      reviewResponseDto,
    );

    return result;
  }

  @Post()
  async createReview(@Request() req, @Body() payload) {
    const result = await this.reviewService.createReview(payload);

    return result;
  }
}

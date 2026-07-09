import { Controller, Get, Param, Patch, Delete, Body, UseGuards, Post } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { ModerationSettings } from './entities/moderation-settings.entity';
import {
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';

@ApiTags('Admin Moderation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.SuperAdmin)
@Controller('admin/moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  // 1️⃣ Get all flagged content
  @Get('stats')
  async getReportStats() {
    const stats = await this.moderationService.getReportStats();

    return {
      message: 'Report statistics retrieved successfully',
      data: stats,
    };
  }

  @Get('flagged')
  getFlaggedContent() {
    return this.moderationService.getFlaggedContent();
  }

  @Post('report')
  async createReport(@Body() body: any) {
    return this.moderationService.createReport(body);
  }


  // 2️⃣ Get all user reviews
  @Get('reviews')
  getAllUserReviews() {
    return this.moderationService.getAllUserReviews();
  }

  // 3️⃣ Approve review
  @Patch('reviews/:id/approve')
  approveReview(@Param('id') id: string) {
    return this.moderationService.approveReview(id);
  }




  // 4️⃣ Reject review
  @Patch('reviews/:id/reject')
  rejectReview(@Param('id') id: string) {
    return this.moderationService.rejectReview(id);
  }

  // 5️⃣ Remove inappropriate content
  @Delete('flagged/:id')
  removeInappropriateContent(@Param('id') id: string) {
    return this.moderationService.removeInappropriateContent(id);
  }

  // 6️⃣ Get moderation settings
  @Get('settings')
  getSettings() {
    return this.moderationService.getSettings();
  }

  // 7️⃣ Update moderation settings
  @Patch('settings')
  updateSettings(@Body() body: Partial<ModerationSettings>) {
    return this.moderationService.updateSettings(body);
  }
}

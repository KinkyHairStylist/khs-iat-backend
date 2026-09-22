import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Delete,
  Request,
  UseGuards,
} from '@nestjs/common';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';

@ApiTags('Google Calendar')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Merchant)
@Controller('google-calendar')
export class GoogleCalendarController {
  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  /**
   * GET /google-calendar/connect/:businessId
   * Returns the Google sign-in URL for the merchant to authorise.
   */
  @Get('connect/:businessId')
  async initateConnection(
    @Request() req,
    @Param('businessId') businessId: string,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;
      const authUrl = await this.googleCalendarService.getAuthUrl(businessId, ownerId);
      return {
        success: true,
        data: authUrl,
        message: 'Google authentication url sent',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to generate google authentication url',
      };
    }
  }

  /**
   * POST /google-calendar/callback?code=xxx&state=xxx
   * Finish the OAuth hand-off. `state` is the signed value from the connect URL.
   */
  @Post('callback')
  async handleCallback(
    @Request() req,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;
      await this.googleCalendarService.handleOAuthCallback(code, state, ownerId);
      return {
        success: true,
        message: 'Google Calendar connected successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to connect Google Calendar',
      };
    }
  }

  /**
   * DELETE /google-calendar/disconnect/:businessId
   */
  @Delete('disconnect/:businessId')
  async disconnect(@Request() req, @Param('businessId') businessId: string) {
    try {
      const ownerId = req.user.id || req.user.sub;
      await this.googleCalendarService.disconnect(ownerId, businessId);
      return {
        success: true,
        message: 'Google Calendar disconnected successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to disconnect Google Calendar',
      };
    }
  }
}

import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Delete,
  Request,
  HttpException,
  HttpStatus,
  Body,
  UseGuards,
} from '@nestjs/common';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { UpdateBusinessOwnerSettingsDto } from 'src/business/dtos/requests/BusinessOwnerSettingsDto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';

@ApiTags('Google Calendar')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Business, Role.SuperAdmin)
@Controller('google-calendar')
export class GoogleCalendarController {
  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  /**
   * GET /google-calendar/auth
   * Returns authorization URL for business to connect
   */
  @Get('connect/:businessId')
  async initateConnection(
    @Request() req,
    @Param('businessId') businessId: string,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const authUrl = this.googleCalendarService.getAuthUrl(businessId);
      return {
        success: true,
        data: authUrl,
        message: 'Google authentication url sent',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message:
          error.message || 'Failed to generate google authentication url',
      };
    }
  }

  /*
   * GET /google-calendar/callback?code=xxx&businessId=xxx
   * Handle OAuth callback from Google
   */
  @Post('callback')
  async handleCallback(
    @Request() req,
    @Query('code') code: string,
    @Query('state') businessId: string, // Pass businessId as state parameter
    @Body() updateDto: UpdateBusinessOwnerSettingsDto,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const result = await this.googleCalendarService.handleOAuthCallback(
        code,
        businessId,
        ownerId,
        updateDto,
      );

      return {
        success: true,
        data: result,
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
   * POST /google-calendar/sync/:appointmentId
   * Manually sync an appointment to Google Calendar
   */
  @Post('sync/:appointmentId')
  async syncAppointment(@Param('appointmentId') appointmentId: string) {
    const eventId =
      await this.googleCalendarService.createCalendarEvent(appointmentId);
    return { message: 'Appointment synced to Google Calendar', eventId };
  }

  /**
   * DELETE /google-calendar/disconnect/:businessId
   * Disconnect Google Calendar integration
   */
  @Delete('disconnect/:businessId')
  async disconnect(
    @Request() req,
    @Param('businessId') businessId: string,
    @Body() updateDto: UpdateBusinessOwnerSettingsDto,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const result = await this.googleCalendarService.disconnect(
        ownerId,
        businessId,
        updateDto,
      );

      return {
        success: true,
        data: result,
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

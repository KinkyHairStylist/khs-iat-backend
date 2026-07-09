import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ZohoBooksService } from '../services/zohobooks.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';
import { UpdateBusinessOwnerSettingsDto } from 'src/business/dtos/requests/BusinessOwnerSettingsDto';

@ApiTags('ZohoBooks')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Business, Role.SuperAdmin)
@Controller('zohobooks')
export class ZohoBooksController {
  constructor(private readonly zohoBooksService: ZohoBooksService) {}

  /**
   * GET /api/zohobooks/connect/:businessId
   * Generate ZohoBooks authorization URL
   */
  @Get('connect/:businessId')
  connectZohoBooks(@Request() req, @Param('businessId') businessId: string) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const authUrl = this.zohoBooksService.getAuthUrl(businessId);

      return {
        success: true,
        data: authUrl,
        message: 'ZohoBooks authentication url sent',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to generate zohobooks url',
      };
    }
  }

  /**
   * POST /api/zohobooks/callback?code=xxx&state=businessId
   * Handle OAuth callback from ZohoBooks
   */
  @Post('callback')
  async handleCallback(
    @Request() req,
    @Query('code') code: string,
    @Query('state') businessId: string,
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

      const result = await this.zohoBooksService.handleOAuthCallback(
        code,
        businessId,
        ownerId,
        updateDto,
      );

      return {
        success: true,
        data: result,
        message: 'Zohobooks connected successfully',
      };
    } catch (error) {
      console.error('ZohoBooks OAuth error:', error);

      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to connect zohobooks',
      };
    }
  }

  /**
   * GET /api/zohobooks/status/:businessId
   * Check connection status
   */
  @Get('status/:businessId')
  async getStatus(@Param('businessId') businessId: string) {
    const isConnected = await this.zohoBooksService.isConnected(businessId);
    return {
      connected: isConnected,
      service: 'zohobooks',
    };
  }

  /**
   * POST /api/zohobooks/invoice/:appointmentId
   * Create invoice for appointment
   */
  @Post('invoice/:appointmentId')
  async createInvoice(
    @Request() req,
    @Param('appointmentId') appointmentId: string,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const invoiceId =
        await this.zohoBooksService.createInvoice(appointmentId);
      return {
        success: true,
        data: invoiceId,
        message: 'Invoice created in ZohoBooks',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to create invoice',
      };
    }
  }

  /**
   * POST /api/zohobooks/payment/:appointmentId/:invoiceId
   * Record payment for invoice
   */
  @Post('payment/:appointmentId/:invoiceId')
  async recordPayment(
    @Param('appointmentId') appointmentId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    await this.zohoBooksService.recordPayment(appointmentId, invoiceId);
    return {
      success: true,
      message: 'Payment recorded in ZohoBooks',
    };
  }

  /**
   * DELETE /api/zohobooks/disconnect/:businessId
   * Disconnect ZohoBooks integration
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

      await this.zohoBooksService.disconnect(businessId, ownerId, updateDto);
      return {
        success: true,
        message: 'ZohoBooks disconnected successfully',
      };
    } catch (error) {
      console.error('ZohoBooks OAuth error:', error);

      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to disconnect zohobooks',
      };
    }
  }
}

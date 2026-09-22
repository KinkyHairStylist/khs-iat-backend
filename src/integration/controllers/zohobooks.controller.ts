import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ZohoBooksService } from '../services/zohobooks.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';

@ApiTags('ZohoBooks')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Merchant)
@Controller('zohobooks')
export class ZohoBooksController {
  constructor(private readonly zohoBooksService: ZohoBooksService) {}

  /**
   * GET /zohobooks/connect/:businessId
   * Returns the Zoho sign-in URL for the merchant to authorise.
   */
  @Get('connect/:businessId')
  async connectZohoBooks(
    @Request() req,
    @Param('businessId') businessId: string,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;
      const authUrl = await this.zohoBooksService.getAuthUrl(businessId, ownerId);
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
   * POST /zohobooks/callback?code=xxx&state=xxx&accounts-server=https://accounts.zoho.eu
   * Finish the OAuth hand-off. `state` is the signed value from the connect URL;
   * `accounts-server` is the Zoho region Zoho reports on the redirect.
   */
  @Post('callback')
  async handleCallback(
    @Request() req,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('accounts-server') accountsServer?: string,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;
      await this.zohoBooksService.handleOAuthCallback(
        code,
        state,
        ownerId,
        accountsServer,
      );
      return {
        success: true,
        message: 'Zohobooks connected successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to connect zohobooks',
      };
    }
  }

  /**
   * DELETE /zohobooks/disconnect/:businessId
   */
  @Delete('disconnect/:businessId')
  async disconnect(@Request() req, @Param('businessId') businessId: string) {
    try {
      const ownerId = req.user.id || req.user.sub;
      await this.zohoBooksService.disconnect(ownerId, businessId);
      return {
        success: true,
        message: 'ZohoBooks disconnected successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to disconnect zohobooks',
      };
    }
  }
}

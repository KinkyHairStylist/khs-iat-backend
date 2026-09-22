import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MailchimpService } from '../services/mailchimp.service';
import { ConnectMailchimpDto } from '../dtos/connect-mailchimp.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';

@ApiTags('MailChimp')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Merchant)
@Controller('mailchimp')
export class MailchimpController {
  constructor(private readonly mailchimpService: MailchimpService) {}

  /**
   * POST /mailchimp/connect/:businessId
   * Body: { apiKey, audienceId? }. With several audiences and none chosen, the
   * response lists them (needsAudience) so the merchant can pick one.
   */
  @Post('connect/:businessId')
  async connect(
    @Request() req,
    @Param('businessId') businessId: string,
    @Body() body: ConnectMailchimpDto,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;
      const result = await this.mailchimpService.connect(ownerId, businessId, body);

      if (!result.connected) {
        return {
          success: true,
          needsAudience: true,
          data: result.audiences,
          message: 'Choose the audience to sync your clients to',
        };
      }
      return {
        success: true,
        data: { audienceName: result.audienceName },
        message: `Mailchimp connected. Clients will be added to "${result.audienceName}".`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to connect Mailchimp',
      };
    }
  }

  /**
   * DELETE /mailchimp/disconnect/:businessId
   */
  @Delete('disconnect/:businessId')
  async disconnect(@Request() req, @Param('businessId') businessId: string) {
    try {
      const ownerId = req.user.id || req.user.sub;
      await this.mailchimpService.disconnect(ownerId, businessId);
      return {
        success: true,
        message: 'Mailchimp disconnected successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to disconnect Mailchimp',
      };
    }
  }
}

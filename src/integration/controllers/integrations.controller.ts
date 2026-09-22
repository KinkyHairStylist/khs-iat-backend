import { Controller, Get, NotFoundException, Request, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';
import { Business } from 'src/business/entities/business.entity';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { MailchimpService } from '../services/mailchimp.service';
import { ZohoBooksService } from '../services/zohobooks.service';

@ApiTags('Integrations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Merchant)
@Controller('integrations')
export class IntegrationsController {
  constructor(
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly google: GoogleCalendarService,
    private readonly mailchimp: MailchimpService,
    private readonly zoho: ZohoBooksService,
  ) {}

  /**
   * GET /integrations/status
   * What is really connected for the signed-in merchant's salon, read from the
   * stored credentials rather than from a saved switch that could drift.
   */
  @Get('status')
  async status(@Request() req) {
    const ownerId = req.user.id || req.user.sub;
    const business = await this.businessRepo.findOne({ where: { ownerId } });
    if (!business) throw new NotFoundException('No salon found for this account.');

    const [googleCalendar, mailChimp, zohoBooks] = await Promise.all([
      this.google.isConnected(business.id),
      this.mailchimp.isConnected(business.id),
      this.zoho.isConnected(business.id),
    ]);

    return {
      success: true,
      data: { businessId: business.id, googleCalendar, mailChimp, zohoBooks },
      message: 'Integration status fetched',
    };
  }
}

import {
  UseGuards,
  Controller,
  Get,
  Body,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { GiftcardService } from './admin_giftcard.service';
import { RefundGiftCardDto } from './dto/create-giftcard.dto';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';
import { describeActor } from 'src/business/utils/gift-card-deactivation';

@ApiTags('Admin Gift Card')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Staff)
@Controller('/admin/giftcards')
export class GiftcardController {
  constructor(private readonly giftcardService: GiftcardService) {}

  @Get()
  async findAll() {
    return await this.giftcardService.findAll();
  }

  @Get('summary')
  async getSummary() {
    return await this.giftcardService.getSummary();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.giftcardService.findOne(id);
  }

  @Patch(':id/deactivate')
  async deactivate(@Param('id') id: string, @Body() body: RefundGiftCardDto, @Req() req: { user?: any }) {
    return await this.giftcardService.deactivateGiftCard(id, body.reason, describeActor(req.user));
  }

  @Patch(':id/reactivate')
  async reactivate(@Param('id') id: string, @Req() req: { user?: any }) {
    return await this.giftcardService.reactivateGiftCard(id, describeActor(req.user));
  }

  // Restores a sold card's balance to its full value. There is no amount to send: the server never
  // lets a balance go above what the card was worth. (:amount is ignored; the old refund route is
  // kept so anything still calling it doesn't break.)
  @Patch([':id/restore-balance', ':id/refund/:amount'])
  async restoreBalance(
    @Param('id') id: string,
    @Body() body: RefundGiftCardDto,
    @Req() req: { user?: { email?: string } },
  ) {
    return await this.giftcardService.restoreBalance(id, body.reason, req.user?.email);
  }

  @Get(':id/usage')
  async getUsageHistory(@Param('id') id: string) {
    return await this.giftcardService.getUsageHistory(id);
  }
}

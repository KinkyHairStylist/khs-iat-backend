import {
  UseGuards,
  Controller,
  Get,
  Body,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { GiftcardService } from './admin_giftcard.service';
import { RefundGiftCardDto } from './dto/create-giftcard.dto';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';

@ApiTags('Admin Gift Card')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.SuperAdmin)
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
  async deactivate(@Param('id') id: string, @Body() body: RefundGiftCardDto) {
    return await this.giftcardService.deactivateGiftCard(id, body.reason);
  }

  @Patch(':id/refund/:amount')
  async refund(
    @Param('id') id: string,
    @Param('amount') amount: string,
    @Body() body: RefundGiftCardDto,
  ) {
    return await this.giftcardService.refundGiftCard(
      id,
      parseFloat(amount),
      body.reason,
    );
  }

  @Get(':id/usage')
  async getUsageHistory(@Param('id') id: string) {
    return await this.giftcardService.getUsageHistory(id);
  }

  @Delete('delete-all')
  async deleteAll() {
    return this.giftcardService.deleteAllGiftCards();
  }
}

import { Controller, Get, Param, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';
import { WithdrawalService } from './withdrawal.service';
import { MarkWithdrawalPaidDto, RejectWithdrawalDto } from './dto/withdrawal-decision.dto';

@ApiTags('Admin Withdrawals')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Staff)
@Controller('/admin/withdrawals')
export class WithdrawalController {
  constructor(private readonly withdrawalService: WithdrawalService) {}

  @Get()
  async getAll() {
    return this.withdrawalService.findAll();
  }

  // Waiting for a decision.
  @Get('pending')
  async getPending() {
    return this.withdrawalService.getPending();
  }

  // Waiting for KHS to act: to review, or approved and still to be paid.
  @Get('open')
  async getOpen() {
    return this.withdrawalService.getOpen();
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.withdrawalService.findOne(id);
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string) {
    return this.withdrawalService.approve(id);
  }

  // KHS has sent the money; the reference is how to trace the transfer.
  @Patch(':id/paid')
  async markPaid(@Param('id') id: string, @Body() dto: MarkWithdrawalPaidDto) {
    return this.withdrawalService.markPaid(id, dto.reference);
  }

  @Patch(':id/reject')
  async reject(@Param('id') id: string, @Body() dto: RejectWithdrawalDto) {
    return this.withdrawalService.reject(id, dto.reason);
  }
}

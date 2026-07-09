import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { WalletService } from './wallet.service';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';
import { TopEarningsQueryDto, TopEarningsResponseDto, DashboardResponseDto } from './dto/top-earnings-query.dto';

@ApiTags('Admin All Transactions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.SuperAdmin)
@Controller('/admin/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('transactions')
  async getAllWalletTransactions() {
    return this.walletService.getAllWalletTransactions();
  }

  @Get('top-earnings')
  async getTopEarnings(
    @Query() query: TopEarningsQueryDto,
  ): Promise<TopEarningsResponseDto[]> {
    return this.walletService.getTopEarningBusinesses();
  }

  @Get('summary')
  async getSummary(): Promise<DashboardResponseDto> {
    return this.walletService.getDashboardSummary();
  }
}

import { Controller, Get, Patch, UseGuards, Req, Body } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';

import { GetUser } from 'src/middleware/get-user.decorator';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';
import { TransactionFeeService } from './transaction-fee.service';
import { UpdateTransactionFeeDto } from './dto/update-transaction-fee.dto';
import { User } from 'src/all_user_entities/user.entity';

@ApiTags('Admin All Transactions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.SuperAdmin)
@Controller('admin/transaction-fee')
export class TransactionFeeController {
  constructor(private readonly feeService: TransactionFeeService) {}

  // Get current transaction fee settings
  @Get()
  async getCurrentConfig() {
    return this.feeService.getCurrentConfig();
  }

  // Update transaction fee configuration
  @Patch()
  async updateConfig(
    @Body() dto: UpdateTransactionFeeDto,
    @GetUser() user: User, // directly inject authenticated user
  ) {
    return this.feeService.updateConfig(dto, user.id); // pass user ID to service
  }

  // Get transaction fee change history
  @Get('history')
  async getChangeHistory() {
    return this.feeService.getChangeHistory();
  }
}

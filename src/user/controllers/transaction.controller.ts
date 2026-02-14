import { Controller, Get, Post, Body, Query, UseGuards, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { GetUser } from 'src/middleware/get-user.decorator';
import { User } from 'src/all_user_entities/user.entity';
import { TransactionService } from '../services/transaction.service';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';
import { GetTransactionSummaryDto, RequestRefundDto } from '../dtos/transaction.dto';

@ApiTags('User Transactions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Roles(Role.Client)
@Controller('users/transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  @ApiOperation({ summary: 'Get customer all transactions' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Transactions retrieved successfully' })
  async getUserTransactions(@GetUser() user: User) {
    return {
      success: true,
      data: await this.transactionService.getUserTransactions(user),
    };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get customer transaction summary (Total Spent Amount, successful payments count, total refund amount, current Year)' })
  @ApiQuery({ name: 'year', required: false, description: 'Year for summary (defaults to current year)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Transaction summary retrieved successfully' })
  async getTransactionSummary(
    @GetUser() user: User,
    @Query() query: GetTransactionSummaryDto,
  ) {
    const summary = await this.transactionService.getUserTransactionSummary(user, query.year);
    return {
      success: true,
      data: summary,
    };
  }

  @Post('refund')
  @ApiOperation({ summary: 'Request for a refund' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Refund request submitted successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Refund request failed' })
  async requestRefund(
    @GetUser() user: User,
    @Body() dto: RequestRefundDto,
  ) {
    const result = await this.transactionService.requestRefund(
      user,
      dto.transactionId,
      dto.reason,
      {
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        accountHolderName: dto.accountHolderName,
        routingNumber: dto.routingNumber,
        bankAddress: dto.bankAddress,
        swiftCode: dto.swiftCode,
      },
    );

    const statusCode = result.success ? HttpStatus.OK : HttpStatus.BAD_REQUEST;

    return {
      success: result.success,
      message: result.message,
      statusCode,
    };
  }
}

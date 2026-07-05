import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  AddPaymentMethodDto,
  AddTransactionDto,
  CreateWalletDto,
  DebitWalletRequestDto,
  TransactionFiltersDto,
} from '../dtos/requests/WalletDto';
import { BusinessWalletService } from '../services/wallet.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';

@ApiTags('Business Wallet')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Merchant, Role.Staff)
@Controller('business-wallet')
export class BusinessWalletController {
  constructor(private readonly walletService: BusinessWalletService) {}

  @Post('/wallet')
  async createWallet(
    @Request() req,
    @Body() createWalletData: CreateWalletDto,
  ) {
    const ownerId = req.user.id || req.user.sub;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result =
      await this.walletService.createWalletForBusiness(createWalletData);

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Get('/wallet')
  async getWalletByOwnerId(@Request() req) {
    const ownerId = req.user.id || req.user.sub;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.walletService.getWalletByOwnerId(ownerId);

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Post('/add-payment-method')
  async addPaymentMethod(
    @Request() req,
    @Body() paymentMethodData: AddPaymentMethodDto,
  ) {
    const ownerId = req.user.id || req.user.sub;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.walletService.addPaymentMethod(paymentMethodData);

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Get('/payment-method-list/:walletId')
  async getWalletPaymentMethodList(
    @Request() req,
    @Param('walletId') walletId: string,
  ) {
    const ownerId = req.user.id || req.user.sub;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.walletService.getPaymentMethods(walletId);

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Get('/withdrawals/:businessId')
  async getWithdrawalsList(
    @Request() req,
    @Param('businessId') businessId: string,
  ) {
    const ownerId = req.user.id || req.user.sub;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.walletService.getBusinessWithdrawals(businessId);

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Get('/transaction-history/:walletId')
  async getTransactionHistory(
    @Request() req,
    @Param('walletId') walletId: string,
    @Query() filters: TransactionFiltersDto,
  ) {
    const ownerId = req.user.id || req.user.sub;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.walletService.getTransactionHistory(
      walletId,
      filters,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Patch('/debit')
  async debitWallet(@Request() req, @Body() body: DebitWalletRequestDto) {
    const ownerId = req.user.id || req.user.sub;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const result = await this.walletService.deductFunds(body);

      return {
        success: true,
        data: {
          transaction: result.transaction,
          withdrawal: result.withdrawal,
        },
        message: 'Business Wallet debited successfully',
      };
    } catch (error) {
      console.log('Failed to debit business wallet error:', error);
      return {
        success: false,
        error: error.message,
        message: `Failed to debit business wallet: ${error.message}`,
      };
    }
  }
}

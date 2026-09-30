import {
  Body,
  Controller,
  ForbiddenException,
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
  AirwallexFormSchemaDto,
  CreateAirwallexBeneficiaryDto,
  CreateWalletDto,
  DebitWalletRequestDto,
  StripeConnectOnboardingDto,
  TransactionFiltersDto,
  UpdatePayoutCurrencyDto,
  WithdrawalPreviewDto,
} from '../dtos/requests/WalletDto';
import { BusinessWalletService } from '../services/wallet.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../entities/business.entity';
import { assertCanManageBusiness } from '../utils/business-access';
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
  constructor(
    private readonly walletService: BusinessWalletService,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
  ) {}

  // A merchant can only use the wallet of the business they own (a platform admin can use any).
  // Without this, a wallet id or business id from anywhere would read, add payout accounts to, or
  // withdraw from someone else's wallet.
  private assertOwnsWallet(wallet: { ownerId?: string }, user: any): void {
    if (user?.isStaff) return;
    const userId = user?.id ?? user?.sub;
    if (!userId || wallet.ownerId !== userId) {
      throw new ForbiddenException('You can only use your own wallet');
    }
  }

  private async assertOwnsWalletById(walletId: string, user: any): Promise<void> {
    this.assertOwnsWallet(await this.walletService.getWalletById(walletId), user);
  }

  private async assertOwnsBusinessWallet(businessId: string, user: any): Promise<void> {
    this.assertOwnsWallet(await this.walletService.getWalletByBusinessId(businessId), user);
  }

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

    const business = await this.businessRepository.findOne({ where: { id: createWalletData.businessId } });
    if (!business) {
      throw new HttpException('Business not found', HttpStatus.NOT_FOUND);
    }
    assertCanManageBusiness(req.user, business);

    const result = await this.walletService.createWalletForBusiness({
      ...createWalletData,
      ownerId: business.ownerId,
    });

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

    await this.assertOwnsWalletById(paymentMethodData.walletId, req.user);
    const result = await this.walletService.addPaymentMethod(paymentMethodData);

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  // Adds a payout currency to a bank/card saved before this feature existed
  // — without it, that account is invisible in the withdraw flow (see
  // BusinessWalletService.updatePayoutCurrency).
  @Patch('/payment-method/:id/payout-currency')
  async updatePayoutCurrency(
    @Request() req,
    @Param('id') id: string,
    @Body() body: UpdatePayoutCurrencyDto,
  ) {
    await this.assertOwnsWalletById(body.walletId, req.user);
    const result = await this.walletService.updatePayoutCurrency(id, body.walletId, {
      payoutCurrency: body.payoutCurrency,
      country: body.country,
    });

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

    await this.assertOwnsWalletById(walletId, req.user);
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

    await this.assertOwnsBusinessWallet(businessId, req.user);
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

    await this.assertOwnsWalletById(walletId, req.user);
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

  // Pure read — what the merchant would actually receive if they withdrew
  // this amount right now, in their chosen payout method's currency.
  // Safe to call on every amount keystroke or payout-method change.
  @Post('/withdrawal-preview')
  async previewWithdrawal(@Request() req, @Body() body: WithdrawalPreviewDto) {
    await this.assertOwnsWalletById(body.walletId, req.user);
    const wallet = await this.walletService.getWalletById(body.walletId);
    const preview = await this.walletService.previewWithdrawal({
      businessId: wallet.businessId,
      amount: body.amount,
      bankDetailsId: body.bankDetailsId,
    });
    return { success: true, data: preview };
  }

  // A hosted Stripe onboarding URL for automatic payouts — the merchant is
  // redirected to Stripe's own pages to connect (or finish connecting) an
  // Express account; this app never collects their bank details directly
  // for this path.
  @Post('/stripe-connect/onboarding-link')
  async getStripeConnectOnboardingLink(
    @Request() req,
    @Body() body: StripeConnectOnboardingDto,
  ) {
    await this.assertOwnsWalletById(body.walletId, req.user);
    const wallet = await this.walletService.getWalletById(body.walletId);
    const result = await this.walletService.getOrCreateStripeConnectOnboardingLink({
      walletId: body.walletId,
      businessId: wallet.businessId,
      payoutCurrency: body.payoutCurrency,
    });
    return { success: true, data: result };
  }

  // The dynamic, per-corridor required-field list for the Airwallex
  // beneficiary form — Airwallex's own recommended mechanism, so this app
  // never hardcodes per-country bank-field requirements. No wallet-scoped
  // ownership check needed (no wallet id involved, just a field-schema
  // lookup for whatever country the merchant is in).
  @Post('/airwallex/form-schema')
  async getAirwallexFormSchema(@Body() body: AirwallexFormSchemaDto) {
    const schema = await this.walletService.getAirwallexFormSchema({
      country: body.country,
      currency: body.currency,
      transferMethod: body.transferMethod,
      localClearingSystem: body.localClearingSystem,
    });
    return { success: true, data: schema };
  }

  // Creates the merchant's Airwallex Beneficiary — this app collects their
  // bank details directly (unlike Stripe's hosted redirect) because
  // Airwallex's Beneficiaries+Transfers model has no per-merchant
  // sub-account to hold them on its own side.
  @Post('/airwallex/beneficiary')
  async createAirwallexBeneficiary(
    @Request() req,
    @Body() body: CreateAirwallexBeneficiaryDto,
  ) {
    await this.assertOwnsWalletById(body.walletId, req.user);
    const wallet = await this.walletService.getWalletById(body.walletId);
    const method = await this.walletService.createAirwallexBeneficiary({
      walletId: body.walletId,
      businessId: wallet.businessId,
      country: body.country,
      currency: body.currency,
      transferMethod: body.transferMethod,
      localClearingSystem: body.localClearingSystem,
      answers: body.answers,
    });
    return { success: true, data: method };
  }

  // On-demand confirmation of an in-flight Airwallex transfer — the only
  // confirmation path in this first version (no webhook wired yet). A
  // no-op unless the withdrawal is currently 'Submitted'.
  @Patch('/withdrawals/:withdrawalId/refresh-status')
  async refreshWithdrawalStatus(
    @Request() req,
    @Param('withdrawalId') withdrawalId: string,
  ) {
    const withdrawal = await this.walletService.refreshAirwallexWithdrawalStatus(
      withdrawalId,
      req.user,
    );
    return { success: true, data: withdrawal };
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

    await this.assertOwnsBusinessWallet(body.transaction.businessId, req.user);

    // Errors (not enough money, no such payout account) are thrown as they are, so the caller
    // gets a real error status and message instead of a "200 OK" that looks like it worked.
    const result = await this.walletService.deductFunds(body);

    return {
      success: true,
      data: {
        transaction: result.transaction,
        withdrawal: result.withdrawal,
      },
      message: 'Withdrawal requested',
    };
  }

  // A salon takes back a withdrawal request that KHS hasn't started on. The amount goes back to the wallet.
  @Patch('/withdrawals/:withdrawalId/cancel')
  async cancelWithdrawal(@Request() req, @Param('withdrawalId') withdrawalId: string) {
    const withdrawal = await this.walletService.cancelWithdrawal(withdrawalId, req.user);
    return { success: true, data: withdrawal, message: 'Withdrawal request cancelled' };
  }

  // A salon pulls an admin-approved withdrawal to their own connected Stripe
  // account, themselves — the real transfer fires here, not when the admin
  // approved it. Only ever succeeds for a Stripe-Connect-eligible payout
  // method; anything else still needs an admin to send it by hand.
  @Patch('/withdrawals/:withdrawalId/claim')
  async claimWithdrawal(@Request() req, @Param('withdrawalId') withdrawalId: string) {
    const withdrawal = await this.walletService.claimAutomaticPayout(withdrawalId, req.user);
    return { success: true, data: withdrawal, message: 'Withdrawal sent to your Stripe account' };
  }
}

import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';
import { Public } from '../middlewares/public.decorator';
import { MerchantPlansService } from '../services/merchant-plans.service';
import { MerchantSignupService } from '../services/merchant-signup.service';
import { SignupSubscribeDto } from '../dtos/requests/SignupChoiceDto';

// The last step of merchant sign-up. Whoever is signing up is still a customer account
// (they become a merchant when the business is created), so both roles are allowed.
@ApiTags('Merchant Sign-up')
@Controller('merchant-signup')
export class MerchantSignupController {
  constructor(
    private readonly plans: MerchantPlansService,
    private readonly signup: MerchantSignupService,
  ) {}

  /** The options and prices to show, with the free window's countdown from the server clock. */
  @Get('plans')
  @Public()
  getPlans() {
    return this.plans.getPublicPlans();
  }

  /** A Stripe customer for this user and a SetupIntent to save their card. */
  @Post('setup-intent')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Customer, Role.Merchant)
  createSetupIntent(@Req() req: any) {
    return this.signup.createSetupIntent(req.user);
  }

  /** Charge the first month of the chosen plan. Safe to repeat: it will not charge twice. */
  @Post('subscribe')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Customer, Role.Merchant)
  subscribe(@Req() req: any, @Body() body: SignupSubscribeDto) {
    return this.signup.subscribe(req.user, body);
  }
}

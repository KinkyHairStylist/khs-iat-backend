import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PLAN_TIERS, SIGNUP_OPTIONS } from 'src/helpers/merchant-plans.helper';
import type { PlanTier, SignupOption } from 'src/helpers/merchant-plans.helper';

// How the merchant is starting: a paid plan, Trial or MVP.
export class SignupChoiceDto {
  @IsIn(SIGNUP_OPTIONS, { message: 'Choose a plan to start: Trial, MVP or a paid plan.' })
  readonly option: SignupOption;

  // Required when option is "paid".
  @IsIn(PLAN_TIERS)
  @IsOptional()
  readonly tier?: PlanTier;

  // The Stripe subscription created (and charged) at sign-up. Required when option is "paid".
  @IsString()
  @MaxLength(100)
  @IsOptional()
  readonly stripeSubscriptionId?: string;
}

export class SignupSetupIntentResponse {
  clientSecret: string;
  customerId: string;
}

export class SignupSubscribeDto {
  @IsIn(PLAN_TIERS)
  readonly tier: PlanTier;

  @IsString()
  @MaxLength(100)
  readonly paymentMethodId: string;

  @IsString()
  @MaxLength(100)
  readonly customerId: string;
}
